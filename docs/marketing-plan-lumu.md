# Plan de Marketing — Lumu (2026-06-12)

> Aterrizado en el producto real y construido con las skills `marketing-psychology` y `marketing-ideas`.
> Cada movida apunta a (1) una etapa AARRR y (2) el principio psicológico que la respalda.

## Estado actual (honesto)

- **Producto**: comparador de precios con IA para LATAM. Busca en Amazon, Mercado Libre y tiendas locales y dice *dónde conviene*.
- **Monetización**: freemium (2 búsq/día, 10/mes gratis) → VIP $39 MXN/mes o $399/año (40 búsq/mes, sin anuncios, Deep Research, alertas) → Mayorista/B2B $199/mes o $1,999/año (200 búsq, bulk search, export Excel, para revendedores/importadores). Más afiliados (Amazon, ML) y AdSense.
- **Regiones**: MX (principal), US, CL, CO, AR, PE, BR.
- **Activos de crecimiento ya construidos**: rutas SEO dinámicas (`/buscar/:slug`, `/precio-hoy`, `/comparativas`), alertas de precio por Telegram, sistema de referidos (+40 búsquedas al referidor), Lumu Coins (gamificación → VIP temporal 1h), ticker de prueba social, countdown de flash deals.
- **Suscripciones de pago activas: 0.** Los 2 perfiles premium son cuentas internas. → **El cuello de botella NO es la conversión del paywall todavía; es el tráfico calificado en el tope del embudo + el bucle viral.** (Theory of Constraints: arregla el tráfico antes de optimizar el paywall.)

**North Star sugerida**: *búsquedas semanales que revelan un ahorro real* (el momento "ajá"). Todo lo demás alimenta esto.

---

## Las 3 grandes apuestas (próximos 90 días)

### 1. SEO programático — el activo más grande e infrautilizado (Acquisition)
Ya tienes `/precio-hoy/:slug` y `/comparativas/:slug`. El público LATAM busca en Google *"precio de [producto] hoy"*, *"[A] vs [B]"*, *"[producto] más barato"*. Esto es intención de compra puro.

- **Por qué encaja**: Compounding + Flywheel — cada página rankea, trae tráfico, que genera datos de precio, que mejora las páginas. (marketing-ideas #1, #4)
- **Cómo empezar**:
  1. Generar páginas para el top 200–500 de productos más buscados por región (celulares, laptops, freidoras, TVs — las categorías que ya tienes en la barra).
  2. Cada página: precio actual + histórico (ya tienes `price_history`), "mínimo rastreado", CTA a búsqueda en vivo. Schema.org `Product`/`Offer` para rich snippets.
  3. Sitemap dinámico + enlazado interno entre comparativas relacionadas.
- **Psicología**: Availability Heuristic (mostrar el ahorro hace que se sienta alcanzable) + Anchoring (precio máximo rastreado tachado).
- **Resultado esperado**: tráfico orgánico de cola larga que crece sin gasto en ads. Es el motor de adquisición #1 para un comparador.

### 2. Bucle viral "Me ahorré $X" — LATAM es WhatsApp/Telegram-first (Referral)
Cada resultado de búsqueda que revela un ahorro es contenido compartible.

- **Por qué encaja**: Mimetic Desire + Social Proof — la gente comparte ahorros y otros quieren lo mismo. (marketing-ideas #93 viral loops)
- **Cómo empezar**:
  1. Botón "Compartir mi ahorro" en cada resultado → genera imagen/tarjeta ("Encontré [producto] $X más barato con Lumu") con link de referido pre-incrustado.
  2. Compartir nativo a WhatsApp/Telegram (no solo copiar link).
  3. El referido que se registra ya da +40 búsquedas al referidor (ya existe) — hazlo visible: "Tu amigo te regaló 40 búsquedas".
- **Psicología**: Reciprocity (regalas búsquedas) + Endowment (ya "posee" el ahorro) + Goal-Gradient (barra "te faltan 2 referidos para 1 mes VIP gratis").
- **Resultado esperado**: coeficiente viral > 0; adquisición a costo casi cero en el canal dominante de la región.

### 3. Telegram como canal de retención y re-enganche (Retention)
Ya tienes el bot de alertas de precio. Eso es un canal de retención propio (sin depender de email).

- **Por qué encaja**: Zeigarnik (alerta abierta = bucle sin cerrar) + Loss Aversion ("el precio que vigilas bajó — no te lo pierdas"). (marketing-ideas #45-53 lifecycle)
- **Cómo empezar**:
  1. Al primer resultado, nudge: "Activa alerta en Telegram y te avisamos cuando baje" (ya hay one-click — bien).
  2. Mensajes de re-enganche: bajadas de precio, flash deals del día, "tu búsqueda de la semana pasada bajó $X".
  3. Cada push trae al usuario de vuelta → más búsquedas → más cerca del paywall.
- **Resultado esperado**: usuarios que vuelven solos; mayor LTV y más toques antes de la conversión (Rule of 7).

---

## Quick wins (esta semana, bajo esfuerzo)

| Movida | Etapa | Psicología | Nota |
|---|---|---|---|
| Product Hunt / lanzamiento en comunidades de ofertas (PromoDescuentos MX, r/mexico, grupos FB de ofertas) | Acquisition | Social Proof | marketing-ideas #38, #78. Donde ya vive tu público. |
| Decoy en pricing: mostrar B2B $199 al lado de VIP $39 | Revenue | Decoy + Anchoring | Hace que VIP se sienta obvio. Ya tienes los tiers. |
| Plan anual pre-seleccionado por defecto con badge "ahorra 15%" | Revenue | Default Effect + Mental Accounting ("$33/mes") | Sube el LTV inicial. |
| Garantía visible "Cancela cuando quieras · 7 días de reembolso" | Revenue | Regret Aversion | Reduce el miedo a suscribirse. |
| En el paywall (402): mostrar cuánto **ahorró** el usuario esta semana antes de pedir upgrade | Activation→Revenue | Loss Aversion + Peak-End | "Te ahorramos $X. Sigue ahorrando con VIP." |

---

## Lo que NO hacer ahora (foco)

- **Paid ads a escala**: aún no. Sin CAC validado ni bucle viral, quemas presupuesto. Primero SEO + viral (orgánicos).
- **Expandir a las 7 regiones por igual**: profundidad antes que amplitud (Critical Mass). Domina MX primero; el contenido SEO y la prueba social se concentran.
- **Más features**: el producto ya tiene de sobra. El cuello de botella es distribución, no producto.

---

## Medición

- **North Star**: búsquedas/semana que revelan ahorro.
- **Indicadores líderes**: páginas SEO indexadas y su tráfico orgánico; coeficiente viral (referidos/usuario); % de usuarios con alerta Telegram activa; búsquedas free agotadas/semana (señal de demanda lista para paywall).
- **Conversión**: free → VIP, y toques antes de convertir (Rule of 7).

---

## Decisiones abiertas (para Johan)

1. **CAC desconocido** — la dependencia #1. Hasta validar el bucle viral, no escalar paid.
2. ¿Foco 100% MX por ahora, o mantener US como segunda apuesta (precios en USD)?
3. ¿El tier B2B "Mayorista" tiene demanda real? Si sí, merece su propio embudo (outbound a importadores/revendedores; marketing-ideas #57 expert networks).

---

*Generado con las skills `marketing-psychology` (v2.0) y `marketing-ideas` (v2.0). Nota: faltan los archivos `references/*.md` de esas skills (p. ej. la lista completa de 139 ideas), por lo que las referencias por número son aproximadas al catálogo por categoría.*
