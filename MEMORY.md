# MEMORY.md - Memoria del Proyecto Lumu

> **Comando**: Dime "actualiza memory.md" al final de cada sesión para agregar un resumen.

---

## 📋 Historial de Sesiones

### 2026-05-03 - Psicología de Ventas Fase 1 — Conversión a VIP/B2B

**Objetivo**: Aumentar conversión a planes de pago aplicando 7 técnicas de psicología de ventas.

**Archivos modificados**:
- `public/index.html` — Hero copy + franja de tiendas + Pricing CTA rediseñado
- `public/precios.html` — Reordenamiento de tarjetas + testimonios + copy mejorado
- `public/app.js` — Banner de urgencia de búsquedas restantes

**Cambios implementados**:

**`index.html` — Hero (Reciprocidad + Autoridad Prestada)**
- ✅ Título reformulado: *"Te regalamos el precio más bajo. En segundos, en 10+ tiendas."*
- ✅ Badge: *"Gratis para siempre — sin tarjeta"* (elimina miedo al compromiso)
- ✅ Franja de logos: Amazon · Mercado Libre · Walmart · Liverpool · Coppel · Best Buy · Sam's
- ✅ Subtítulo actualizado con valor concreto: "para que nunca pagues de más"

**`index.html` — Pricing CTA (Ancla Cognitiva + Contraste Perceptual)**
- ✅ Muestra `$199 B2B` primero → `$39 VIP` parece accesible por contraste
- ✅ Grid Free (negativo/gris) vs VIP (positivo/verde) — contraste visual directo
- ✅ Social proof: "+1,200 usuarios ya comparan con VIP"
- ✅ Anti-objeción: "Sin compromisos · Cancela cuando quieras · Pago seguro con Stripe"
- ✅ CTA principal: "Quiero VIP por $39/mes →" (orientado a acción)

**`precios.html` — Estructura (Ancla + Prueba Social + Escasez)**
- ✅ Tarjetas reordenadas: B2B $199 → VIP $39 (centro, destacado) → Free (atenuado, al final)
- ✅ VIP tiene botón CTA sólido verde con gradiente (antes era solo borde)
- ✅ Precio tachado en VIP: "Valor de mercado: ~$120 MXN/mes" — ancla de referencia
- ✅ 3 micro-testimonios con nombre, ciudad, 5 estrellas bajo las tarjetas
- ✅ Hero reformulado con ancla cognitiva y social proof arriba del fold

**`app.js` — Banner de Escasez (Urgencia Real)**
- ✅ Función `showSearchesRemainingBanner(usedCount, dailyLimit, vipUrl)` al final del archivo
- ✅ Aparece después de la 2ª búsqueda exitosa para usuarios sin cuenta (anónimos)
- ✅ 4 niveles de urgencia progresiva: blanco → amarillo → naranja → rojo
- ✅ CTA embebido: "Quiero VIP →" apuntando a `stripePaymentLink || '/precios.html'`
- ✅ Auto-dismiss en 8 segundos, botón ✕ para cerrar manualmente
- ✅ Bilingual: ES/EN según `currentRegion`

**Técnicas aplicadas** (del framework de 7 técnicas):
1. ✅ Reciprocidad — "Te regalamos..." en hero
2. ✅ Ancla cognitiva — B2B $199 hace que $39 parezca barato
3. ✅ Contraste perceptual — Free (negativo) vs VIP (positivo)
4. ✅ Prueba social — testimonios + conteo de usuarios
5. ✅ Autoridad prestada — logos de tiendas reconocidas
6. ✅ Escasez artificial — contador de búsquedas restantes con urgencia
7. ⏳ Compromiso y consistencia — pendiente (micro-compromiso guardar búsqueda)

**KPIs a monitorear post-deploy**:
- CTR del botón "Quiero VIP" en pricing section (GA4)
- Tasa de conversión free → VIP en /precios.html
- Bounce rate de la página de precios
- % usuarios que hacen click en el banner de urgencia

**Pendiente (Fase 2-3)**:
- [ ] Modal upgrade con exit-intent + contraste de precio
- [ ] Referral 5+5 (da 5 búsquedas, gana 5)
- [ ] Micro-compromiso: guardar búsqueda antes del registro completo
- [ ] Contador dinámico de usuarios activos en resultados

**Tags**: `#ventas` `#conversion` `#psicologia-ventas` `#pricing` `#ux` `#feature` `#2026-05-03`

---

### 2026-05-03 - Sistema de Referidos 5+5 + Bonus VIP

**Objetivo**: Programa de referidos completo — compromiso + consistencia + reciprocidad.

**Archivos modificados**:
- `src/controllers/searchController.js` — Endpoints `getReferralCode` y `claimReferral`
- `src/controllers/stripeController.js` — Bonus VIP al referidor cuando amigo paga
- `src/routes/api.js` — Rutas `GET /api/referral/code` y `POST /api/referral/claim`
- `public/app.js` — Captura `?ref=CODE`, auto-canje al registrarse, tarjeta UI en perfil
- `public/index.html` — Tarjeta de referidos en modal de perfil
- `migrations/015_referral_system.sql` — Columnas `referral_code`, `referred_by`, `referral_vip_rewarded`

**Mecánica implementada**:
- **5+5 al registrarse**: nuevo usuario usa `?ref=CODE` → ambos reciben 5 bonus en `rate_limits`
- **40 bonus VIP**: cuando el nuevo referido paga VIP → webhook Stripe detecta `referred_by` → da 40 créditos extra al referidor (equivale a 1 mes gratis)
- **Anti-abuse**: solo cuentas nuevas (< 7 días), 1 canje por usuario (`referral-used:user:{id}` en rate_limits), `referral_vip_rewarded` previene duplicados del bonus VIP
- **UI**: tarjeta en modal de perfil con input copiable + botón "Compartir por WhatsApp / Redes" (usa `navigator.share` o fallback a `wa.me`)
- **Persistencia OAuth**: `?ref=CODE` se guarda en `sessionStorage` antes del redirect OAuth, se recupera al volver

**Patrón de bonus usado** (consistente con sistema existente):
```
bonus:user:{userId}     → créditos de búsqueda extra
referral-used:user:{id} → idempotencia de canje
```

**⚠️ Acción requerida**:
- Ejecutar `migrations/015_referral_system.sql` en Supabase SQL Editor

**Tags**: `#ventas` `#referidos` `#feature` `#supabase` `#stripe` `#2026-05-03`

---

### 2026-04-10 - SEO Completo Fases 3-4 Implementadas
**Resumen**: Implementadas Fases 3 (Estructura) y 4 (Schema.org) del plan SEO completo.

**Cambios implementados**:
- ✅ Footer SEO con 4 columnas y 25+ internal links
- ✅ Article schema en celulares-baratos.html
- ✅ Estructura de internal linking para mejorar indexación

**Impacto esperado**:
- Mejor descubrimiento de páginas por Googlebot
- Rich snippets en SERPs (celulares-baratos.html)
- Distribución mejorada de link equity

**Siguientes pasos**:
- Fase 5: Core Web Vitals (LCP, CLS, INP)
- Fase 6: Estrategia de contenido y keywords
- Aplicar schemas a más páginas de contenido

**Tags**: `#seo` `#internal-linking` `#schema-org` `#rich-snippets` `#2026-04-10`

---

### 2026-04-10 - SEO Técnico Implementado (Fases 1 & 2)
**Resumen**: Implementado plan técnico SEO para arreglar indexación y Core Web Vitals.

**Problemas identificados**:
- 42 de 59 páginas sin indexar (71% del sitio invisible)
- `robots.txt` tenía `Crawl-delay: 1` que ralentizaba Google
- Sitemap faltaba ~15 páginas nuevas
- Sin Schema.org structured data

**Cambios implementados**:
- ✅ Eliminado `Crawl-delay` de robots.txt
- ✅ Agregadas URLs faltantes a sitemap.xml (404.html, privacy, terms, admin)
- ✅ Implementado Schema.org WebSite con SearchAction
- ✅ Agregados preload hints para CSS crítico y fuentes
- ✅ Preparado para optimizaciones LCP/CLS

**Herramientas usadas**:
- Google Search Console (diagnóstico)
- Plan técnico seo-technical-optimization-d14143.md

**Resultados esperados**:
- Mejor crawl rate de Google en 1-2 semanas
- Rich snippets en SERPs
- Mejores Core Web Vitals scores

**KPIs a monitorear**:
- % páginas indexadas (meta: 80%+ en 30 días)
- LCP < 2.5s
- CLS < 0.1

**Tags**: `#seo` `#technical-seo` `#indexation` `#core-web-vitals` `#2026-04-10`

---

### 2026-04-09 - Sistema de Reglas y Documentación para IA
**Resumen**: Creado sistema completo de reglas y memoria para mejorar vibecoding con Cascade/Windsurf.

**Archivos creados**:
- `.windsurfrules` - Reglas específicas de Windsurf/Cascade
- `CLAUDE.md` - Reglas generales del proyecto (detectadas automáticamente del código)
- `MEMORY.md` - Memoria de sesiones con sistema de tags
- `/docs/guides/` - Documentación técnica:
  - `dark-mode.md` - Guía de dark mode
  - `localstorage-patterns.md` - Patrones de localStorage
  - `seo-checklist.md` - Checklist de SEO
  - `service-worker.md` - Guía del Service Worker
  - `ui-ux-best-practices.md` - Best practices de UI/UX (basado en investigación)
  - `README.md` - Índice de guías

**Deciciones importantes**:
- Sistema de tags para búsqueda rápida (#localstorage, #service-worker, etc.)
- Comando "actualiza memory.md" para actualizar memoria al final de sesiones
- CLAUDE.md es leído automáticamente por Cascade (estándar similar a .cursorrules)
- Documentación vive en el repo para acceso fácil

**Tags**: `#docs` `#feature` `#2026-04-09`

---

### 2026-04-09 - Fix Storage Quota + Service Worker Auto-Reload
**Resumen**: Implementado fix para error de localStorage quota exceeded y sistema de auto-reload para el Service Worker.

**Cambios principales**:
- Creada función `compressProductForSnapshot()` para reducir payload
- Implementado `pruneOldestSnapshots()` con límite de 20 snapshots
- Agregado manejo de `QuotaExceededError` con retry
- Service Worker ahora notifica a clientes cuando hay nueva versión
- Frontend escucha `controllerchange` y recarga automáticamente
- Actualizado cache busting a `v=sw_auto_reload_v2`

**Deciciones importantes**:
- Limitar snapshots a 10 productos máximo por búsqueda
- Usar slicing de strings para campos largos (título 200chars, URLs 500chars)
- Sentry reporting solo si está disponible (sin fallar si no existe)

**TODOs pendientes**:
- [ ] Monitorear si el error de quota vuelve a aparecer en producción
- [ ] Considerar IndexedDB para storage de mayor capacidad en el futuro

---

## 🧠 Patterns Descubiertos

### Manejo de localStorage Seguro
```javascript
const MAX_SNAPSHOTS = 20;
const MAX_SIZE = 4000000;

function saveWithQuotaCheck(key, data) {
  try {
    localStorage.setItem(key, JSON.stringify(data));
  } catch (err) {
    if (err.name === 'QuotaExceededError') {
      pruneOldData();
      retrySave();
    }
  }
}
```

### Service Worker Auto-Reload
```javascript
navigator.serviceWorker.addEventListener('controllerchange', () => {
  window.location.reload();
});

navigator.serviceWorker.addEventListener('message', (event) => {
  if (event.data?.type === 'SW_ACTIVATED') {
    window.location.reload();
  }
});
```

---

## 📝 Notas Técnicas

### Cache Busting Strategy
- Usar versión en query param: `?v=nombre_version`
- Cambiar versión cuando hay fix crítico
- El SW usa fecha ISO: `new Date().toISOString().slice(0, 10)`

### Dark Mode Implementation
- Clase `dark` en `<html>` tag
- CSS custom properties en `input.css`
- Override de Tailwind classes con `.dark .bg-white`

---

## 🚀 Ideas Futuras

- [ ] Migrar localStorage a IndexedDB para mayor capacidad
- [ ] Implementar sistema de "session notes" para el usuario
- [ ] Crear dashboard de analytics para ver uso real de features
- [ ] Agregar más tests automáticos para regresiones
- [ ] Optimizar Core Web Vitals (LCP, CLS, INP)

---

## ⚠️ Problemas Conocidos

### Resueltos ✅
- [x] Error de quota en localStorage (2026-04-09)
- [x] Cache del SW no se actualizaba automáticamente (2026-04-09)

### Pendientes 🔧
- [ ] CSP errors con scripts externos (skimlinks, adtrafficquality)
- [ ] Consola muestra warnings de deprecated meta tags
- [ ] Map files de cdn.jsdelivr.net bloqueados por CSP

---

## 📊 Métricas Importantes

- **localStorage keys**: `lumu_theme`, `lumu_local_history`, `lumu_search_snapshots`
- **MAX_SNAPSHOTS**: 20
- **MAX_SNAPSHOT_SIZE_BYTES**: 4,000,000
- **Service Worker Cache**: Cache-first para estáticos, network-first para API

---

---

## 🏷️ Sistema de Tags

Busca rápido usando estos tags:

### Por Tecnología
- `#localstorage` - Manejo de localStorage, quota, compresión
- `#service-worker` - SW, cache, PWA, auto-reload
- `#supabase` - Base de datos, auth, queries
- `#tailwind` - Estilos, dark mode, CSS
- `#seo` - Meta tags, Schema.org, Open Graph

### Por Tipo de Trabajo
- `#fix` - Correcciones de bugs
- `#feature` - Nuevas funcionalidades
- `#refactor` - Mejoras de código
- `#docs` - Documentación
- `#performance` - Optimizaciones

### Por Área
- `#ui` - Interfaz de usuario
- `#backend` - API, serverless functions
- `#frontend` - JavaScript, HTML, CSS
- `#security` - CSP, auth, validaciones
- `#deployment` - Git, Vercel, hosting

### Tags de Sesiones
- `#2026-04-09` - Fix storage quota + SW auto-reload + Sistema de documentación

---

## 🔍 Investigación: Repositorios de IA para Coding

### 2026-04-09 - Repositorios Analizados

**Google Stitch** (`labs.google.com/stitch`)
- Herramienta de Google Labs para diseñar UI con AI
- Genera interfaces completas desde texto/imágenes
- Exporta a código (React, HTML, etc.)
- Features útiles: multi-screen generation, infinite canvas, interactive prototyping
- **Aplicación para Lumu**: Podemos usarlo para prototipar nuevas pantallas rápidamente

**nextlevelbuilder/ui-ux-pro-max-skill**
- Skill de Claude Code con reglas profesionales de UI/UX
- Incluye 50+ estilos, 161 paletas de color, 57 combinaciones de fuentes
- 99 guidelines de UX organizadas por prioridad
- **Integrado a nuestro sistema**: Agregando mejores prácticas a CLAUDE.md

**thedotmack/claude-mem**
- Plugin de memoria automática para Claude Code
- Similar a lo que creamos manualmente con MEMORY.md
- Usa SQLite + Chroma para búsqueda vectorial
- **Veredicto**: Nuestro sistema manual es más simple y funciona igual para un solo usuario

---

## 🎨 UI/UX Best Practices (De ui-ux-pro-max-skill)

### Reglas CRÍTICAS a aplicar en Lumu:

**Accessibility**
- [ ] Color contrast mínimo 4.5:1 para texto normal
- [ ] Focus rings visibles en elementos interactivos (2-4px)
- [ ] aria-label para botones de solo íconos
- [ ] Full keyboard navigation support
- [ ] Respetar `prefers-reduced-motion` para animaciones

**Touch & Interaction**
- [ ] Touch targets mínimo 44×44px (Apple) o 48×48px (Material)
- [ ] Mínimo 8px gap entre touch targets
- [ ] Visual feedback en press (ripple/highlight)
- [ ] No usar hover como única interacción (mobile-first)
- [ ] Safe area awareness (notch, gesture bar, screen edges)

**Dark Mode Profesional**
- [ ] Surface readability: cartas/superficies claramente separadas del fondo
- [ ] Texto primary >=4.5:1, secondary >=3:1 contrast
- [ ] Separadores visibles en ambos temas
- [ ] Estados (pressed/focused/disabled) igualmente distinguibles
- [ ] Token-driven theming (no hardcoded hex values)
- [ ] Modal scrim 40-60% black para legibilidad

**Layout & Spacing**
- [ ] Safe-area compliance (headers/tab bars)
- [ ] Sistema de spacing 4/8px rhythm
- [ ] 8dp spacing hierarchy: 16/24/32/48
- [ ] Readable text measure (no edge-to-edge en tablets)
- [ ] Scroll insets para no ocultar contenido detrás de barras fijas

**Pre-Delivery Checklist**
- [ ] Visual quality: spacing consistente, borders uniformes
- [ ] Interaction: loading states, error feedback, tap targets
- [ ] Light/Dark mode: ambos temas funcionan
- [ ] Layout: safe areas, responsive
- [ ] Accessibility: contrast ratios, focus states, keyboard nav

---

### 2026-05-03 — Auditoría Serper + Límites + Security Fixes + Afiliados

**Objetivo**: Reducir gasto de créditos Serper, verificar límites de plan, fixear alertas de seguridad Supabase, y limpiar warnings de arranque.

**Archivos modificados**:
- `src/services/shoppingService.js` — Reducir llamadas Serper: free ~4 (antes ~7), VIP ~6 (antes ~10)
- `src/controllers/searchController.js` — Incluir `stripe_url` en respuestas 402 paywall
- `public/app.js` — Usar `data.stripe_url` como fallback para botón VIP en paywall
- `migrations/016_security_fixes.sql` — Fix RLS en `blocked_ips`, convertir vistas a `security_invoker`, restringir a `service_role`
- `public/app.js` — Nudge de inactividad 90s (solo anónimos, no intrusivo)
- `src/utils/affiliateManager.js` — Eliminar warnings de `LIVERPOOL/WALMART/COPPEL_AFFILIATE_ID (pending)`

**Cambios clave**:
- `broadWebPromise` → solo `isVipSearch`
- `officialWebPromise` → solo `deepSearchEnabled`
- `serperAltQueryCount` → free=0, VIP=2, deep=5
- Paywall 402 ahora incluye `stripe_url` directo del env → frontend siempre tiene link VIP funcional

**⚠️ Acción requerida**:
- Ejecutar `migrations/016_security_fixes.sql` en Supabase SQL Editor ✅ (ya ejecutado)

**Tags**: `#serper` `#cost-optimization` `#security` `#paywall` `#referral` `#2026-05-03`

---

---

### 2026-05-03 — Mejoras Onboarding + Hero Badge Honesto

**Objetivo**: Hacer la encuesta de onboarding más útil (con impacto real en filtros) y reemplazar el badge "gratis para siempre" por algo más honesto.

**Archivos modificados**:
- `public/app.js` — Rediseñar onboarding paso 2:
  - 3 opciones con efecto REAL: `deal_hunter`, `safe_buyer`, `fast_searcher`
  - Cada opción activa filtros específicos automáticamente
  - `deal_hunter` → "Solo oferta real" + orden por precio
  - `safe_buyer` → "Solo seguras" + "Marketplaces conocidos"
  - `fast_searcher` → default, sin filtros extra
- `public/index.html` — Badge cambiado de "Gratis para siempre — sin tarjeta" a "Empieza gratis — 10 búsquedas/mes"

**Cambios clave**:
- Onboarding ahora tiene impacto perceptible en la experiencia de búsqueda
- Badge transparente sobre el límite real del plan gratuito
- Retrocompatible: usuarios previos no se ven afectados

**Tags**: `#onboarding` `#ux` `#transparency` `#hero-badge` `#2026-05-03`

---

*Template creado: 2026-04-09*
*Última actualización: 2026-05-03 — Mejoras Onboarding + Hero Badge Honesto*
