-- 012_vip_temp_and_annual_plans.sql
-- 1) Add VIP temporary unlock columns to profiles (used by Lumu Coins system)
-- 2) Fix profiles_plan_check constraint to include annual plans
-- Safe to run multiple times (idempotent)

-- ============================================================
-- 1) VIP TEMP COLUMNS
-- ============================================================

ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS vip_temp_unlocked_at TIMESTAMP WITH TIME ZONE DEFAULT NULL;

ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS vip_temp_last_milestone INTEGER DEFAULT 0;

CREATE INDEX IF NOT EXISTS idx_profiles_vip_temp
  ON public.profiles(vip_temp_unlocked_at)
  WHERE vip_temp_unlocked_at IS NOT NULL;

-- ============================================================
-- 2) FIX PLAN CONSTRAINT — include annual plans
-- ============================================================

-- Drop old constraint that only knew free/personal_vip/b2b
ALTER TABLE public.profiles
  DROP CONSTRAINT IF EXISTS profiles_plan_check;

-- Re-create with all valid plan codes used in code
ALTER TABLE public.profiles
  ADD CONSTRAINT profiles_plan_check
  CHECK (plan IN (
    'free',
    'personal_vip',
    'personal_vip_annual',
    'b2b',
    'b2b_annual'
  ));
