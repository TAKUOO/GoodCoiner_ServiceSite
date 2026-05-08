import type { APIRoute } from "astro";
import Stripe from "stripe";

export const prerender = false;

export const POST: APIRoute = async ({ request, locals }) => {
  const env = locals.runtime.env;

  let plan: string;
  try {
    const body = await request.json();
    plan = body.plan;
  } catch {
    return json({ error: "Invalid request body" }, 400);
  }

  if (plan !== "monthly" && plan !== "yearly") {
    return json({ error: "Invalid plan" }, 400);
  }

  const priceId =
    plan === "monthly"
      ? env.STRIPE_MONTHLY_PRICE_ID
      : env.STRIPE_YEARLY_PRICE_ID;

  if (!priceId) {
    return json({ error: "Price ID not configured" }, 500);
  }

  const licenseKey = crypto.randomUUID();
  const stripe = new Stripe(env.STRIPE_SECRET_KEY);

  try {
    const session = await stripe.checkout.sessions.create({
      mode: "subscription",
      line_items: [{ price: priceId, quantity: 1 }],
      // {CHECKOUT_SESSION_ID} は Stripe が自動で置換する
      success_url: `${env.STRIPE_SUCCESS_URL}?session_id={CHECKOUT_SESSION_ID}`,
      cancel_url: env.STRIPE_CANCEL_URL,
      metadata: { licenseKey, plan },
      subscription_data: {
        metadata: { licenseKey, plan },
      },
    });

    return json({ url: session.url }, 200);
  } catch (err) {
    console.error("Stripe checkout error:", err);
    return json({ error: "Failed to create checkout session" }, 500);
  }
};

function json(body: unknown, status: number) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}
