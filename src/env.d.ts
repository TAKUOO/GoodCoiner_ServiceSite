/// <reference types="astro/client" />

interface Env {
  DB: D1Database;
  STRIPE_SECRET_KEY: string;
  STRIPE_WEBHOOK_SECRET: string;
  STRIPE_MONTHLY_PRICE_ID: string;
  STRIPE_YEARLY_PRICE_ID: string;
  STRIPE_SUCCESS_URL: string;
  STRIPE_CANCEL_URL: string;
  PUBLIC_SITE_URL: string;
  ALLOWED_ORIGIN: string;
}

type Runtime = import("@astrojs/cloudflare").Runtime<Env>;

declare namespace App {
  interface Locals extends Runtime {}
}
