CREATE TABLE IF NOT EXISTS subscriptions (
  id                      TEXT PRIMARY KEY,
  license_key             TEXT UNIQUE NOT NULL,
  stripe_customer_id      TEXT,
  stripe_subscription_id  TEXT,
  email                   TEXT,
  -- free | early_access | monthly | yearly | owner | expired
  status                  TEXT NOT NULL DEFAULT 'free',
  current_period_end      INTEGER,          -- Unix timestamp (monthly/yearly)
  early_access_expires_at INTEGER,          -- Unix timestamp (early_access)
  created_at              INTEGER NOT NULL DEFAULT (unixepoch()),
  updated_at              INTEGER NOT NULL DEFAULT (unixepoch())
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_license_key        ON subscriptions(license_key);
CREATE INDEX        IF NOT EXISTS idx_stripe_customer    ON subscriptions(stripe_customer_id);
CREATE INDEX        IF NOT EXISTS idx_stripe_subscription ON subscriptions(stripe_subscription_id);
CREATE INDEX        IF NOT EXISTS idx_email              ON subscriptions(email);
