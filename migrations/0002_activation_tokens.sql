CREATE TABLE IF NOT EXISTS activation_tokens (
  token      TEXT    PRIMARY KEY,
  license_key TEXT   NOT NULL,
  expires_at INTEGER NOT NULL,
  used_at    INTEGER,
  created_at INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_activation_token_license ON activation_tokens(license_key);
