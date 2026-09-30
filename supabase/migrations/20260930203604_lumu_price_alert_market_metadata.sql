-- Keep market identity beside each observed price and target. Historical
-- values remain NULL because their currency cannot be inferred safely.
ALTER TABLE public.price_history
    ADD COLUMN IF NOT EXISTS country_code text,
    ADD COLUMN IF NOT EXISTS currency text,
    ADD COLUMN IF NOT EXISTS price_source text,
    ADD COLUMN IF NOT EXISTS price_confidence numeric(4,3);

ALTER TABLE public.price_alerts
    ADD COLUMN IF NOT EXISTS country_code text,
    ADD COLUMN IF NOT EXISTS target_currency text;

CREATE INDEX IF NOT EXISTS idx_price_history_alert_market
    ON public.price_history (normalized_url, store_name, country_code, currency, created_at DESC);

ALTER TABLE public.price_history
    ADD CONSTRAINT price_history_currency_format_check
        CHECK (currency IS NULL OR currency ~ '^[A-Z]{3}$') NOT VALID;

ALTER TABLE public.price_alerts
    ADD CONSTRAINT price_alerts_target_currency_format_check
        CHECK (target_currency IS NULL OR target_currency ~ '^[A-Z]{3}$') NOT VALID;

ALTER TABLE public.price_history
    ADD CONSTRAINT price_history_confidence_range_check
        CHECK (price_confidence IS NULL OR price_confidence BETWEEN 0 AND 1) NOT VALID;
