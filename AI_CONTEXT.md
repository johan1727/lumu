# AI_CONTEXT

Este archivo resume la arquitectura y contexto operativo de Lumu para cualquier desarrollador o asistente de IA.

## Resumen del producto
Lumu es un comparador de precios con IA orientado a LATAM y US. Combina búsqueda conversacional, resultados de Google Shopping/Web/Places vía Serper, scrapers directos y lógica de confianza por tienda para mostrar opciones más relevantes, seguras y localizadas.

## Stack principal
- Backend: Node.js + Express
- Base de datos: Supabase
- Cache: memoria + Redis opcional + Supabase
- Frontend: HTML + JavaScript vanilla
- IA: servicio LLM en `src/services/llmService.js`
- Búsqueda externa: Serper API (`shopping`, `search`, `places`)

## Flujo principal de búsqueda
1. El frontend manda `query`, filtros, ubicación y `country` al backend.
2. `src/controllers/searchController.js`:
   - detecta país real con `regionConfigService.resolveCountry()`
   - analiza intención con LLM
   - revisa cache
   - llama `shoppingService.searchGoogleShopping(...)`
   - filtra, deduplica, rankea y aplica trust tiers
   - inyecta cupones, historial y señales de precio
3. `src/services/shoppingService.js`:
   - usa Serper Shopping/Web/Places con `gl` y `hl` regionales
   - ejecuta scrapers directos dependiendo del país
4. El frontend renderiza cards, badges, filtros y contexto regional.

## Servicios clave
- `src/services/regionConfigService.js`
  - Configuración por país: moneda, locale, `gl`, `hl`, dominios y tiendas.
- `src/services/shoppingService.js`
  - Orquesta Serper + scrapers + lugares cercanos.
- `src/services/directScraper.js`
  - Scrapers directos de tiendas y MercadoLibre API pública.
- `src/services/storeTrustService.js`
  - Clasifica tiendas por nivel de confianza, seller model y penalizaciones de ranking.
- `src/services/cacheService.js`
  - Cache de búsquedas y snapshots de historial de precios, separado por país.
- `src/services/couponService.js`
  - Cupones activos por tienda y país.

## Geo-detección
Orden de prioridad:
1. País explícito enviado por frontend
2. Header `x-vercel-ip-country`
3. Accept-Language
4. Timezone fallback en frontend
5. Default `MX`

## Países soportados actualmente
- MX
- CL
- CO
- AR
- PE
- US

## Estado actual importante
- Ya existe geo-detección multi-país
- Ya existe separación de cache por país
- Ya existe integración de MercadoLibre API por país
- Ya existe detector de descuentos falsos con historial
- Scrapers MX ya no deben correr en CL/CO/AR/PE

## Limitaciones conocidas
- La landing aún tiene contenido demo/hardcodeado que puede requerir más regionalización visual
- Muchos scrapers directos siguen siendo específicos de MX, aunque ya no se ejecutan fuera de MX
- El frontend es vanilla JS grande; cambios visuales requieren cuidado por su tamaño
- `public/app.js` no se puede validar con `require()` en Node porque depende de `window`

## Variables de entorno relevantes
- `SERPER_API_KEY`
- `SUPABASE_URL`
- `SUPABASE_ANON_KEY`
- `REDIS_URL` (opcional)
- `STRIPE_PAYMENT_LINK`
- `STRIPE_B2B_PAYMENT_LINK`
- `VAPID_PUBLIC_KEY`
- `SCRAPER_PROXIES` (opcional)

## Riesgos al modificar
- `searchController.js` es crítico y grande: afecta ranking, filtros, cache, historial y cupones
- `public/app.js` concentra mucha lógica de UI y estado
- Cambios en `shoppingService.js` impactan cobertura regional y calidad de resultados
