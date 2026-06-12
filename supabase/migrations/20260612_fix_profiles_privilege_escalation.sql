-- 20260612_fix_profiles_privilege_escalation.sql
-- SECURITY FIX (CRÍTICO): escalada de privilegios en public.profiles
-- "La gente se ponía VIP sin pagar." Tres agujeros, un solo archivo:
--
-- 1) profiles_own_update: FOR UPDATE USING (auth.uid()=id) SIN WITH CHECK.
--    En Postgres un UPDATE sin WITH CHECK usa el USING como check, por lo que
--    permitía cambiar CUALQUIER columna de la propia fila (incl. is_premium/plan)
--    vía la anon key pública:
--        supabase.from('profiles').update({is_premium:true, plan:'b2b'}).eq('id', miId)
--    Las políticas permisivas se combinan con OR, así que anulaba el bloqueo de
--    users_update_own_basic_info.
--
-- 2) Cadena vía email: admin_can_change_premium da poder de admin a quien tenga
--    email LIKE '%@lumu.dev'. users_update_own_basic_info dejaba al usuario
--    cambiar su propio email (solo congelaba is_premium/plan):
--        a) UPDATE profiles SET email='x@lumu.dev'      -> permitido
--        b) admin_can_change_premium ahora lo ve admin  -> SET is_premium=true
--    También dejaba escribibles vip_temp_unlocked_at / vip_temp_last_milestone
--    (auto "VIP temporal" sin ver anuncio) y referred_by / referral_vip_rewarded
--    (fraude de referidos).
--
-- 3) profiles_own_insert no congelaba is_premium/plan (vector estrecho: solo si
--    no existe ya la fila del perfil).
--
-- El frontend NUNCA escribe en profiles (verificado: no hay .update/.upsert en
-- public/). Todo lo gestiona el backend con service_role (BYPASSRLS), incluido el
-- webhook de Stripe y el desbloqueo de Lumu Coins. Por eso la solución fail-safe es
-- quitar el self-update de usuarios por completo.
--
-- Estado final de UPDATE en profiles:
--   * admin_can_change_premium  -> admins @lumu.dev
--   * service_role (BYPASSRLS)  -> backend
--
-- Idempotente: seguro de re-ejecutar.

-- (1) política permisiva sin WITH CHECK
DROP POLICY IF EXISTS profiles_own_update ON public.profiles;

-- (2) self-update de usuarios (incluía el agujero de email -> admin)
DROP POLICY IF EXISTS users_update_own_basic_info ON public.profiles;

-- (3) defense-in-depth: que un INSERT directo desde el cliente no nazca premium
DROP POLICY IF EXISTS profiles_own_insert ON public.profiles;
CREATE POLICY profiles_own_insert ON public.profiles
  FOR INSERT
  WITH CHECK (
    (SELECT auth.uid()) = id
    AND is_premium IS NOT TRUE
    AND COALESCE(plan, 'free') = 'free'
    AND vip_temp_unlocked_at IS NULL
  );
