-- REVIEW ONLY. Confirm ownership of public.profiles/searches/subscriptions and
-- feature tables across all apps before applying. No schema-wide changes.
BEGIN;
DO $$
DECLARE target record;
BEGIN
 FOR target IN SELECT * FROM (VALUES
  ('profiles','Service role can manage profiles'),
  ('searches','Service role can manage searches'),
  ('subscriptions','Service role can manage subscriptions'),
  ('price_alerts','Service role can manage alerts'),
  ('feedback','Service role can view feedback'),
  ('push_subscriptions','Service role can manage push subscriptions')
 ) AS targets(table_name,policy_name) LOOP
  IF EXISTS(SELECT 1 FROM pg_policies WHERE schemaname='public' AND tablename=target.table_name AND policyname=target.policy_name) THEN
   EXECUTE format('ALTER POLICY %I ON public.%I TO service_role',target.policy_name,target.table_name);
  END IF;
 END LOOP;
END $$;
-- Lumu profile writes are backend-only. Prevent an email-domain policy or a
-- future permissive row policy from granting browser clients premium writes.
-- This must not be applied if another app relies on client profile writes.
REVOKE INSERT, UPDATE, DELETE ON TABLE public.profiles FROM PUBLIC, anon, authenticated;
-- Table-level REVOKE does not remove pre-existing column-level grants.
DO $$
DECLARE columns_sql text;
BEGIN
 SELECT string_agg(quote_ident(attname), ', ' ORDER BY attnum) INTO columns_sql
 FROM pg_attribute WHERE attrelid='public.profiles'::regclass AND attnum>0 AND NOT attisdropped;
 EXECUTE format('REVOKE INSERT (%s), UPDATE (%s) ON TABLE public.profiles FROM PUBLIC, anon, authenticated',columns_sql,columns_sql);
END $$;
DROP POLICY IF EXISTS admin_can_change_premium ON public.profiles;
DROP POLICY IF EXISTS profiles_own_update ON public.profiles;
DROP POLICY IF EXISTS users_update_own_basic_info ON public.profiles;
COMMIT;
