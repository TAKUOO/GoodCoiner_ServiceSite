import type { APIRoute } from "astro";

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

  let token: string;
  try {
    const body = await request.json();
    token = body.token;
    if (!token || typeof token !== "string") throw new Error();
  } catch {
    return new Response(JSON.stringify({ error: "Invalid request" }), { status: 400, headers });
  }

  const db = env.DB;
  const now = Math.floor(Date.now() / 1000);

  const row = await db
    .prepare(`SELECT token, license_key, expires_at, used_at FROM activation_tokens WHERE token = ?`)
    .bind(token)
    .first<{ token: string; license_key: string; expires_at: number; used_at: number | null }>();

  if (!row) {
    return new Response(JSON.stringify({ error: "Invalid token" }), { status: 404, headers });
  }
  if (row.expires_at < now) {
    return new Response(JSON.stringify({ error: "Token expired" }), { status: 410, headers });
  }
  if (row.used_at) {
    return new Response(JSON.stringify({ error: "Token already used" }), { status: 409, headers });
  }

  await db
    .prepare(`UPDATE activation_tokens SET used_at = ? WHERE token = ?`)
    .bind(now, token)
    .run();

  const sub = await db
    .prepare(
      `SELECT license_key, status, current_period_end, email FROM subscriptions WHERE license_key = ?`
    )
    .bind(row.license_key)
    .first<{
      license_key: string;
      status: string;
      current_period_end: number | null;
      email: string | null;
    }>();

  if (!sub) {
    // Webhook がまだ処理されていない（レースコンディション）→ アプリ側でリトライ
    return new Response(
      JSON.stringify({ status: "pending", licenseKey: row.license_key }),
      { status: 202, headers }
    );
  }

  return new Response(
    JSON.stringify({
      status: sub.status,
      licenseKey: sub.license_key,
      currentPeriodEnd: sub.current_period_end,
      email: sub.email,
    }),
    { status: 200, headers }
  );
};
