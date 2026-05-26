import Stripe from "stripe";

type BillingPlan = "monthly" | "yearly";

type CheckoutEnv = App.Locals["runtime"]["env"];

function corsHeaders(env: CheckoutEnv): Record<string, string> {
  const origin = env.ALLOWED_ORIGIN ?? "*";
  return {
    "Access-Control-Allow-Origin": origin,
    "Access-Control-Allow-Methods": "POST, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type",
  };
}

export function handleCheckoutOptions(locals: App.Locals): Response {
  return new Response(null, {
    status: 204,
    headers: corsHeaders(locals.runtime.env),
  });
}

const DEFAULT_STAGING_SITE_URL = "https://staging.goodcoiner.com";

export async function createCheckoutSession(
  request: Request,
  locals: App.Locals
): Promise<Response> {
  const env = locals.runtime.env;
  const cors = corsHeaders(env);

  let plan: BillingPlan;
  try {
    const body = await request.json();
    if (body.plan !== "monthly" && body.plan !== "yearly") {
      return json({ error: "Invalid plan" }, 400, cors);
    }
    plan = body.plan;
  } catch {
    return json({ error: "Invalid request body" }, 400, cors);
  }

  if (!env.STRIPE_SECRET_KEY) {
    return json({ error: "Stripe secret key not configured" }, 500, cors);
  }

  if (env.PUBLIC_APP_ENV === "staging" && !env.STRIPE_SECRET_KEY.startsWith("sk_test_")) {
    return json({ error: "Staging must use a Stripe test mode secret key" }, 500, cors);
  }

  const priceId =
    plan === "monthly"
      ? env.STRIPE_MONTHLY_PRICE_ID
      : env.STRIPE_YEARLY_PRICE_ID;

  if (!priceId) {
    return json({ error: "Price ID not configured" }, 500, cors);
  }

  const licenseKey = crypto.randomUUID();
  const stripe = new Stripe(env.STRIPE_SECRET_KEY);

  try {
    const session = await stripe.checkout.sessions.create({
      mode: "subscription",
      line_items: [{ price: priceId, quantity: 1 }],
      success_url: buildSuccessUrl(env),
      cancel_url: buildCancelUrl(env),
      metadata: { licenseKey, plan },
      subscription_data: {
        metadata: { licenseKey, plan },
      },
    });

    return json({ url: session.url }, 200, cors);
  } catch (err) {
    console.error("Stripe checkout error:", err);
    return json({ error: "Failed to create checkout session" }, 500, cors);
  }
}

function buildSuccessUrl(env: CheckoutEnv): string {
  if (env.PUBLIC_SERVICE_SITE_URL) {
    return `${normalizeSiteUrl(env.PUBLIC_SERVICE_SITE_URL)}/billing/success?session_id={CHECKOUT_SESSION_ID}`;
  }

  if (env.STRIPE_SUCCESS_URL) {
    const separator = env.STRIPE_SUCCESS_URL.includes("?") ? "&" : "?";
    return `${env.STRIPE_SUCCESS_URL}${separator}session_id={CHECKOUT_SESSION_ID}`;
  }

  return `${DEFAULT_STAGING_SITE_URL}/billing/success?session_id={CHECKOUT_SESSION_ID}`;
}

function buildCancelUrl(env: CheckoutEnv): string {
  if (env.PUBLIC_SERVICE_SITE_URL) {
    return `${normalizeSiteUrl(env.PUBLIC_SERVICE_SITE_URL)}/#pricing`;
  }

  return env.STRIPE_CANCEL_URL ?? `${DEFAULT_STAGING_SITE_URL}/#pricing`;
}

function normalizeSiteUrl(url: string): string {
  return url.replace(/\/+$/, "");
}

export function json(
  body: unknown,
  status: number,
  extraHeaders: Record<string, string> = {}
) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json", ...extraHeaders },
  });
}
