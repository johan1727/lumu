-- Migration: Analytics and tracking tables
-- Created: 2026-06-09

-- ============================================================
-- CLICK_EVENTS
-- ============================================================
CREATE TABLE IF NOT EXISTS click_events (
    id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id             UUID REFERENCES profiles(id) ON DELETE SET NULL,
    event_type          TEXT NOT NULL,
    product_title       TEXT,
    store               TEXT,
    url                 TEXT,
    search_query        TEXT,
    is_affiliate        BOOLEAN NOT NULL DEFAULT FALSE,
    affiliate_network   TEXT,
    device              TEXT,
    referrer            TEXT,
    country_code        TEXT,
    canonical_key       TEXT,
    product_category    TEXT,
    position            INTEGER CHECK (position >= 0 AND position <= 500),
    result_source       TEXT,
    store_tier          INTEGER CHECK (store_tier >= 1 AND store_tier <= 3),
    best_buy_score      NUMERIC(4,3) CHECK (best_buy_score >= 0 AND best_buy_score <= 1),
    session_id          TEXT,
    search_id           TEXT,
    engagement_ms       INTEGER CHECK (engagement_ms >= 0 AND engagement_ms <= 86400000),
    price               INTEGER CHECK (price >= 0 AND price <= 999999999),
    feedback_label      TEXT,
    brand               TEXT,
    created_at          TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_click_events_user_id ON click_events(user_id);
CREATE INDEX IF NOT EXISTS idx_click_events_event_type ON click_events(event_type);
CREATE INDEX IF NOT EXISTS idx_click_events_created_at ON click_events(created_at);
CREATE INDEX IF NOT EXISTS idx_click_events_canonical_key ON click_events(canonical_key);

COMMENT ON TABLE click_events IS 'Eventos de analíticas: clicks, vistas, búsquedas, conversiones';
COMMENT ON COLUMN click_events.event_type IS 'click | page_view | search | pricing_view | purchase | favorite | alert_create | compare | ad_view | ad_skip | bounce | auth_modal_open | signup_complete | checkout_click | feedback_positive | zero_results';
COMMENT ON COLUMN click_events.affiliate_network IS 'amazon | mercadolibre | aliexpress | skimlinks | none';
COMMENT ON COLUMN click_events.price IS 'Precio en centavos (divide por 100)';

-- ============================================================
-- LLM_ANALYSIS_LOG
-- ============================================================
CREATE TABLE IF NOT EXISTS llm_analysis_log (
    id                       UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_query               TEXT NOT NULL,
    llm_action               TEXT,
    llm_search_query         TEXT,
    llm_alternatives         JSONB,
    llm_intent_type          TEXT,
    llm_condition            TEXT,
    llm_query_type           TEXT,
    llm_commercial_readiness NUMERIC(4,3) CHECK (llm_commercial_readiness >= 0 AND llm_commercial_readiness <= 1),
    llm_is_speculative       BOOLEAN,
    llm_search_language      TEXT,
    country_code             TEXT,
    created_at               TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_llm_log_created_at ON llm_analysis_log(created_at);
CREATE INDEX IF NOT EXISTS idx_llm_log_action ON llm_analysis_log(llm_action);

COMMENT ON TABLE llm_analysis_log IS 'Log de análisis LLM para monitorear calidad de interpretación de queries';
COMMENT ON COLUMN llm_analysis_log.llm_action IS 'search | ask | commercial_info | general_info | out_of_scope';
COMMENT ON COLUMN llm_analysis_log.llm_query_type IS 'brand_model | generic | conversational | comparison | url_like';

-- ============================================================
-- QUERY_INTENT_MEMORY
-- ============================================================
CREATE TABLE IF NOT EXISTS query_intent_memory (
    id                   UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    normalized_query     TEXT NOT NULL,
    canonical_key        TEXT,
    country_code         TEXT NOT NULL,
    product_category     TEXT,
    product_category_key TEXT,
    store_name           TEXT NOT NULL,
    store_name_key       TEXT NOT NULL,
    clicked_count        NUMERIC NOT NULL DEFAULT 0,
    success_score        NUMERIC NOT NULL DEFAULT 0,
    last_clicked_at      TIMESTAMP WITH TIME ZONE,
    created_at           TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
    updated_at           TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
    UNIQUE (normalized_query, country_code, product_category_key, store_name_key)
);

CREATE INDEX IF NOT EXISTS idx_qim_normalized_query ON query_intent_memory(normalized_query);
CREATE INDEX IF NOT EXISTS idx_qim_success_score ON query_intent_memory(success_score DESC);
CREATE INDEX IF NOT EXISTS idx_qim_country ON query_intent_memory(country_code);

COMMENT ON TABLE query_intent_memory IS 'Aprendizaje de preferencias de tienda por query — alimenta el ranker de resultados';
COMMENT ON COLUMN query_intent_memory.clicked_count IS 'Incrementado con pesos por tipo de evento (click=1, purchase=3, favorite=2)';
COMMENT ON COLUMN query_intent_memory.success_score IS 'Score compuesto de engagement ponderado';

-- ============================================================
-- PRICE_HISTORY
-- ============================================================
CREATE TABLE IF NOT EXISTS price_history (
    id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    normalized_url   TEXT,
    product_title    TEXT NOT NULL,
    store_name       TEXT NOT NULL,
    price            NUMERIC NOT NULL,
    query_key        TEXT,
    created_at       TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_price_history_query_key ON price_history(query_key);
CREATE INDEX IF NOT EXISTS idx_price_history_normalized_url ON price_history(normalized_url);
CREATE INDEX IF NOT EXISTS idx_price_history_created_at ON price_history(created_at);

COMMENT ON TABLE price_history IS 'Historial de precios para calcular tendencias y benchmarks';
COMMENT ON COLUMN price_history.query_key IS 'Clave de cache como "ct_MX_{query_normalizado}" para agrupar por producto';
