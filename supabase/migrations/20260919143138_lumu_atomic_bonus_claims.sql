-- REVIEW ONLY: do not apply to the shared database until its consumers and grants
-- are approved. No schema-wide revokes, no replacement of existing RLS policies.
-- One RPC transaction locks the claimant, checks the historical ledger, and writes
-- the marker + all credits together. Legacy claim rows remain authoritative.
BEGIN;
CREATE OR REPLACE FUNCTION public.lumu_claim_bonus(p_user_id uuid, p_kind text, p_code text DEFAULT NULL)
RETURNS jsonb LANGUAGE plpgsql SECURITY INVOKER SET search_path = '' AS $$
DECLARE
    claimant public.profiles%ROWTYPE;
    referrer_id uuid;
    marker text;
    credits integer;
    claim_time timestamptz := clock_timestamp();
BEGIN
    IF p_kind NOT IN ('signup', 'referral', 'reward', 'referral_vip') OR p_kind IS NULL THEN
        RETURN jsonb_build_object('status',400,'error','Tipo de bono inválido.');
    END IF;
    -- NO KEY UPDATE serializes claims without conflicting with FK key-share locks
    -- when two new accounts refer one another concurrently.
    SELECT * INTO claimant FROM public.profiles WHERE id=p_user_id FOR NO KEY UPDATE;
    IF NOT FOUND THEN RETURN jsonb_build_object('status',403,'error','No se pudo validar tu cuenta.'); END IF;
    IF p_kind IN ('signup','referral') AND
       (claimant.created_at IS NULL OR claimant.created_at < claim_time - interval '7 days' OR claimant.created_at > claim_time) THEN
        RETURN jsonb_build_object('status',403,'error','Este bono solo está disponible para cuentas recientes.');
    END IF;
    marker := CASE p_kind WHEN 'signup' THEN 'signup-bonus:user:' WHEN 'referral' THEN 'referral-used:user:'
              WHEN 'reward' THEN 'claim:user:' ELSE 'referral-vip:user:' END || p_user_id::text;
    IF EXISTS(SELECT 1 FROM public.rate_limits WHERE ip=marker AND
        (p_kind <> 'reward' OR created_at > claim_time - interval '1 hour')) THEN
        IF p_kind='reward' THEN RETURN jsonb_build_object('status',429,'error','Intenta de nuevo en 1 hora.','retry_after',3600); END IF;
        IF p_kind='referral' THEN RETURN jsonb_build_object('status',409,'error','Ya canjeaste un código de referido.'); END IF;
        RETURN jsonb_build_object('status',200,'success',true,'bonus',0,'already_claimed',true);
    END IF;
    IF p_kind='referral' THEN
        IF claimant.referred_by IS NOT NULL THEN RETURN jsonb_build_object('status',409,'error','Ya canjeaste un código de referido.'); END IF;
        SELECT id INTO referrer_id FROM public.profiles WHERE referral_code=upper(trim(p_code)) AND id<>p_user_id;
        IF referrer_id IS NULL THEN RETURN jsonb_build_object('status',404,'error','Código de referido no encontrado.'); END IF;
        UPDATE public.profiles SET referred_by=referrer_id WHERE id=p_user_id;
    ELSIF p_kind='referral_vip' THEN
        IF claimant.referral_vip_rewarded OR claimant.referred_by IS NULL THEN
            RETURN jsonb_build_object('status',200,'success',true,'bonus',0,'already_claimed',true);
        END IF;
        referrer_id := claimant.referred_by;
        UPDATE public.profiles SET referral_vip_rewarded=true WHERE id=p_user_id;
    END IF;
    credits := CASE p_kind WHEN 'signup' THEN 2 WHEN 'referral' THEN 5 WHEN 'reward' THEN 3 ELSE 40 END;
    INSERT INTO public.rate_limits(ip,created_at) VALUES(marker,claim_time);
    INSERT INTO public.rate_limits(ip,created_at)
      SELECT 'bonus:user:' || (CASE WHEN p_kind='referral_vip' THEN referrer_id ELSE p_user_id END)::text,claim_time
      FROM generate_series(1,credits);
    IF p_kind='referral' THEN
        INSERT INTO public.rate_limits(ip,created_at) SELECT 'bonus:user:'||referrer_id::text,claim_time FROM generate_series(1,5);
        RETURN jsonb_build_object('status',200,'success',true,'bonus_new_user',5,'bonus_referrer',5);
    END IF;
    RETURN jsonb_build_object('status',200,'success',true,'bonus',credits);
END;
$$;
REVOKE ALL ON FUNCTION public.lumu_claim_bonus(uuid,text,text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.lumu_claim_bonus(uuid,text,text) TO service_role;
COMMIT;
