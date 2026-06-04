ALTER TABLE subscriptions ADD COLUMN entitlement_key TEXT;
ALTER TABLE subscriptions ADD COLUMN price_id TEXT;
ALTER TABLE subscriptions ADD COLUMN cancel_at_period_end INTEGER NOT NULL DEFAULT 0;

UPDATE subscriptions
SET entitlement_key = license_key
WHERE entitlement_key IS NULL;

CREATE UNIQUE INDEX IF NOT EXISTS idx_entitlement_key
  ON subscriptions(entitlement_key)
  WHERE entitlement_key IS NOT NULL;
