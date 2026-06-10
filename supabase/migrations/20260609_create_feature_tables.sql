-- Migration: Feature tables (alerts, feedback, push, B2B, AI memory)
-- Created: 2026-06-09

-- ============================================================
-- PRICE_ALERTS
-- ============================================================
CREATE TABLE IF NOT EXISTS price_alerts (
    id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id      UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
    product_name TEXT NOT NULL,
    target_price NUMERIC NOT NULL,
    product_url  TEXT,
    store_name   TEXT,
    triggered    BOOLEAN NOT NULL DEFAULT FALSE,
    created_at   TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_price_alerts_user_id ON price_alerts(user_id);
CREATE INDEX IF NOT EXISTS idx_price_alerts_triggered ON price_alerts(triggered);

ALTER TABLE price_alerts ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view own alerts" ON price_alerts
    FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "Users can insert own alerts" ON price_alerts
    FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Users can delete own alerts" ON price_alerts
    FOR DELETE USING (auth.uid() = user_id);
CREATE POLICY "Service role can manage alerts" ON price_alerts
    FOR ALL USING (true);

COMMENT ON TABLE price_alerts IS 'Alertas de precio configuradas por el usuario';

-- ============================================================
-- FEEDBACK
-- ============================================================
CREATE TABLE IF NOT EXISTS feedback (
    id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id    UUID REFERENCES profiles(id) ON DELETE SET NULL,
    query      TEXT NOT NULL DEFAULT 'GENERAL_APP_FEEDBACK',
    response   TEXT,
    vote       INTEGER,
    message    TEXT,
    email      TEXT,
    created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_feedback_user_id ON feedback(user_id);
CREATE INDEX IF NOT EXISTS idx_feedback_created_at ON feedback(created_at);

ALTER TABLE feedback ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can insert feedback" ON feedback
    FOR INSERT WITH CHECK (true);
CREATE POLICY "Service role can view feedback" ON feedback
    FOR ALL USING (true);

COMMENT ON TABLE feedback IS 'Feedback de usuarios sobre resultados de búsqueda y la app en general';
COMMENT ON COLUMN feedback.query IS 'Query de búsqueda o "GENERAL_APP_FEEDBACK" para feedback general';
COMMENT ON COLUMN feedback.vote IS '1 = positivo';

-- ============================================================
-- PUSH_SUBSCRIPTIONS
-- ============================================================
CREATE TABLE IF NOT EXISTS push_subscriptions (
    id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id    UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
    endpoint   TEXT NOT NULL,
    p256dh     TEXT NOT NULL,
    auth_key   TEXT NOT NULL,
    created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
    UNIQUE (user_id, endpoint)
);

CREATE INDEX IF NOT EXISTS idx_push_subscriptions_user_id ON push_subscriptions(user_id);

ALTER TABLE push_subscriptions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can manage own push subscriptions" ON push_subscriptions
    FOR ALL USING (auth.uid() = user_id);
CREATE POLICY "Service role can manage push subscriptions" ON push_subscriptions
    FOR ALL USING (true);

COMMENT ON TABLE push_subscriptions IS 'Suscripciones de Web Push para notificaciones de alertas de precio';

-- ============================================================
-- AI_MEMORY (requiere extensión pgvector)
-- ============================================================
CREATE EXTENSION IF NOT EXISTS vector;

CREATE TABLE IF NOT EXISTS ai_memory (
    id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    content    TEXT NOT NULL,
    embedding  vector(768),
    created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_ai_memory_embedding ON ai_memory USING ivfflat (embedding vector_cosine_ops)
    WITH (lists = 100);

COMMENT ON TABLE ai_memory IS 'Memoria RAG para el asistente de búsqueda — embeddings de 768 dims (gemini-embedding-001)';

-- ============================================================
-- DROPSHIP_PRODUCTS
-- ============================================================
CREATE TABLE IF NOT EXISTS dropship_products (
    id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    title        TEXT NOT NULL,
    source_url   TEXT NOT NULL,
    source_store TEXT NOT NULL DEFAULT 'AliExpress',
    cost_price   NUMERIC NOT NULL,
    sell_price   NUMERIC NOT NULL,
    category     TEXT NOT NULL DEFAULT 'General',
    image_url    TEXT,
    sku          TEXT,
    stock_status TEXT NOT NULL DEFAULT 'in_stock',
    notes        TEXT,
    is_active    BOOLEAN NOT NULL DEFAULT TRUE,
    created_at   TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
    updated_at   TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_dropship_products_is_active ON dropship_products(is_active);
CREATE INDEX IF NOT EXISTS idx_dropship_products_category ON dropship_products(category);

COMMENT ON TABLE dropship_products IS 'Catálogo de productos para el módulo B2B de dropshipping';
COMMENT ON COLUMN dropship_products.stock_status IS 'in_stock | low_stock | out_of_stock';

-- ============================================================
-- DROPSHIP_ORDERS
-- ============================================================
CREATE TABLE IF NOT EXISTS dropship_orders (
    id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    product_id        UUID REFERENCES dropship_products(id) ON DELETE SET NULL,
    product_title     TEXT NOT NULL,
    quantity          INTEGER NOT NULL DEFAULT 1,
    cost_total        NUMERIC NOT NULL,
    sell_total        NUMERIC NOT NULL,
    customer_name     TEXT,
    customer_contact  TEXT,
    platform          TEXT NOT NULL DEFAULT 'Marketplace',
    status            TEXT NOT NULL DEFAULT 'pending',
    tracking_number   TEXT,
    supplier_order_id TEXT,
    notes             TEXT,
    created_at        TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
    updated_at        TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_dropship_orders_status ON dropship_orders(status);
CREATE INDEX IF NOT EXISTS idx_dropship_orders_created_at ON dropship_orders(created_at);

COMMENT ON TABLE dropship_orders IS 'Órdenes del módulo B2B de dropshipping';
COMMENT ON COLUMN dropship_orders.status IS 'pending | ordered | shipped | delivered | cancelled | refunded';
