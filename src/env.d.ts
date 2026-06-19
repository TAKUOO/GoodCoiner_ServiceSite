/// <reference types="astro/client" />

interface ImportMetaEnv {
  readonly PUBLIC_APP_ENV?: "local" | "staging" | "production";
  readonly PUBLIC_APP_DOWNLOAD_URL?: string;
}

interface Env {
  DB: D1Database;
  STRIPE_SECRET_KEY: string;
  STRIPE_WEBHOOK_SECRET: string;
  STRIPE_MONTHLY_PRICE_ID: string;
  STRIPE_YEARLY_PRICE_ID: string;
  STRIPE_SUCCESS_URL?: string;
  STRIPE_CANCEL_URL?: string;
  PUBLIC_APP_ENV?: "local" | "staging" | "production";
  PUBLIC_APP_DOWNLOAD_URL?: string;
  PUBLIC_SERVICE_SITE_URL?: string;
  PUBLIC_SITE_URL: string;
  ALLOWED_ORIGIN: string;
  // 市場イベント連携用の外部APIキー（Cloudflare Pages の環境変数で設定）
  TRADING_ECONOMICS_API_KEY?: string;
  COINDAR_API_KEY?: string;
}

type Runtime = import("@astrojs/cloudflare").Runtime<Env>;

declare namespace App {
  interface Locals extends Runtime {}
}
