import type { APIRoute } from "astro";
import Stripe from "stripe";

type BillingStatus = "monthly" | "yearly" | "expired" | "free";

type EntitlementInput = {
  entitlementKey: string;
  stripeCustomerId: string;
  stripeSubscriptionId: string;
  billingStatus: BillingStatus;
  currentPeriodEnd: number | null;
  cancelAtPeriodEnd: boolean;
  priceId: string;
  updatedAt: number;
};

const isSubscriptionCancelScheduled = (
  subscription: Stripe.Subscription,
  now: number
): boolean =>
  subscription.cancel_at_period_end ||
  (typeof subscription.cancel_at === "number" && subscription.cancel_at > now);

export const postBillingWebhook: APIRoute = async ({ request, locals }) => {
  const env = locals.runtime.env;

  if (!env.STRIPE_SECRET_KEY || !env.STRIPE_WEBHOOK_SECRET) {
    return new Response("Webhook not configured", { status: 500 });
  }

  const signature = request.headers.get("stripe-signature");
  if (!signature) {
    return new Response("Missing stripe-signature", { status: 400 });
  }

  const stripe = new Stripe(env.STRIPE_SECRET_KEY);
  let event: Stripe.Event;

  try {
    const rawBody = await request.text();
    event = await stripe.webhooks.constructEventAsync(
      rawBody,
      signature,
      env.STRIPE_WEBHOOK_SECRET
    );
  } catch {
    return new Response("Invalid signature", { status: 400 });
  }

  try {
    await handleBillingEvent(event, stripe, env);
  } catch {
    return new Response("Handler error", { status: 500 });
  }

  return json({ received: true }, 200);
};

async function handleBillingEvent(
  event: Stripe.Event,
  stripe: Stripe,
  env: App.Locals["runtime"]["env"]
) {
  const now = Math.floor(Date.now() / 1000);

  switch (event.type) {
    case "checkout.session.completed": {
      const session = event.data.object as Stripe.Checkout.Session;
      if (session.mode !== "subscription") return;

      const subscriptionId = asId(session.subscription);
      const customerId = asId(session.customer);
      if (!subscriptionId || !customerId) return;

      const subscription = await stripe.subscriptions.retrieve(subscriptionId);
      const entitlementKey =
        (await resolveSessionEntitlementKey(session, env)) ??
        (await resolveSubscriptionEntitlementKey(subscription, env));
      if (!entitlementKey) return;

      await upsertStripeSubscription(env, {
        subscription,
        entitlementKey,
        customerId,
        now,
      });
      return;
    }

    case "customer.subscription.created":
    case "customer.subscription.updated": {
      const subscription = event.data.object as Stripe.Subscription;
      const entitlementKey = await resolveSubscriptionEntitlementKey(subscription, env);
      const customerId = asId(subscription.customer);
      if (!entitlementKey || !customerId) return;

      await upsertStripeSubscription(env, {
        subscription,
        entitlementKey,
        customerId,
        now,
      });
      return;
    }

    case "customer.subscription.deleted": {
      const subscription = event.data.object as Stripe.Subscription;
      await expireSubscription(env, subscription.id, now);
      return;
    }

    case "invoice.payment_failed": {
      const invoice = event.data.object as Stripe.Invoice;
      const subscriptionId = getInvoiceSubscriptionId(invoice);
      if (subscriptionId) {
        await expireSubscription(env, subscriptionId, now);
      }
      return;
    }

    case "invoice.payment_succeeded": {
      const invoice = event.data.object as Stripe.Invoice;
      const subscriptionId = getInvoiceSubscriptionId(invoice);
      if (!subscriptionId) return;

      const subscription = await stripe.subscriptions.retrieve(subscriptionId);
      const entitlementKey = await resolveSubscriptionEntitlementKey(subscription, env);
      const customerId = asId(subscription.customer);
      if (!entitlementKey || !customerId) return;

      await upsertStripeSubscription(env, {
        subscription,
        entitlementKey,
        customerId,
        now,
      });
      return;
    }

    default:
      return;
  }
}

async function upsertStripeSubscription(
  env: App.Locals["runtime"]["env"],
  input: {
    subscription: Stripe.Subscription;
    entitlementKey: string;
    customerId: string;
    now: number;
  }
) {
  const item = input.subscription.items.data[0];
  const priceId = item?.price?.id ?? "";
  const active = input.subscription.status === "active" || input.subscription.status === "trialing";
  const billingStatus = active ? planFromPriceId(priceId, env) : "expired";
  const currentPeriodEnd = item?.current_period_end ?? null;

  await upsertEntitlement(env, {
    entitlementKey: input.entitlementKey,
    stripeCustomerId: input.customerId,
    stripeSubscriptionId: input.subscription.id,
    billingStatus,
    currentPeriodEnd,
    cancelAtPeriodEnd: isSubscriptionCancelScheduled(
      input.subscription,
      input.now
    ),
    priceId,
    updatedAt: input.now,
  });
}

async function upsertEntitlement(
  env: App.Locals["runtime"]["env"],
  input: EntitlementInput
) {
  await env.DB
    .prepare(
      `INSERT INTO subscriptions
         (id, license_key, entitlement_key, stripe_customer_id, stripe_subscription_id,
          status, current_period_end, cancel_at_period_end, price_id, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
       ON CONFLICT(license_key) DO UPDATE SET
         entitlement_key         = excluded.entitlement_key,
         stripe_customer_id      = excluded.stripe_customer_id,
         stripe_subscription_id  = excluded.stripe_subscription_id,
         status                  = excluded.status,
         current_period_end      = excluded.current_period_end,
         cancel_at_period_end    = excluded.cancel_at_period_end,
         price_id                = excluded.price_id,
         updated_at              = excluded.updated_at`
    )
    .bind(
      crypto.randomUUID(),
      input.entitlementKey,
      input.entitlementKey,
      input.stripeCustomerId,
      input.stripeSubscriptionId,
      input.billingStatus,
      input.currentPeriodEnd,
      input.cancelAtPeriodEnd ? 1 : 0,
      input.priceId,
      input.updatedAt,
      input.updatedAt
    )
    .run();
}

async function expireSubscription(
  env: App.Locals["runtime"]["env"],
  stripeSubscriptionId: string,
  now: number
) {
  await env.DB
    .prepare(
      `UPDATE subscriptions
       SET status = 'expired',
           cancel_at_period_end = 1,
           updated_at = ?
       WHERE stripe_subscription_id = ?`
    )
    .bind(now, stripeSubscriptionId)
    .run();
}

async function resolveSessionEntitlementKey(
  session: Stripe.Checkout.Session,
  env: App.Locals["runtime"]["env"]
): Promise<string | null> {
  const metadataKey =
    session.metadata?.entitlementKey ??
    session.metadata?.licenseKey ??
    session.client_reference_id;

  if (metadataKey) return metadataKey;

  const activationToken = session.metadata?.activationToken;
  if (!activationToken) return null;

  const row = await env.DB
    .prepare(`SELECT license_key FROM activation_tokens WHERE token = ?`)
    .bind(activationToken)
    .first<{ license_key: string }>();

  return row?.license_key ?? null;
}

async function resolveSubscriptionEntitlementKey(
  subscription: Stripe.Subscription,
  env: App.Locals["runtime"]["env"]
): Promise<string | null> {
  const metadataKey =
    subscription.metadata?.entitlementKey ?? subscription.metadata?.licenseKey;

  if (metadataKey) return metadataKey;

  const row = await env.DB
    .prepare(
      `SELECT entitlement_key, license_key
       FROM subscriptions
       WHERE stripe_subscription_id = ?`
    )
    .bind(subscription.id)
    .first<{ entitlement_key: string | null; license_key: string }>();

  return row?.entitlement_key ?? row?.license_key ?? null;
}

function planFromPriceId(
  priceId: string,
  env: App.Locals["runtime"]["env"]
): BillingStatus {
  if (priceId === env.STRIPE_MONTHLY_PRICE_ID) return "monthly";
  if (priceId === env.STRIPE_YEARLY_PRICE_ID) return "yearly";
  return "expired";
}

function getInvoiceSubscriptionId(invoice: Stripe.Invoice): string | null {
  const parentSubscription =
    invoice.parent?.type === "subscription_details"
      ? invoice.parent.subscription_details?.subscription
      : null;

  return asId(parentSubscription);
}

function asId(value: string | { id: string } | null | undefined): string | null {
  if (!value) return null;
  return typeof value === "string" ? value : value.id;
}

function json(body: unknown, status: number) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}
