import type { APIRoute } from "astro";
import Stripe from "stripe";

type BillingStatus = "monthly" | "yearly" | "free" | "expired" | "early_access" | "owner";

type EntitlementRow = {
  entitlement_key: string | null;
  license_key: string;
  status: BillingStatus;
  current_period_end: number | null;
  early_access_expires_at: number | null;
  stripe_subscription_id: string | null;
  cancel_at_period_end: number | null;
  price_id: string | null;
  updated_at: number;
};

export const postBillingEntitlement: APIRoute = async ({ request, locals }) => {
  const env = locals.runtime.env;
  const origin = env.ALLOWED_ORIGIN ?? "*";
  const headers = jsonHeaders(origin);

  let entitlementKey: string;
  try {
    const body = await request.json();
    entitlementKey = body.entitlementKey ?? body.licenseKey;
    if (!entitlementKey || typeof entitlementKey !== "string") {
      return json({ message: "entitlementKey is required" }, 400, headers);
    }
  } catch {
    return json({ message: "リクエスト内容が正しくありません" }, 400, headers);
  }

  const row = await env.DB
    .prepare(
      `SELECT entitlement_key, license_key, status, current_period_end,
              early_access_expires_at, stripe_subscription_id,
              cancel_at_period_end, price_id, updated_at
       FROM subscriptions
       WHERE entitlement_key = ? OR license_key = ?`
    )
    .bind(entitlementKey, entitlementKey)
    .first<EntitlementRow>();

  if (!row) {
    return json(
      {
        billingStatus: "free",
        currentPeriodEnd: null,
        cancelAtPeriodEnd: false,
        entitlementKey,
      },
      200,
      headers
    );
  }

  const resolvedRow = await refreshStripeSubscription(row, env).catch(() => row);

  return json(toEntitlementResponse(resolvedRow), 200, headers);
};

export const optionsBillingEntitlement: APIRoute = ({ locals }) => {
  const origin = locals.runtime.env.ALLOWED_ORIGIN ?? "*";
  return new Response(null, { status: 204, headers: corsHeaders(origin) });
};

export function toEntitlementResponse(row: EntitlementRow) {
  const now = Math.floor(Date.now() / 1000);
  const periodEnd = row.current_period_end;
  const hasActivePaidPeriod =
    (row.status === "monthly" || row.status === "yearly") &&
    periodEnd != null &&
    periodEnd > now;

  const billingStatus = hasActivePaidPeriod
    ? row.status
    : row.status === "owner" || row.status === "early_access"
      ? row.status
      : row.status === "free"
        ? "free"
        : "expired";

  return {
    billingStatus,
    currentPeriodEnd: periodEnd ? toIso(periodEnd) : null,
    cancelAtPeriodEnd: row.cancel_at_period_end === 1,
    entitlementKey: row.entitlement_key ?? row.license_key,
  };
}

async function refreshStripeSubscription(
  row: EntitlementRow,
  env: App.Locals["runtime"]["env"]
): Promise<EntitlementRow> {
  if (
    !env.STRIPE_SECRET_KEY ||
    !row.stripe_subscription_id ||
    (row.status !== "monthly" && row.status !== "yearly")
  ) {
    return row;
  }

  const stripe = new Stripe(env.STRIPE_SECRET_KEY);
  const subscription = await stripe.subscriptions.retrieve(row.stripe_subscription_id);
  const item = subscription.items.data[0];
  const priceId = item?.price?.id ?? row.price_id ?? "";
  const currentPeriodEnd = item?.current_period_end ?? row.current_period_end;
  const now = Math.floor(Date.now() / 1000);
  const active =
    subscription.status === "active" || subscription.status === "trialing";
  const status = active ? planFromPriceId(priceId, row.status, env) : "expired";
  const cancelAtPeriodEnd = isSubscriptionCancelScheduled(subscription, now)
    ? 1
    : 0;

  await env.DB
    .prepare(
      `UPDATE subscriptions
       SET status = ?,
           current_period_end = ?,
           cancel_at_period_end = ?,
           price_id = ?,
           updated_at = ?
       WHERE license_key = ?`
    )
    .bind(
      status,
      currentPeriodEnd,
      cancelAtPeriodEnd,
      priceId,
      now,
      row.license_key
    )
    .run();

  return {
    ...row,
    status,
    current_period_end: currentPeriodEnd,
    cancel_at_period_end: cancelAtPeriodEnd,
    price_id: priceId,
    updated_at: now,
  };
}

function isSubscriptionCancelScheduled(
  subscription: Stripe.Subscription,
  now: number
): boolean {
  return (
    subscription.cancel_at_period_end ||
    (typeof subscription.cancel_at === "number" && subscription.cancel_at > now)
  );
}

function planFromPriceId(
  priceId: string,
  fallback: BillingStatus,
  env: App.Locals["runtime"]["env"]
): BillingStatus {
  if (priceId === env.STRIPE_YEARLY_PRICE_ID) {
    return "yearly";
  }

  if (priceId === env.STRIPE_MONTHLY_PRICE_ID) {
    return "monthly";
  }

  return fallback === "monthly" || fallback === "yearly" ? fallback : "expired";
}

function corsHeaders(origin: string) {
  return {
    "Access-Control-Allow-Origin": origin,
    "Access-Control-Allow-Methods": "POST, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type",
  };
}

function jsonHeaders(origin: string) {
  return {
    ...corsHeaders(origin),
    "Content-Type": "application/json",
  };
}

function json(body: unknown, status: number, headers: HeadersInit) {
  return new Response(JSON.stringify(body), { status, headers });
}

function toIso(timestamp: number): string {
  return new Date(timestamp * 1000).toISOString();
}
