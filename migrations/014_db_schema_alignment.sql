-- 014_db_schema_alignment.sql
-- Alinea el schema con el código actual que inserta en click_events y llm_analysis_log
-- Safe to run multiple times (idempotent)

-- ============================================================
-- 1) CLICK_EVENTS: Agregar columnas faltantes usadas por Stripe/analytics
-- ============================================================

ALTER TABLE public.click_events 
  ADD COLUMN IF NOT EXISTS session_id TEXT,
  ADD COLUMN IF NOT EXISTS position INTEGER,
  ADD COLUMN IF NOT EXISTS result_source TEXT,
  ADD COLUMN IF NOT EXISTS store_tier INTEGER,
  ADD COLUMN IF NOT EXISTS best_buy_score NUMERIC,
  ADD COLUMN IF NOT EXISTS search_id UUID,
  ADD COLUMN IF NOT EXISTS engagement_ms INTEGER,
  ADD COLUMN IF NOT EXISTS action_context TEXT,
  ADD COLUMN IF NOT EXISTS price NUMERIC,
  ADD COLUMN IF NOT EXISTS feedback_label TEXT,
  ADD COLUMN IF NOT EXISTS brand TEXT;

-- Indexes para analytics eficiente
CREATE INDEX IF NOT EXISTS idx_click_events_session_id ON public.click_events(session_id);
CREATE INDEX IF NOT EXISTS idx_click_events_search_id ON public.click_events(search_id);
CREATE INDEX IF NOT EXISTS idx_click_events_result_source ON public.click_events(result_source);

-- ============================================================
-- 2) LLM_ANALYSIS_LOG: Agregar columnas faltantes usadas por searchController
-- ============================================================

ALTER TABLE public.llm_analysis_log 
  ADD COLUMN IF NOT EXISTS llm_query_type TEXT,
  ADD COLUMN IF NOT EXISTS llm_commercial_readiness NUMERIC,
  ADD COLUMN IF NOT EXISTS llm_is_speculative BOOLEAN DEFAULT false,
  ADD COLUMN IF NOT EXISTS llm_search_language TEXT;

-- ============================================================
-- 3) PRICE_HISTORY: Asegurar índices para comparar precios históricos
-- ============================================================

CREATE INDEX IF NOT EXISTS idx_price_history_query_key ON public.price_history(query_key);
CREATE INDEX IF NOT EXISTS idx_price_history_created_at ON public.price_history(created_at DESC);

-- ============================================================
-- 4) QUERY_INTENT_MEMORY: Agregar columnas si faltan para tracking de preferencias
-- ============================================================

-- Verificar y agregar columnas que podrían faltar para tienda preferida tracking
DO $$
BEGIN
    -- Agregar columnas para tracking de preferencias de tienda si no existen
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns 
                   WHERE table_name = 'query_intent_memory' AND column_name = 'preferred_store_key') THEN
        ALTER TABLE public.query_intent_memory ADD COLUMN preferred_store_key TEXT;
    END IF;
    
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns 
                   WHERE table_name = 'query_intent_memory' AND column_name = 'clicked_store_name') THEN
        ALTER TABLE public.query_intent_memory ADD COLUMN clicked_store_name TEXT;
    END IF;
END $$;

-- Index para búsquedas por tienda preferida
CREATE INDEX IF NOT EXISTS idx_query_intent_store_key ON public.query_intent_memory(preferred_store_key) 
  WHERE preferred_store_key IS NOT NULL;

