import type { APIRoute } from "astro";
import Stripe from "stripe";

const ACTIVATION_TOKEN_TTL_SECONDS = 15 * 60;

export const postBillingActivationToken: APIRoute = async ({
  request,
  locals,
}) => {
  const env = locals.runtime.env;

  let sessionId: string;
  try {
    const body = await request.json();
    sessionId = body.sessionId;
    if (!sessionId || typeof sessionId !== "string") {
      return json({ message: "sessionId is required" }, 400);
    }
  } catch {
    return json({ message: "Invalid request body" }, 400);
  }

  if (!env.STRIPE_SECRET_KEY) {
    return json({ message: "Stripe is not configured" }, 500);
  }

  try {
    const stripe = new Stripe(env.STRIPE_SECRET_KEY);
    const session = await stripe.checkout.sessions.retrieve(sessionId);

    if (session.payment_status !== "paid" && session.status !== "complete") {
      return json({ message: "Checkout session is not complete" }, 409);
    }

    const licenseKey = session.metadata?.licenseKey;
    if (!licenseKey) {
      return json({ message: "License key is missing" }, 404);
    }

    const token = crypto.randomUUID();
    const now = Math.floor(Date.now() / 1000);
    const expiresAt = now + ACTIVATION_TOKEN_TTL_SECONDS;

    await env.DB
      .prepare(
        `INSERT INTO activation_tokens (token, license_key, expires_at, created_at)
         VALUES (?, ?, ?, ?)`
      )
      .bind(token, licenseKey, expiresAt, now)
      .run();

    return json(
      {
        activationToken: token,
        deepLink: `goodcoiner://activate?token=${encodeURIComponent(token)}`,
        expiresAt: new Date(expiresAt * 1000).toISOString(),
      },
      200
    );
  } catch {
    return json({ message: "Activation token could not be issued" }, 500);
  }
};

function json(body: unknown, status: number) {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      "Content-Type": "application/json",
      "Cache-Control": "no-store",
    },
  });
}
