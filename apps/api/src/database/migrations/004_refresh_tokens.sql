-- Migration 004: Persist refresh token hashes for rotation and logout.

CREATE TABLE IF NOT EXISTS auth_refresh_tokens
(
    id         UUID PRIMARY KEY     DEFAULT gen_random_uuid(),
    user_id    UUID        NOT NULL REFERENCES users (id) ON DELETE CASCADE,
    token_hash CHAR(64)    NOT NULL UNIQUE,
    expires_at TIMESTAMPTZ NOT NULL,
    revoked_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_auth_refresh_tokens_user
    ON auth_refresh_tokens (user_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_auth_refresh_tokens_active
    ON auth_refresh_tokens (token_hash)
    WHERE revoked_at IS NULL;
