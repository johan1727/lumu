-- Migration: Core tables (profiles, searches, rate_limits, subscriptions, webhook_events)
-- Created: 2026-06-09

-- ============================================================
-- PROFILES
-- ============================================================
CREATE TABLE IF NOT EXISTS profiles (
    id              UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
    email           TEXT,
    plan            TEXT NOT NULL DEFAULT 'free',
    is_premium      BOOLEAN NOT NULL DEFAULT FALSE,
    vip_temp_unlocked_at TIMESTAMP WITH TIME ZONE,
    referred_by     UUID REFERENCES profiles(id) ON DELETE SET NULL,
    referral_code   TEXT UNIQUE,
    referral_vip_rewarded BOOLEAN NOT NULL DEFAULT FALSE,
    created_at      TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_profiles_plan ON profiles(plan);
CREATE INDEX IF NOT EXISTS idx_profiles_referral_code ON profiles(referral_code);
CREATE INDEX IF NOT EXISTS idx_profiles_referred_by ON profiles(referred_by);

ALTER TABLE profiles ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view own profile" ON profiles
    FOR SELECT USING (auth.uid() = id);
CREATE POLICY "Users can update own profile" ON profiles
    FOR UPDATE USING (auth.uid() = id);
CREATE POLICY "Service role can manage profiles" ON profiles
    FOR ALL USING (true);

COMMENT ON TABLE profiles IS 'Perfil de usuario con plan, estado VIP y sistema de referidos';
COMMENT ON COLUMN profiles.plan IS 'free | personal_vip | personal_vip_annual | b2b | b2b_annual';
COMMENT ON COLUMN profiles.vip_temp_unlocked_at IS 'Timestamp de desbloqueo VIP temporal (1 hora) por monedas o anuncio';
COMMENT ON COLUMN profiles.referral_vip_rewarded IS 'TRUE si el referidor ya recibió su bonus por esta conversión (evita duplicados en retry de webhook)';

-- ============================================================
-- SEARCHES
-- ============================================================
CREATE TABLE IF NOT EXISTS searches (
    id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id      UUID REFERENCES profiles(id) ON DELETE SET NULL,
    query        TEXT NOT NULL,
    is_deep      BOOLEAN NOT NULL DEFAULT FALSE,
    country_code TEXT,
    billed_units INTEGER NOT NULL DEFAULT 1,
    created_at   TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_searches_user_id ON searches(user_id);
CREATE INDEX IF NOT EXISTS idx_searches_created_at ON searches(created_at);
CREATE INDEX IF NOT EXISTS idx_searches_user_created ON searches(user_id, created_at);

ALTER TABLE searches ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view own searches" ON searches
    FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "Service role can manage searches" ON searches
    FOR ALL USING (true);

COMMENT ON TABLE searches IS 'Log de búsquedas para rate limiting diario/mensual y analíticas';
COMMENT ON COLUMN searches.billed_units IS '1 normal, 3 deep research';

-- ============================================================
-- RATE_LIMITS
-- ============================================================
CREATE TABLE IF NOT EXISTS rate_limits (
    id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    ip         TEXT NOT NULL,
    created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_rate_limits_ip ON rate_limits(ip);
CREATE INDEX IF NOT EXISTS idx_rate_limits_ip_created ON rate_limits(ip, created_at);

COMMENT ON TABLE rate_limits IS 'Rate limiting por IP para usuarios anónimos y créditos de referidos/bonos';
COMMENT ON COLUMN rate_limits.ip IS 'Formato: "search:{ip}" para búsquedas, "bonus:user:{uuid}" para créditos de referidos, "claim:user:{uuid}" para cooldown de reclamos';

-- ============================================================
-- SUBSCRIPTIONS
-- ============================================================
CREATE TABLE IF NOT EXISTS subscriptions (
    id                       UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id                  UUID REFERENCES profiles(id) ON DELETE SET NULL,
    stripe_customer_id       TEXT,
    stripe_subscription_id   TEXT UNIQUE,
    stripe_payment_intent_id TEXT,
    status                   TEXT NOT NULL DEFAULT 'pending_user_link',
    plan                     TEXT NOT NULL DEFAULT 'free',
    amount_paid              INTEGER,
    currency                 TEXT NOT NULL DEFAULT 'MXN',
    created_at               TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
    updated_at               TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_subscriptions_user_id ON subscriptions(user_id);
CREATE INDEX IF NOT EXISTS idx_subscriptions_stripe_customer ON subscriptions(stripe_customer_id);
CREATE INDEX IF NOT EXISTS idx_subscriptions_status ON subscriptions(status);

ALTER TABLE subscriptions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view own subscriptions" ON subscriptions
    FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "Service role can manage subscriptions" ON subscriptions
    FOR ALL USING (true);

COMMENT ON TABLE subscriptions IS 'Suscripciones de Stripe';
COMMENT ON COLUMN subscriptions.status IS 'active | cancelled | past_due | pending_user_link | refunded';
COMMENT ON COLUMN subscriptions.amount_paid IS 'Monto en centavos (divide por 100 para obtener el valor)';

-- ============================================================
-- WEBHOOK_EVENTS (idempotencia de Stripe)
-- ============================================================
CREATE TABLE IF NOT EXISTS webhook_events (
    id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    event_id     TEXT UNIQUE NOT NULL,
    event_type   TEXT NOT NULL,
    payload      JSONB,
    processed_at TIMESTAMP WITH TIME ZONE,
    created_at   TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_webhook_events_event_id ON webhook_events(event_id);
CREATE INDEX IF NOT EXISTS idx_webhook_events_processed_at ON webhook_events(processed_at);

COMMENT ON TABLE webhook_events IS 'Registro de webhooks de Stripe para garantizar idempotencia (procesar una sola vez por event_id)';
