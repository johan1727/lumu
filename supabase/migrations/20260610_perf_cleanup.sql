-- Performance cleanup
-- Fixes advisors: duplicate_index (8), auth_rls_initplan (37), multiple_permissive_policies (85),
-- unindexed_foreign_keys (2)
-- Aplicada en producción vía MCP el 2026-06-10.

-- ============================================================
-- A. Policies "service" muertas: service_role tiene BYPASSRLS,
--    estas policies solo agregaban evaluación por fila para anon/authenticated
-- ============================================================
DROP POLICY IF EXISTS "blocked_ips_service_all" ON public.blocked_ips;
DROP POLICY IF EXISTS "click_events_service_all" ON public.click_events;
DROP POLICY IF EXISTS "dropship_orders_service_all" ON public.dropship_orders;
DROP POLICY IF EXISTS "dropship_products_service_all" ON public.dropship_products;
DROP POLICY IF EXISTS "llm_analysis_log_service_all" ON public.llm_analysis_log;
DROP POLICY IF EXISTS "plan_prices_service_write" ON public.plan_prices;
DROP POLICY IF EXISTS "price_alerts_service_all" ON public.price_alerts;
DROP POLICY IF EXISTS "price_history_service_role_all" ON public.price_history;
DROP POLICY IF EXISTS "push_subs_service_all" ON public.push_subscriptions;
DROP POLICY IF EXISTS "query_intent_memory_service_all" ON public.query_intent_memory;
DROP POLICY IF EXISTS "rate_limits_service_all" ON public.rate_limits;
DROP POLICY IF EXISTS "Service role only" ON public.rate_limits;
DROP POLICY IF EXISTS "live_coupons_service_write" ON public.live_coupons;
DROP POLICY IF EXISTS "search_cache_service_write" ON public.search_cache;
DROP POLICY IF EXISTS "search_cache_service_update" ON public.search_cache;

-- ============================================================
-- B. Policies de usuario duplicadas (mismo predicado, dos nombres)
-- ============================================================
DROP POLICY IF EXISTS "Users can view their own searches" ON public.searches;
DROP POLICY IF EXISTS "Users can insert their own searches" ON public.searches;
DROP POLICY IF EXISTS "Users can delete their own searches" ON public.searches;
DROP POLICY IF EXISTS "Users can view their own subscriptions" ON public.subscriptions;

-- ============================================================
-- C. Fix initplan: (select auth.uid()) se evalúa una vez por query,
--    auth.uid() a secas se re-evalúa por cada fila
-- ============================================================
ALTER POLICY "auth_audit_self_or_admin" ON public.auth_audit_log
  USING ((user_id = (SELECT auth.uid())) OR (EXISTS (SELECT 1 FROM profiles WHERE profiles.id = (SELECT auth.uid()) AND profiles.email LIKE '%@lumu.dev')));

ALTER POLICY "favorites_own_all" ON public.favorites
  USING ((SELECT auth.uid()) = user_id)
  WITH CHECK ((SELECT auth.uid()) = user_id);

ALTER POLICY "feedback_insert_auth" ON public.feedback
  WITH CHECK ((SELECT auth.uid()) IS NOT NULL);

ALTER POLICY "feedback_own_select" ON public.feedback
  USING ((SELECT auth.uid()) = user_id);

ALTER POLICY "price_alerts_user_delete" ON public.price_alerts
  USING ((SELECT auth.uid()) = user_id);

ALTER POLICY "price_alerts_user_insert" ON public.price_alerts
  WITH CHECK ((SELECT auth.uid()) = user_id);

ALTER POLICY "price_alerts_user_select" ON public.price_alerts
  USING ((SELECT auth.uid()) = user_id);

ALTER POLICY "profile_changes_self_or_admin" ON public.profile_changes_log
  USING ((target_user_id = (SELECT auth.uid())) OR (EXISTS (SELECT 1 FROM profiles WHERE profiles.id = (SELECT auth.uid()) AND profiles.email LIKE '%@lumu.dev')));

ALTER POLICY "admin_can_change_premium" ON public.profiles
  USING (EXISTS (SELECT 1 FROM profiles profiles_1 WHERE profiles_1.id = (SELECT auth.uid()) AND profiles_1.email LIKE '%@lumu.dev'));

ALTER POLICY "profiles_own_insert" ON public.profiles
  WITH CHECK ((SELECT auth.uid()) = id);

ALTER POLICY "profiles_own_select" ON public.profiles
  USING ((SELECT auth.uid()) = id);

ALTER POLICY "profiles_own_update" ON public.profiles
  USING ((SELECT auth.uid()) = id);

ALTER POLICY "users_update_own_basic_info" ON public.profiles
  USING (id = (SELECT auth.uid()))
  WITH CHECK (
    (id = (SELECT auth.uid()))
    AND (NOT (is_premium IS DISTINCT FROM (SELECT profiles_1.is_premium FROM profiles profiles_1 WHERE profiles_1.id = (SELECT auth.uid()))))
    AND (NOT (plan IS DISTINCT FROM (SELECT profiles_1.plan FROM profiles profiles_1 WHERE profiles_1.id = (SELECT auth.uid()))))
  );

ALTER POLICY "push_subs_user_manage" ON public.push_subscriptions
  USING ((SELECT auth.uid()) = user_id)
  WITH CHECK ((SELECT auth.uid()) = user_id);

ALTER POLICY "searches_own_select" ON public.searches
  USING ((SELECT auth.uid()) = user_id);

ALTER POLICY "searches_own_insert" ON public.searches
  WITH CHECK ((SELECT auth.uid()) = user_id);

ALTER POLICY "searches_own_delete" ON public.searches
  USING ((SELECT auth.uid()) = user_id);

ALTER POLICY "security_alerts_admin_only" ON public.security_alerts
  USING (EXISTS (SELECT 1 FROM profiles WHERE profiles.id = (SELECT auth.uid()) AND profiles.email LIKE '%@lumu.dev'));

ALTER POLICY "subscriptions_own_select" ON public.subscriptions
  USING ((SELECT auth.uid()) = user_id);

ALTER POLICY "Users can update own profile" ON public.user_profiles
  USING ((SELECT auth.uid()) = user_id);

ALTER POLICY "Users can view own profile" ON public.user_profiles
  USING ((SELECT auth.uid()) = user_id);

ALTER POLICY "user_profiles_insert" ON public.user_profiles
  WITH CHECK (((SELECT auth.uid()) = user_id) OR ((SELECT current_setting('role'::text)) = 'service_role'));

-- ============================================================
-- D. Índices FK faltantes
-- ============================================================
CREATE INDEX IF NOT EXISTS idx_subscriptions_user_id ON public.subscriptions(user_id);
CREATE INDEX IF NOT EXISTS idx_blocked_ips_blocked_by ON public.blocked_ips(blocked_by);

-- ============================================================
-- E. Índices duplicados (definición idéntica, doble costo de escritura)
--    favorites_unique_product respalda un constraint — se conserva ese
-- ============================================================
DROP INDEX IF EXISTS public.idx_click_events_type;            -- = idx_click_events_event_created_at
DROP INDEX IF EXISTS public.idx_click_events_user;            -- = idx_click_events_user_created_at
DROP INDEX IF EXISTS public.uq_favorites_user_product_url;    -- = favorites_unique_product (constraint)
DROP INDEX IF EXISTS public.idx_llm_log_created;              -- = idx_llm_analysis_log_created_at
DROP INDEX IF EXISTS public.idx_price_history_created;        -- = idx_price_history_created_at
DROP INDEX IF EXISTS public.idx_price_history_query_url_date; -- = idx_price_history_query_url_created_at
DROP INDEX IF EXISTS public.idx_rate_limits_ip_created;       -- = idx_rate_limits_ip_created_at
DROP INDEX IF EXISTS public.idx_rate_limits_ip_time;          -- = idx_rate_limits_ip_created_at
DROP INDEX IF EXISTS public.idx_searches_user_date;           -- = idx_searches_user_created_at
DROP INDEX IF EXISTS public.idx_searches_user_id_created_at;  -- = idx_searches_user_created_at
