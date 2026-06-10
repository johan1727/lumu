-- Migration: Telegram bot integration
-- Adds telegram_chat_id to profiles + ephemeral link tokens table

-- 1. Add telegram_chat_id to profiles
ALTER TABLE profiles
    ADD COLUMN IF NOT EXISTS telegram_chat_id TEXT DEFAULT NULL;

-- Unique index: one Telegram account per user (also speeds up /stop lookup)
CREATE UNIQUE INDEX IF NOT EXISTS idx_profiles_telegram_chat_id
    ON profiles (telegram_chat_id)
    WHERE telegram_chat_id IS NOT NULL;

-- 2. Table for magic link tokens (user clicks "Conectar Telegram" → generates token → opens bot)
CREATE TABLE IF NOT EXISTS telegram_link_tokens (
    id          BIGSERIAL PRIMARY KEY,
    user_id     UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    token       TEXT NOT NULL UNIQUE,
    expires_at  TIMESTAMPTZ NOT NULL,
    created_at  TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_telegram_link_tokens_user_id
    ON telegram_link_tokens (user_id);

CREATE INDEX IF NOT EXISTS idx_telegram_link_tokens_expires_at
    ON telegram_link_tokens (expires_at);

-- 3. RLS: users cannot read each other's link tokens
ALTER TABLE telegram_link_tokens ENABLE ROW LEVEL SECURITY;

-- Only service_role can insert/read/delete (webhook handler uses service_role key)
-- No anon or authenticated access needed — tokens are short-lived backend-only
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_policies
        WHERE tablename = 'telegram_link_tokens'
          AND policyname = 'service_role_full_access'
    ) THEN
        CREATE POLICY service_role_full_access ON telegram_link_tokens
            FOR ALL TO service_role USING (true) WITH CHECK (true);
    END IF;
END $$;

-- 4. Auto-cleanup expired tokens (prevents table bloat)
-- This runs as a cron-style trigger: delete expired tokens whenever a new one is inserted
CREATE OR REPLACE FUNCTION cleanup_expired_telegram_tokens()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
    DELETE FROM telegram_link_tokens WHERE expires_at < NOW();
    RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_cleanup_telegram_tokens ON telegram_link_tokens;
CREATE TRIGGER trg_cleanup_telegram_tokens
    AFTER INSERT ON telegram_link_tokens
    EXECUTE FUNCTION cleanup_expired_telegram_tokens();
