import type { APIRoute } from "astro";
import Stripe from "stripe";

function corsHeaders(origin = "*") {
  return {
    "Access-Control-Allow-Origin": origin,
    "Access-Control-Allow-Methods": "POST, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type",
  };
}

function json(body: unknown, status: number, headers: HeadersInit) {
  return new Response(JSON.stringify(body), { status, headers });
}

function normalizeSiteUrl(url: string | undefined): string {
  return (url || "https://goodcoiner.com").replace(/\/+$/, "");
}

export const optionsBillingPortal: APIRoute = async ({ locals }) => {
  const env = locals.runtime.env;
  return new Response(null, {
    status: 204,
    headers: corsHeaders(env.ALLOWED_ORIGIN),
  });
};

export const postBillingPortal: APIRoute = async ({ request, locals }) => {
  const env = locals.runtime.env;
  const headers = {
    ...corsHeaders(env.ALLOWED_ORIGIN),
    "Content-Type": "application/json",
  };

  let entitlementKey: string;
  try {
    const body = await request.json();
    const key = body.entitlementKey ?? body.licenseKey;
    if (!key || typeof key !== "string") throw new Error();
    entitlementKey = key;
  } catch {
    return json({ error: "Invalid request" }, 400, headers);
  }

  const sub = await env.DB
    .prepare(
      `SELECT stripe_customer_id
       FROM subscriptions
       WHERE entitlement_key = ? OR license_key = ?`
    )
    .bind(entitlementKey, entitlementKey)
    .first<{ stripe_customer_id: string | null }>();

  if (!sub?.stripe_customer_id) {
    return json({ error: "Subscription not found" }, 404, headers);
  }

  const stripe = new Stripe(env.STRIPE_SECRET_KEY);
  const session = await stripe.billingPortal.sessions.create({
    customer: sub.stripe_customer_id,
    return_url: normalizeSiteUrl(env.PUBLIC_SERVICE_SITE_URL ?? env.PUBLIC_SITE_URL),
  });

  return json({ url: session.url }, 200, headers);
};
