import type { APIRoute } from "astro";

type BillingStatus = "monthly" | "yearly" | "free" | "expired" | "early_access" | "owner";

type EntitlementRow = {
  entitlement_key: string | null;
  license_key: string;
  status: BillingStatus;
  current_period_end: number | null;
  early_access_expires_at: number | null;
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
              early_access_expires_at, cancel_at_period_end, price_id, updated_at
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

  return json(toEntitlementResponse(row), 200, headers);
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
