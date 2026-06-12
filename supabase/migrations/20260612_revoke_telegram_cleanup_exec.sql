-- 20260612_revoke_telegram_cleanup_exec.sql
-- Advisory 0028/0029: cleanup_expired_telegram_tokens() es SECURITY DEFINER y
-- quedaba ejecutable por anon/authenticated vía /rest/v1/rpc/. Es una función
-- interna de mantenimiento (la corre el backend/cron), no debe exponerse en la
-- API pública. Mismo patrón que 20260610_security_hardening.sql.
-- Idempotente.
REVOKE EXECUTE ON FUNCTION public.cleanup_expired_telegram_tokens() FROM PUBLIC, anon, authenticated;
ALTER FUNCTION public.cleanup_expired_telegram_tokens() SET search_path = public, pg_temp;
