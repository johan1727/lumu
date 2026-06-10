-- Migration: create live_coupons table
-- Fixes 404 errors from couponService.js querying a non-existent table

CREATE TABLE IF NOT EXISTS public.live_coupons (
    id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    store       text NOT NULL,
    store_name  text,
    code        text,
    coupon_code text,
    discount    text,
    description text,
    expires_at  timestamptz,
    country     text DEFAULT 'ALL',
    country_code text DEFAULT 'ALL',
    verified    boolean NOT NULL DEFAULT true,
    source_url  text,
    disclaimer  text,
    created_at  timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.live_coupons ENABLE ROW LEVEL SECURITY;

CREATE POLICY "live_coupons_public_read"
    ON public.live_coupons FOR SELECT
    USING (true);

CREATE POLICY "live_coupons_service_write"
    ON public.live_coupons FOR ALL
    TO service_role
    USING (true)
    WITH CHECK (true);

CREATE INDEX IF NOT EXISTS live_coupons_store_idx ON public.live_coupons (store);
CREATE INDEX IF NOT EXISTS live_coupons_expires_idx ON public.live_coupons (expires_at);
