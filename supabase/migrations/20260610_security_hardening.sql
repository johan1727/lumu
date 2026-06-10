-- Security hardening migration
-- Fixes advisories: 0011 (mutable search_path), 0024 (permissive RLS), 0028/0029 (SECURITY DEFINER exposed)

-- 1. Block anon/authenticated from calling internal SECURITY DEFINER functions via REST API
REVOKE EXECUTE ON FUNCTION public.handle_new_user() FROM anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.detect_premium_changes() FROM anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.upsert_query_intent_memory(text, text, text, text, text, text, text) FROM anon;

-- 2. Fix mutable search_path in all public functions
ALTER FUNCTION public.match_ai_memory(vector, float, int) SET search_path = public, pg_temp;
ALTER FUNCTION public.clean_old_rate_limits() SET search_path = public, pg_temp;
ALTER FUNCTION public.upsert_query_intent_memory(text, text, text, text, text, text, text) SET search_path = public, pg_temp;
ALTER FUNCTION public.detect_premium_changes() SET search_path = public, pg_temp;
ALTER FUNCTION public.cleanup_search_cache() SET search_path = public, pg_temp;
ALTER FUNCTION public.cleanup_rate_limits() SET search_path = public, pg_temp;
ALTER FUNCTION public.update_user_profiles_timestamp() SET search_path = public, pg_temp;
ALTER FUNCTION public.handle_new_user() SET search_path = public, pg_temp;
ALTER FUNCTION public.update_dropship_timestamp() SET search_path = public, pg_temp;
ALTER FUNCTION public.cleanup_price_history() SET search_path = public, pg_temp;

-- 3. Harden overly-permissive RLS policies

-- search_cache: only service_role writes (backend caches results)
DROP POLICY IF EXISTS "Permitir insert a todos" ON public.search_cache;
DROP POLICY IF EXISTS "Permitir update a todos" ON public.search_cache;

CREATE POLICY "search_cache_service_write"
  ON public.search_cache FOR INSERT
  TO service_role
  WITH CHECK (true);

CREATE POLICY "search_cache_service_update"
  ON public.search_cache FOR UPDATE
  TO service_role
  USING (true)
  WITH CHECK (true);

-- user_profiles: INSERT only for the owner or service_role
DROP POLICY IF EXISTS "Service can create profiles" ON public.user_profiles;

CREATE POLICY "user_profiles_insert"
  ON public.user_profiles FOR INSERT
  TO authenticated, service_role
  WITH CHECK (auth.uid() = user_id OR current_setting('role') = 'service_role');
