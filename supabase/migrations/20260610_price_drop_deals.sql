-- Función: get_price_drop_deals
-- Detecta caídas de precio reales en price_history (precio actual vs máximo del periodo)
-- Usada por GET /api/deals como fallback cuando MELI no devuelve ofertas.

CREATE OR REPLACE FUNCTION public.get_price_drop_deals(
    p_days int DEFAULT 30,
    p_min_drop numeric DEFAULT 0.10,
    p_limit int DEFAULT 8
)
RETURNS TABLE (
    product_title text,
    store_name text,
    current_price numeric,
    max_price numeric,
    discount_pct int
)
LANGUAGE sql
STABLE
SET search_path = public, pg_temp
AS $$
WITH latest AS (
    SELECT DISTINCT ON (query_key) query_key, product_title, store_name, price
    FROM price_history
    WHERE query_key IS NOT NULL
      AND created_at > now() - make_interval(days => p_days)
    ORDER BY query_key, created_at DESC
),
peak AS (
    SELECT query_key, MAX(price) AS max_price
    FROM price_history
    WHERE query_key IS NOT NULL
      AND created_at > now() - make_interval(days => p_days)
    GROUP BY query_key
)
SELECT l.product_title, l.store_name, l.price, p.max_price,
       ROUND((1 - l.price / NULLIF(p.max_price, 0)) * 100)::int
FROM latest l
JOIN peak p USING (query_key)
WHERE l.price > 0
  AND l.product_title IS NOT NULL
  AND p.max_price > l.price * (1 + p_min_drop)
ORDER BY 5 DESC
LIMIT p_limit;
$$;

-- Solo el backend (service_role) puede llamarla
REVOKE EXECUTE ON FUNCTION public.get_price_drop_deals(int, numeric, int) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.get_price_drop_deals(int, numeric, int) TO service_role;
