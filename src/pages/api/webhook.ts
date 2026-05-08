import type { APIRoute } from "astro";
import Stripe from "stripe";

export const prerender = false;

export const POST: APIRoute = async ({ request, locals }) => {
  const env = locals.runtime.env;
  const stripe = new Stripe(env.STRIPE_SECRET_KEY);

  const signature = request.headers.get("stripe-signature");
  if (!signature) {
    return new Response("Missing stripe-signature", { status: 400 });
  }

  let event: Stripe.Event;
  try {
    const rawBody = await request.text();
    event = await stripe.webhooks.constructEventAsync(
      rawBody,
      signature,
      env.STRIPE_WEBHOOK_SECRET
    );
  } catch (err) {
    console.error("Webhook signature verification failed:", err);
    return new Response("Invalid signature", { status: 400 });
  }

  const db = env.DB;
  const now = Math.floor(Date.now() / 1000);

  try {
    switch (event.type) {
      case "checkout.session.completed": {
        const session = event.data.object as Stripe.Checkout.Session;
        if (session.mode !== "subscription") break;

        const licenseKey = session.metadata?.licenseKey;
        const plan = session.metadata?.plan as "monthly" | "yearly" | undefined;
        if (!licenseKey || !plan) {
          console.error("Missing licenseKey or plan in session metadata", session.id);
          break;
        }

        const subscriptionId = session.subscription as string;
        const subscription = await stripe.subscriptions.retrieve(subscriptionId);

        // v22+: current_period_end は SubscriptionItem に移動
        const periodEnd = subscription.items.data[0]?.current_period_end ?? null;

        await db
          .prepare(
            `INSERT INTO subscriptions
               (id, license_key, stripe_customer_id, stripe_subscription_id,
                status, current_period_end, created_at, updated_at)
             VALUES (?, ?, ?, ?, ?, ?, ?, ?)
             ON CONFLICT(license_key) DO UPDATE SET
               stripe_customer_id     = excluded.stripe_customer_id,
               stripe_subscription_id = excluded.stripe_subscription_id,
               status                 = excluded.status,
               current_period_end     = excluded.current_period_end,
               updated_at             = excluded.updated_at`
          )
          .bind(
            crypto.randomUUID(),
            licenseKey,
            session.customer as string,
            subscriptionId,
            plan,
            periodEnd,
            now,
            now
          )
          .run();
        break;
      }

      case "customer.subscription.updated": {
        const sub = event.data.object as Stripe.Subscription;
        if (sub.status === "active") {
          // 更新成功（自動更新など）→ 期限だけ延長（v22+: SubscriptionItem から取得）
          const updatedPeriodEnd = sub.items.data[0]?.current_period_end ?? null;
          await db
            .prepare(
              `UPDATE subscriptions
               SET current_period_end = ?, updated_at = ?
               WHERE stripe_subscription_id = ?`
            )
            .bind(updatedPeriodEnd, now, sub.id)
            .run();
        } else if (sub.status === "past_due" || sub.status === "unpaid") {
          // 支払い失敗 → expired 扱い
          await db
            .prepare(
              `UPDATE subscriptions
               SET status = 'expired', updated_at = ?
               WHERE stripe_subscription_id = ?`
            )
            .bind(now, sub.id)
            .run();
        }
        break;
      }

      case "customer.subscription.deleted": {
        const sub = event.data.object as Stripe.Subscription;
        await db
          .prepare(
            `UPDATE subscriptions
             SET status = 'expired', updated_at = ?
             WHERE stripe_subscription_id = ?`
          )
          .bind(now, sub.id)
          .run();
        break;
      }

      case "invoice.payment_succeeded": {
        const invoice = event.data.object as Stripe.Invoice;
        // v22+: subscription は invoice.parent.subscription_details.subscription に移動
        const rawSub = invoice.parent?.subscription_details?.subscription;
        if (!rawSub) break;
        const subscriptionId =
          typeof rawSub === "string" ? rawSub : rawSub.id;

        // 最新の current_period_end を Subscription から取得（v22+: SubscriptionItem に存在）
        const subscription = await stripe.subscriptions.retrieve(subscriptionId);
        const periodEnd = subscription.items.data[0]?.current_period_end ?? null;
        const plan = subscription.metadata?.plan as string | undefined;

        await db
          .prepare(
            // 支払い回収済みになった場合、期限を延長しつつ expired だったステータスも復元する
            `UPDATE subscriptions
             SET current_period_end = ?,
                 status = CASE
                   WHEN status = 'expired' AND ? IS NOT NULL THEN ?
                   ELSE status
                 END,
                 updated_at = ?
             WHERE stripe_subscription_id = ?`
          )
          .bind(periodEnd, plan ?? null, plan ?? null, now, subscriptionId)
          .run();
        break;
      }

      default:
        break;
    }
  } catch (err) {
    console.error("Webhook handler error:", err);
    return new Response("Handler error", { status: 500 });
  }

  return new Response(JSON.stringify({ received: true }), {
    status: 200,
    headers: { "Content-Type": "application/json" },
  });
};
