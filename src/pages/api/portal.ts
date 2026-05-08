import type { APIRoute } from "astro";
import Stripe from "stripe";

export const prerender = false;

function corsHeaders(origin: string) {
  return {
    "Access-Control-Allow-Origin": origin,
    "Access-Control-Allow-Methods": "POST, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type",
  };
}

export const OPTIONS: APIRoute = async ({ locals }) => {
  const env = locals.runtime.env;
  return new Response(null, {
    status: 204,
    headers: corsHeaders(env.ALLOWED_ORIGIN),
  });
};

export const POST: APIRoute = async ({ request, locals }) => {
  const env = locals.runtime.env;
  const headers = { ...corsHeaders(env.ALLOWED_ORIGIN), "Content-Type": "application/json" };

  let licenseKey: string;
  try {
    const body = await request.json();
    licenseKey = body.licenseKey;
    if (!licenseKey || typeof licenseKey !== "string") throw new Error();
  } catch {
    return new Response(JSON.stringify({ error: "Invalid request" }), { status: 400, headers });
  }

  const db = env.DB;
  const sub = await db
    .prepare(`SELECT stripe_customer_id FROM subscriptions WHERE license_key = ?`)
    .bind(licenseKey)
    .first<{ stripe_customer_id: string | null }>();

  if (!sub?.stripe_customer_id) {
    return new Response(JSON.stringify({ error: "Subscription not found" }), { status: 404, headers });
  }

  const stripe = new Stripe(env.STRIPE_SECRET_KEY);
  const session = await stripe.billingPortal.sessions.create({
    customer: sub.stripe_customer_id,
    return_url: env.PUBLIC_SITE_URL,
  });

  return new Response(JSON.stringify({ url: session.url }), { status: 200, headers });
};
