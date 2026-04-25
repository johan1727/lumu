-- 013: Fix webhook_events.processed_at — make it nullable
-- Previously DEFAULT NOW() caused the field to be set on INSERT (before processing finished).
-- Now it's NULL on INSERT and set to NOW() only after all DB operations succeed (idempotency fix).

ALTER TABLE webhook_events ALTER COLUMN processed_at DROP DEFAULT;
ALTER TABLE webhook_events ALTER COLUMN processed_at DROP NOT NULL;

-- Backfill: mark all existing rows as processed (they were inserted with the old logic)
UPDATE webhook_events SET processed_at = NOW() WHERE processed_at IS NULL;
