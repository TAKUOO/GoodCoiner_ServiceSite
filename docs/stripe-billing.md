# GoodCoiner Stripe Billing Memo

## Current decision

Use the existing Stripe test mode prices. Do not recreate products or prices unless these IDs become invalid.

## Existing Stripe test mode resources

Stripe account: `acct_1TUdP4FdzeKWsM49`
Staging webhook endpoint: `https://staging.goodcoiner.com/api/webhook`
Production webhook endpoint: `https://goodcoiner.com/api/billing/webhook`

| Plan | Product | Product ID | Price ID | Amount | Billing | Currency | Lookup key | Mode |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| Monthly | GoodCoiner月額プラン | prod_UTavoNqbGIqTJB | price_1TUdjHFdzeKWsM49vdQRRley | 6.99 | recurring monthly | USD | none | test |
| Yearly | GoodCoiner年額プラン | prod_UTaveEbTA6UIoL | price_1TUdjPFdzeKWsM49tZMw4BnH | 70.00 | recurring yearly | USD | none | test |

Checked on 2026-05-15 via Stripe API using the local `sk_test_...` key from `.dev.vars`.

The proposed lookup keys `goodcoiner_monthly` and `goodcoiner_yearly` do not currently resolve to any Stripe Price in this test account.

## Service site wiring

`/#pricing` monthly and yearly buttons call:

```http
POST /api/billing/checkout
Content-Type: application/json

{ "plan": "monthly" }
```

or:

```http
POST /api/billing/checkout
Content-Type: application/json

{ "plan": "yearly" }
```

The legacy endpoint `POST /api/checkout` remains available and uses the same server-side Checkout Session creation logic.

There are no hard-coded Payment Links or Checkout URLs in the pricing buttons. The frontend only receives the Checkout Session URL returned by the server.

The GoodCoiner app verifies success-page activation tokens with:

```http
POST /api/billing/activate
Content-Type: application/json

{ "token": "activation-token" }
```

Successful activation returns:

```json
{
  "billingStatus": "monthly",
  "currentPeriodEnd": "2026-06-18T00:00:00.000Z",
  "cancelAtPeriodEnd": false,
  "entitlementKey": "..."
}
```

Activation tokens are one-time use. The endpoint only marks a token as used after it verifies the D1 subscription row and the Stripe subscription status is active.
If a Stripe subscription is active but the webhook-created D1 row is missing, the endpoint can recover the row from Stripe subscription metadata before returning success.

The app can check the latest saved entitlement state with:

```http
POST /api/billing/entitlement
Content-Type: application/json

{ "entitlementKey": "..." }
```

Successful entitlement responses use this shape:

```json
{
  "billingStatus": "monthly",
  "currentPeriodEnd": "2026-06-18T00:00:00.000Z",
  "cancelAtPeriodEnd": false,
  "entitlementKey": "..."
}
```

`entitlementKey` is currently stored in D1 as the same value as the existing `license_key` for backward compatibility.

## Staging environment variables

Set these on the Cloudflare Pages project `goodcoiner-staging`:

```dotenv
STRIPE_SECRET_KEY=sk_test_...
STRIPE_WEBHOOK_SECRET=whsec_...
STRIPE_MONTHLY_PRICE_ID=price_1TUdjHFdzeKWsM49vdQRRley
STRIPE_YEARLY_PRICE_ID=price_1TUdjPFdzeKWsM49tZMw4BnH
PUBLIC_APP_ENV=staging
PUBLIC_APP_DOWNLOAD_URL=https://example.com/GoodCoiner.dmg
PUBLIC_SERVICE_SITE_URL=https://staging.goodcoiner.com
PUBLIC_SITE_URL=https://staging.goodcoiner.com
```

For staging, the checkout code rejects non-test Stripe secret keys when `PUBLIC_APP_ENV=staging`.

## Checkout redirect URLs

When `PUBLIC_SERVICE_SITE_URL=https://staging.goodcoiner.com`, Checkout Sessions use:

```text
success_url=https://staging.goodcoiner.com/billing/success?session_id={CHECKOUT_SESSION_ID}
cancel_url=https://staging.goodcoiner.com/#pricing
```

`/billing/success` currently redirects to the existing `/success` implementation with the same query string.

For future production, set:

```dotenv
PUBLIC_APP_ENV=production
PUBLIC_APP_DOWNLOAD_URL=https://example.com/GoodCoiner.dmg
PUBLIC_SERVICE_SITE_URL=https://goodcoiner.com
PUBLIC_SITE_URL=https://goodcoiner.com
```

## Production webhook setup

Create a Stripe Dashboard webhook endpoint:

```text
https://goodcoiner.com/api/billing/webhook
```

Subscribe it to:

```text
checkout.session.completed
customer.subscription.updated
customer.subscription.deleted
invoice.payment_failed
```

After Stripe shows the signing secret, add it only to the Cloudflare Pages production environment for `goodcoiner-production`:

```dotenv
STRIPE_WEBHOOK_SECRET=whsec_...
```

Do not paste the real webhook signing secret into GitHub Issues, PRs, docs, or chat.

## D1 schema

The D1 database `goodcoiner-subscriptions` uses these migrations:

| Migration | Purpose |
| --- | --- |
| `0001_subscriptions.sql` | Stores license/subscription state and Stripe customer/subscription IDs |
| `0002_activation_tokens.sql` | Stores short-lived app activation tokens issued by the success page |
| `0003_entitlements.sql` | Adds entitlement key, Stripe price ID, and cancellation state |

Apply new migrations to each Cloudflare environment before routing webhook traffic to it.
