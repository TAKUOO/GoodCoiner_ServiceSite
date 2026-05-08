import type { APIRoute } from "astro";

export const prerender = false;

type SubscriptionRow = {
  license_key: string;
  status: string;
  current_period_end: number | null;
  early_access_expires_at: number | null;
};

type ResolvedStatus = {
  status: string;
  currentPeriodEnd?: string;
  earlyAccessExpiresAt?: string;
};

function resolveStatus(row: SubscriptionRow): ResolvedStatus {
  const now = Math.floor(Date.now() / 1000);

  switch (row.status) {
    case "owner":
      return { status: "owner" };

    case "early_access": {
      const valid =
        row.early_access_expires_at != null &&
        row.early_access_expires_at > now;
      return valid
        ? {
            status: "early_access",
            earlyAccessExpiresAt: new Date(
              row.early_access_expires_at! * 1000
            ).toISOString(),
          }
        : { status: "expired" };
    }

    case "monthly":
    case "yearly": {
      const valid =
        row.current_period_end != null && row.current_period_end > now;
      return valid
        ? {
            status: row.status,
            currentPeriodEnd: new Date(
              row.current_period_end! * 1000
            ).toISOString(),
          }
        : { status: "expired" };
    }

    default:
      return { status: row.status };
  }
}

function corsHeaders(origin: string) {
  return {
    "Content-Type": "application/json",
    "Access-Control-Allow-Origin": origin,
    "Access-Control-Allow-Methods": "POST, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type",
  };
}

export const OPTIONS: APIRoute = ({ locals }) => {
  const origin = locals.runtime.env.ALLOWED_ORIGIN ?? "*";
  return new Response(null, { status: 204, headers: corsHeaders(origin) });
};

export const POST: APIRoute = async ({ request, locals }) => {
  const env = locals.runtime.env;
  const origin = env.ALLOWED_ORIGIN ?? "*";

  let licenseKey: string;
  try {
    const body = await request.json();
    licenseKey = body.licenseKey;
  } catch {
    return new Response(
      JSON.stringify({ error: "Invalid request body" }),
      { status: 400, headers: corsHeaders(origin) }
    );
  }

  if (!licenseKey) {
    return new Response(
      JSON.stringify({ error: "licenseKey is required" }),
      { status: 400, headers: corsHeaders(origin) }
    );
  }

  const row = await env.DB
    .prepare(
      `SELECT license_key, status, current_period_end, early_access_expires_at
       FROM subscriptions
       WHERE license_key = ?`
    )
    .bind(licenseKey)
    .first<SubscriptionRow>();

  if (!row) {
    return new Response(
      JSON.stringify({ status: "free" }),
      { status: 200, headers: corsHeaders(origin) }
    );
  }

  return new Response(
    JSON.stringify(resolveStatus(row)),
    { status: 200, headers: corsHeaders(origin) }
  );
};
