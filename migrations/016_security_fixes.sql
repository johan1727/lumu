-- Migration 016: Security Fixes for Supabase Advisor Alerts
-- Fixes: RLS Disabled, Security Definer Views, Exposed Auth Users
-- Safe to run multiple times (idempotent)

BEGIN;

-- ============================================================
-- 1) RLS: blocked_ips — "RLS Disabled in Public"
-- ============================================================
ALTER TABLE IF EXISTS public.blocked_ips ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS blocked_ips_service_all ON public.blocked_ips;
CREATE POLICY blocked_ips_service_all ON public.blocked_ips
    FOR ALL
    USING (auth.role() = 'service_role')
    WITH CHECK (auth.role() = 'service_role');

-- ============================================================
-- 2) Security Definer Views → Security Invoker
--    Affected: users_with_multiple_premium_changes,
--              ip_blocklist, open_critical_alerts,
--              recent_suspicious_changes
-- ============================================================

-- recent_suspicious_changes
-- Exposed auth users + Security Definer — highest priority fix
-- Replace with security_invoker + restrict to service_role only
DROP VIEW IF EXISTS public.recent_suspicious_changes;
CREATE OR REPLACE VIEW public.recent_suspicious_changes
WITH (security_invoker = true) AS
SELECT
    p.id          AS user_id,
    p.plan,
    p.is_premium,
    p.created_at
FROM public.profiles p
WHERE p.created_at >= NOW() - INTERVAL '7 days'
  AND p.is_premium = true;

REVOKE ALL ON public.recent_suspicious_changes FROM anon, authenticated;
GRANT SELECT ON public.recent_suspicious_changes TO service_role;

-- users_with_multiple_premium_changes
DROP VIEW IF EXISTS public.users_with_multiple_premium_changes;
CREATE OR REPLACE VIEW public.users_with_multiple_premium_changes
WITH (security_invoker = true) AS
SELECT
    user_id,
    COUNT(*) AS change_count,
    MAX(created_at) AS last_change
FROM public.subscriptions
GROUP BY user_id
HAVING COUNT(*) > 2;

REVOKE ALL ON public.users_with_multiple_premium_changes FROM anon, authenticated;
GRANT SELECT ON public.users_with_multiple_premium_changes TO service_role;

-- ip_blocklist
DROP VIEW IF EXISTS public.ip_blocklist;
CREATE OR REPLACE VIEW public.ip_blocklist
WITH (security_invoker = true) AS
SELECT
    ip,
    COUNT(*)       AS hit_count,
    MAX(created_at) AS last_seen
FROM public.rate_limits
WHERE ip NOT LIKE 'bonus:%'
  AND ip NOT LIKE 'claim:%'
  AND ip NOT LIKE 'signup-bonus:%'
  AND ip NOT LIKE 'referral-%'
GROUP BY ip
HAVING COUNT(*) > 50;

REVOKE ALL ON public.ip_blocklist FROM anon, authenticated;
GRANT SELECT ON public.ip_blocklist TO service_role;

-- open_critical_alerts
DROP VIEW IF EXISTS public.open_critical_alerts;
CREATE OR REPLACE VIEW public.open_critical_alerts
WITH (security_invoker = true) AS
SELECT
    id,
    user_id,
    product_name,
    target_price,
    created_at
FROM public.price_alerts
WHERE triggered = false
  AND created_at >= NOW() - INTERVAL '30 days';

REVOKE ALL ON public.open_critical_alerts FROM anon, authenticated;
GRANT SELECT ON public.open_critical_alerts TO service_role;

-- ============================================================
-- 3) Asegurar que rate_limits sigue accesible para service_role
--    (el backend usa service_role key para escribir bonus)
-- ============================================================
DROP POLICY IF EXISTS rate_limits_service_all ON public.rate_limits;
CREATE POLICY rate_limits_service_all ON public.rate_limits
    FOR ALL
    USING (auth.role() = 'service_role')
    WITH CHECK (auth.role() = 'service_role');

COMMIT;
