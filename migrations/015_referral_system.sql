-- Migration 015: Referral System
-- Agrega las columnas necesarias para el programa de referidos 5+5 + VIP bonus

-- 1. Código único de referido del usuario (generado por el backend al pedirlo)
ALTER TABLE profiles
    ADD COLUMN IF NOT EXISTS referral_code TEXT UNIQUE,
    ADD COLUMN IF NOT EXISTS referred_by UUID REFERENCES profiles(id) ON DELETE SET NULL,
    ADD COLUMN IF NOT EXISTS referral_vip_rewarded BOOLEAN NOT NULL DEFAULT FALSE;

-- 2. Índice para lookup rápido por código
CREATE INDEX IF NOT EXISTS idx_profiles_referral_code ON profiles(referral_code) WHERE referral_code IS NOT NULL;

-- 3. Índice para saber quién refirió a quién
CREATE INDEX IF NOT EXISTS idx_profiles_referred_by ON profiles(referred_by) WHERE referred_by IS NOT NULL;

-- Notas de implementación:
-- - El bonus de 5 búsquedas se otorga insertando 5 rows en rate_limits con ip = 'bonus:user:{id}'
-- - El bonus VIP (40 búsquedas) se otorga en el webhook checkout.session.completed de Stripe
-- - referral_vip_rewarded previene duplicados del bonus VIP al referidor
-- - El código se genera en GET /api/referral/code y se canjea en POST /api/referral/claim
