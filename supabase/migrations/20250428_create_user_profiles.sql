-- Migration: Create user_profiles table for personalization
-- Created: 2025-04-28

CREATE TABLE IF NOT EXISTS user_profiles (
    user_id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
    
    -- Preferencias extraídas del comportamiento
    category_affinities JSONB DEFAULT '{}',  -- { "smartphone": 0.8, "laptop": 0.6 }
    price_range_preference JSONB DEFAULT '{"min": null, "max": null, "currency": "MXN"}',
    brand_preferences JSONB DEFAULT '{}',    -- { "samsung": 0.7, "apple": 0.3 }
    feature_priorities JSONB DEFAULT '{}',   -- { "buena_camara": 0.9, "bateria": 0.8 }
    
    -- Patrones de comportamiento
    search_patterns JSONB DEFAULT '{
        "total_searches": 0,
        "avg_session_duration_sec": 0,
        "preferred_times": [],
        "click_through_rate": 0
    }',
    
    -- Preferencias explícitas del usuario
    preferred_stores JSONB DEFAULT '[]',     -- ["amazon", "mercado_libre"]
    excluded_stores JSONB DEFAULT '[]',      -- Tiendas que el usuario evita
    condition_preference TEXT DEFAULT 'new',   -- new, used, refurbished, any
    
    -- Configuración de personalización
    personalization_enabled BOOLEAN DEFAULT true,
    auto_apply_filters BOOLEAN DEFAULT true,
    
    -- Metadatos
    last_search_at TIMESTAMP WITH TIME ZONE,
    last_updated TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Índices para consultas rápidas
CREATE INDEX IF NOT EXISTS idx_user_profiles_category_affinities ON user_profiles USING GIN (category_affinities);
CREATE INDEX IF NOT EXISTS idx_user_profiles_brand_preferences ON user_profiles USING GIN (brand_preferences);
CREATE INDEX IF NOT EXISTS idx_user_profiles_last_updated ON user_profiles(last_updated);

-- Trigger para actualizar last_updated automáticamente
CREATE OR REPLACE FUNCTION update_user_profiles_timestamp()
RETURNS TRIGGER AS $$
BEGIN
    NEW.last_updated = NOW();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trigger_update_user_profiles ON user_profiles;
CREATE TRIGGER trigger_update_user_profiles
    BEFORE UPDATE ON user_profiles
    FOR EACH ROW
    EXECUTE FUNCTION update_user_profiles_timestamp();

-- Políticas RLS (Row Level Security)
ALTER TABLE user_profiles ENABLE ROW LEVEL SECURITY;

-- Usuarios solo ven/editan su propio perfil
CREATE POLICY "Users can view own profile" ON user_profiles
    FOR SELECT USING (auth.uid() = user_id);

CREATE POLICY "Users can update own profile" ON user_profiles
    FOR UPDATE USING (auth.uid() = user_id);

-- Solo el servicio backend puede crear perfiles
CREATE POLICY "Service can create profiles" ON user_profiles
    FOR INSERT WITH CHECK (true);

-- Comentarios de documentación
COMMENT ON TABLE user_profiles IS 'Perfiles de usuario para personalización predictiva';
COMMENT ON COLUMN user_profiles.category_affinities IS 'Puntuación de afinidad por categoría (0-1)';
COMMENT ON COLUMN user_profiles.brand_preferences IS 'Puntuación de preferencia por marca (0-1)';
COMMENT ON COLUMN user_profiles.feature_priorities IS 'Features que el usuario valora (0-1)';
COMMENT ON COLUMN user_profiles.search_patterns IS 'Patrones de comportamiento de búsqueda';
