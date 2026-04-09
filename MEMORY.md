# MEMORY.md - Memoria del Proyecto Lumu

> **Comando**: Dime "actualiza memory.md" al final de cada sesión para agregar un resumen.

---

## 📋 Historial de Sesiones

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

*Template creado: 2026-04-09*
*Última actualización: 2026-04-09 - Integración de UI/UX best practices de investigación*
