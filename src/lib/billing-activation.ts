import type { APIRoute } from "astro";
import Stripe from "stripe";
import { withEntitlementToken } from "./entitlement-token";

type BillingStatus =
  | "monthly"
  | "yearly"
  | "free"
  | "expired"
  | "early_access"
  | "owner";

type ActivationTokenRow = {
  token: string;
  license_key: string;
  expires_at: number;
  used_at: number | null;
};

type SubscriptionRow = {
  license_key: string;
  entitlement_key: string | null;
  status: BillingStatus;
  current_period_end: number | null;
  early_access_expires_at: number | null;
  stripe_subscription_id: string | null;
  cancel_at_period_end: number | null;
};

export const postBillingActivate: APIRoute = async ({ request, locals }) => {
  const env = locals.runtime.env;
  const origin = env.ALLOWED_ORIGIN ?? "*";
  const headers = jsonHeaders(origin);

  let token: string;
  try {
    const body = await request.json();
    token = body.token;
    if (!token || typeof token !== "string") {
      return json({ message: "決済連携コードが正しくありません" }, 400, headers);
    }
  } catch {
    return json({ message: "リクエスト内容が正しくありません" }, 400, headers);
  }

  const db = env.DB;
  const now = Math.floor(Date.now() / 1000);

  const activationToken = await db
    .prepare(
      `SELECT token, license_key, expires_at, used_at
       FROM activation_tokens
       WHERE token = ?`
    )
    .bind(token)
    .first<ActivationTokenRow>();

  if (!activationToken) {
    return json({ message: "決済連携コードが見つかりません" }, 404, headers);
  }

  if (activationToken.expires_at < now) {
    return json({ message: "この決済連携コードは期限切れです" }, 410, headers);
  }

  if (activationToken.used_at) {
    return json({ message: "この決済連携コードはすでに使用済みです" }, 409, headers);
  }

  let subscription = await db
    .prepare(
      `SELECT license_key, entitlement_key, status, current_period_end,
              early_access_expires_at, stripe_subscription_id, cancel_at_period_end
       FROM subscriptions
       WHERE license_key = ?`
    )
    .bind(activationToken.license_key)
    .first<SubscriptionRow>();

  if (!subscription) {
    try {
      subscription = await recoverSubscriptionFromStripe(
        activationToken.license_key,
        env,
        now
      );
    } catch {
      console.error("Billing activation recovery error");
      return json(
        { message: "決済情報の反映中です。少し待ってから再試行してください" },
        409,
        headers
      );
    }

    if (!subscription) {
      return json(
        { message: "決済情報の反映中です。少し待ってから再試行してください" },
        409,
        headers
      );
    }
  }

  let resolved: Awaited<ReturnType<typeof resolveBillingStatus>>;
  try {
    resolved = await resolveBillingStatus(subscription, env, now);
  } catch {
    console.error("Billing activation verification error");
    return json(
      { message: "決済状態の確認に失敗しました。少し待ってから再試行してください" },
      409,
      headers
    );
  }
  if (!resolved.ok) {
    return json({ message: resolved.message }, resolved.status, headers);
  }

  await db
    .prepare(`UPDATE activation_tokens SET used_at = ? WHERE token = ?`)
    .bind(now, activationToken.token)
    .run();

  // アプリはここで受け取った署名トークンを保存し、以後の有料判定の根拠にする
  return json(
    await withEntitlementToken(env, {
      billingStatus: resolved.billingStatus,
      currentPeriodEnd: resolved.currentPeriodEnd,
      cancelAtPeriodEnd: resolved.cancelAtPeriodEnd,
      entitlementKey: resolved.entitlementKey,
    }),
    200,
    headers
  );
};

export const optionsBillingActivate: APIRoute = ({ locals }) => {
  const origin = locals.runtime.env.ALLOWED_ORIGIN ?? "*";
  return new Response(null, { status: 204, headers: corsHeaders(origin) });
};

async function resolveBillingStatus(
  row: SubscriptionRow,
  env: App.Locals["runtime"]["env"],
  now: number
): Promise<
  | {
      ok: true;
      billingStatus: BillingStatus;
      currentPeriodEnd?: string;
      cancelAtPeriodEnd: boolean;
      entitlementKey: string;
    }
  | { ok: false; status: number; message: string }
> {
  const entitlementKey = row.entitlement_key ?? row.license_key;
  let cancelAtPeriodEnd = row.cancel_at_period_end === 1;

  if (row.status === "owner") {
    return {
      ok: true,
      billingStatus: "owner",
      cancelAtPeriodEnd,
      entitlementKey,
    };
  }

  if (row.status === "early_access") {
    const earlyAccessExpiresAt = row.early_access_expires_at;
    const valid =
      earlyAccessExpiresAt != null && earlyAccessExpiresAt > now;
    return valid
      ? {
          ok: true,
          billingStatus: "early_access",
          currentPeriodEnd: toIso(earlyAccessExpiresAt),
          cancelAtPeriodEnd,
          entitlementKey,
        }
      : {
          ok: false,
          status: 410,
          message: "早期アクセス期間が終了しています",
        };
  }

  if (row.status !== "monthly" && row.status !== "yearly") {
    return {
      ok: false,
      status: 401,
      message: "有効な課金状態が確認できません",
    };
  }

  if (!row.stripe_subscription_id) {
    return {
      ok: false,
      status: 409,
      message: "Stripeの購読情報を確認できません。少し待ってから再試行してください",
    };
  }

  const stripe = new Stripe(env.STRIPE_SECRET_KEY);
  const stripeSubscription = await stripe.subscriptions.retrieve(
    row.stripe_subscription_id
  );

  if (stripeSubscription.status !== "active") {
    return {
      ok: false,
      status: 401,
      message: "Stripeの支払い状態が有効ではありません",
    };
  }

  const periodEnd =
    stripeSubscription.items.data[0]?.current_period_end ??
    row.current_period_end;
  cancelAtPeriodEnd =
    stripeSubscription.cancel_at_period_end ||
    (typeof stripeSubscription.cancel_at === "number" &&
      stripeSubscription.cancel_at > now);

  if (!periodEnd || periodEnd <= now) {
    return {
      ok: false,
      status: 410,
      message: "購読期間が終了しています",
    };
  }

  return {
    ok: true,
    billingStatus: row.status,
    currentPeriodEnd: toIso(periodEnd),
    cancelAtPeriodEnd,
    entitlementKey,
  };
}

async function recoverSubscriptionFromStripe(
  licenseKey: string,
  env: App.Locals["runtime"]["env"],
  now: number
): Promise<SubscriptionRow | null> {
  const stripe = new Stripe(env.STRIPE_SECRET_KEY);
  const subscriptions = await stripe.subscriptions.search({
    query: `metadata['licenseKey']:'${licenseKey}' AND status:'active'`,
    limit: 1,
  });
  const stripeSubscription = subscriptions.data[0];
  const plan = stripeSubscription?.metadata?.plan;

  if (!stripeSubscription || (plan !== "monthly" && plan !== "yearly")) {
    return null;
  }

  const periodEnd =
    stripeSubscription.items.data[0]?.current_period_end ?? null;
  const priceId = stripeSubscription.items.data[0]?.price?.id ?? "";

  await env.DB
    .prepare(
      `INSERT INTO subscriptions
         (id, license_key, entitlement_key, stripe_customer_id, stripe_subscription_id,
          status, current_period_end, cancel_at_period_end, price_id, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
       ON CONFLICT(license_key) DO UPDATE SET
         entitlement_key         = excluded.entitlement_key,
         stripe_customer_id     = excluded.stripe_customer_id,
         stripe_subscription_id = excluded.stripe_subscription_id,
         status                 = excluded.status,
         current_period_end     = excluded.current_period_end,
         cancel_at_period_end   = excluded.cancel_at_period_end,
         price_id               = excluded.price_id,
         updated_at             = excluded.updated_at`
    )
    .bind(
      crypto.randomUUID(),
      licenseKey,
      licenseKey,
      stripeSubscription.customer as string,
      stripeSubscription.id,
      plan,
      periodEnd,
      stripeSubscription.cancel_at_period_end ? 1 : 0,
      priceId,
      now,
      now
    )
    .run();

  return {
    license_key: licenseKey,
    entitlement_key: licenseKey,
    status: plan,
    current_period_end: periodEnd,
    early_access_expires_at: null,
    stripe_subscription_id: stripeSubscription.id,
    cancel_at_period_end: stripeSubscription.cancel_at_period_end ? 1 : 0,
  };
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
