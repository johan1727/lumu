# Proyecciones de Lumu

Este documento aterriza un modelo simple de crecimiento, costos e ingresos usando los valores visibles hoy en el producto y en el backend.

## Base actual detectada en código

- Plan Gratis: `10` búsquedas por cuenta
- Plan VIP: `40` búsquedas por mes
- Plan B2B: `200` búsquedas por mes
- VIP mensual mostrado en pricing: `$39 MXN/mes`
- B2B mensual mostrado en pricing: `$199 MXN/mes`
- Monetización existente o preparada:
  - Suscripciones Stripe
  - Eventos de compra en analytics
  - Afiliados
  - Ads / rewarded ads
- Costeo técnico ya instrumentado en backend:
  - `EST_COST_GEMINI_GENERATE_USD`
  - `EST_COST_GEMINI_EMBED_USD`
  - `EST_COST_SERPER_SHOPPING_USD`
  - `EST_COST_SERPER_WEB_USD`
  - `EST_COST_SERPER_PLACES_USD`

## Variables que debes llenar con dato real

### Tráfico
- `visitas_mes`
- `usuarios_activos_mes`
- `busquedas_totales_mes`

### Conversión
- `visita_a_registro`
- `registro_a_vip`
- `registro_a_b2b`
- `click_afiliado_rate`

### Costos
- `costo_busqueda_usd`
- `usd_mxn`
- `infra_fija_mxn`

### Monetización adicional
- `ingreso_afiliado_promedio_por_click`
- `rpm_ads_mxn`

## Fórmulas base

### Funnel
- `registros_mes = visitas_mes * visita_a_registro`
- `vip_nuevos_mes = registros_mes * registro_a_vip`
- `b2b_nuevos_mes = registros_mes * registro_a_b2b`

### Revenue mensual
- `mrr_vip = vip_activos * 39`
- `mrr_b2b = b2b_activos * 199`
- `ingreso_afiliados = clicks_afiliados_mes * ingreso_afiliado_promedio_por_click`
- `ingreso_ads = (pageviews_mes / 1000) * rpm_ads_mxn`
- `ingreso_total = mrr_vip + mrr_b2b + ingreso_afiliados + ingreso_ads`

### Costos mensuales
- `costo_variable_mxn = busquedas_totales_mes * costo_busqueda_usd * usd_mxn`
- `costo_total = costo_variable_mxn + infra_fija_mxn`

### Resultado
- `utilidad_bruta = ingreso_total - costo_total`
- `costo_promedio_por_usuario = costo_total / usuarios_activos_mes`
- `arpu = ingreso_total / usuarios_activos_mes`

## Cómo estimar costo por búsqueda

El backend ya registra componentes para estimarlo con estas variables de entorno:

- `EST_COST_GEMINI_GENERATE_USD`
- `EST_COST_GEMINI_EMBED_USD`
- `EST_COST_SERPER_SHOPPING_USD`
- `EST_COST_SERPER_WEB_USD`
- `EST_COST_SERPER_PLACES_USD`

La lógica ya existe en `searchController.js` y calcula:

- llamadas LLM generate
- llamadas embeddings
- Serper Shopping
- Serper Web
- Serper Places

### Recomendación operativa
Usa el promedio de logs reales de `[Search Cost]` durante 7 días para sacar:

- `costo_promedio_busqueda_simple`
- `costo_promedio_busqueda_compleja`
- `costo_promedio_bulk`

Mientras no se consoliden esos logs, usa una banda:

- escenario conservador: costo alto
- escenario base: costo medio
- escenario agresivo: costo bajo por optimización/cache

## Escenario conservador

### Supuestos
- `visitas_mes = 5,000`
- `visita_a_registro = 8%`
- `registro_a_vip = 2%`
- `registro_a_b2b = 0.2%`
- `usuarios_activos_mes = 1,000`
- `busquedas_totales_mes = 4,000`
- `costo_busqueda_usd = 0.01`
- `usd_mxn = 17`
- `infra_fija_mxn = 1,500`
- `vip_activos = 8`
- `b2b_activos = 1`
- `clicks_afiliados_mes = 120`
- `ingreso_afiliado_promedio_por_click = 1.5 MXN`
- `pageviews_mes = 15,000`
- `rpm_ads_mxn = 20`

### Resultado estimado
- `mrr_vip = 312 MXN`
- `mrr_b2b = 199 MXN`
- `ingreso_afiliados = 180 MXN`
- `ingreso_ads = 300 MXN`
- `ingreso_total = 991 MXN`
- `costo_variable_mxn = 680 MXN`
- `costo_total = 2,180 MXN`
- `utilidad_bruta = -1,189 MXN`

## Escenario base

### Supuestos
- `visitas_mes = 20,000`
- `visita_a_registro = 10%`
- `registro_a_vip = 3%`
- `registro_a_b2b = 0.4%`
- `usuarios_activos_mes = 3,500`
- `busquedas_totales_mes = 14,000`
- `costo_busqueda_usd = 0.007`
- `usd_mxn = 17`
- `infra_fija_mxn = 2,500`
- `vip_activos = 60`
- `b2b_activos = 4`
- `clicks_afiliados_mes = 700`
- `ingreso_afiliado_promedio_por_click = 1.8 MXN`
- `pageviews_mes = 60,000`
- `rpm_ads_mxn = 22`

### Resultado estimado
- `mrr_vip = 2,340 MXN`
- `mrr_b2b = 796 MXN`
- `ingreso_afiliados = 1,260 MXN`
- `ingreso_ads = 1,320 MXN`
- `ingreso_total = 5,716 MXN`
- `costo_variable_mxn = 1,666 MXN`
- `costo_total = 4,166 MXN`
- `utilidad_bruta = 1,550 MXN`

## Escenario agresivo

### Supuestos
- `visitas_mes = 75,000`
- `visita_a_registro = 12%`
- `registro_a_vip = 4.5%`
- `registro_a_b2b = 0.8%`
- `usuarios_activos_mes = 12,000`
- `busquedas_totales_mes = 55,000`
- `costo_busqueda_usd = 0.005`
- `usd_mxn = 17`
- `infra_fija_mxn = 5,000`
- `vip_activos = 250`
- `b2b_activos = 12`
- `clicks_afiliados_mes = 4,000`
- `ingreso_afiliado_promedio_por_click = 2 MXN`
- `pageviews_mes = 220,000`
- `rpm_ads_mxn = 25`

### Resultado estimado
- `mrr_vip = 9,750 MXN`
- `mrr_b2b = 2,388 MXN`
- `ingreso_afiliados = 8,000 MXN`
- `ingreso_ads = 5,500 MXN`
- `ingreso_total = 25,638 MXN`
- `costo_variable_mxn = 4,675 MXN`
- `costo_total = 9,675 MXN`
- `utilidad_bruta = 15,963 MXN`

## Lectura de negocio

### Qué te dice este modelo
- Lumu no depende solo de suscripción para sobrevivir
- Afiliados + ads pueden sostener la etapa temprana
- VIP mejora margen si elevas conversión sin disparar costo por búsqueda
- B2B mueve poco volumen de usuarios, pero mucho valor por cuenta

### Qué palancas mueven más el resultado
- subir `visita_a_registro`
- subir `registro_a_vip`
- bajar `costo_busqueda_usd`
- mejorar `click_afiliado_rate`
- crecer tráfico SEO y creators sin subir CAC demasiado

## Objetivos sugeridos a 90 días

- `20,000` visitas/mes
- `2,000` registros acumulados
- `50-75` VIP activos
- `3-5` B2B activos
- costo promedio por búsqueda por debajo de `0.007 USD`
- ingreso mixto mensual mayor a `5,000 MXN`

## Métricas mínimas que debes actualizar semanalmente

- visitas
- búsquedas
- registros
- compras VIP
- compras B2B
- CTR afiliado
- revenue afiliado
- costo promedio por búsqueda
- retención semana 1 / mes 1

## Siguiente mejora recomendada

Conectar este archivo con un dashboard real que lea:

- `searches`
- `profiles`
- `subscriptions`
- `click_events`

para reemplazar supuestos por datos reales.
