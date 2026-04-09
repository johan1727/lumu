# CLAUDE.md - Reglas para Lumu AI Project

## 🎯 Stack Tecnológico

- **Frontend**: Vanilla JavaScript (ES6+), HTML5, Tailwind CSS
- **Backend**: Supabase (PostgreSQL + Auth + Realtime)
- **APIs**: Google Gemini, Serper (Google Search), Stripe
- **Hosting**: Vercel con Serverless Functions
- **PWA**: Service Worker con cache-first strategy
- **Ads**: Google AdSense + IMA SDK

## 📁 Estructura del Proyecto

```
/public              → Archivos estáticos (HTML, CSS, JS, imágenes)
  /app.js           → Lógica principal de la app (~9000 líneas)
  /index.html       → Página principal con SEO completo
  /sw.js            → Service Worker para PWA
  /styles.css       → Tailwind CSS local build
/src
  /api              → Serverless Functions (Vercel)
  /controllers      → Lógica de backend (analytics, auth)
/supabase
  /migrations       → SQL migrations para DB
```

## 🎨 Reglas de UI/UX

### Dark Mode
- **SIEMPRE** asumir dark mode como default
- HTML debe tener `class="dark"` en el tag raíz
- Colores de fondo: `#000104` (bg), `#081a16` (surface)
- Texto principal: `#e5e7eb`, muted: `#94a3b8`

### Tailwind Classes
- Usar `bg-slate-900` para fondos oscuros
- Usar `text-slate-50` para texto claro en dark mode
- Gradientes: `from-emerald-500 to-teal-400` para acentos
- Botones primary: `bg-emerald-500 hover:bg-emerald-600`

## 📝 Convenciones de Código

### JavaScript
```javascript
// ✅ Siempre usar const/let, nunca var
const MAX_SNAPSHOTS = 20;
let currentUser = null;

// ✅ Async/await sobre promesas
async function loadData() {
  try {
    const data = await fetch('/api/data');
    return await data.json();
  } catch (err) {
    console.error('[Module] Error:', err);
    return null;
  }
}

// ✅ Manejo de errores explícito
try {
  localStorage.setItem(key, value);
} catch (err) {
  if (err.name === 'QuotaExceededError') {
    // Handle gracefully
  }
}

// ✅ Logging con prefijo de módulo
console.log('[SW] Registered:', scope);
console.warn('[Storage] Quota exceeded');
```

### Nombres de Variables
- **CONSTANTES**: `UPPER_SNAKE_CASE` (ej: `SEARCH_SNAPSHOTS_KEY`)
- **Funciones**: `camelCase` descriptivo (ej: `saveSearchSnapshot`)
- **Booleanos**: Prefijo `is/has/should` (ej: `isVipEligible`)
- **Keys localStorage**: Prefijo `lumu_` (ej: `lumu_theme`, `lumu_local_history`)

## 🗄️ Reglas de Supabase

### Queries
```javascript
// ✅ SIEMPRE usar supabaseClient desde window
const { data, error } = await window.supabaseClient
  .from('table')
  .select('*')
  .eq('id', userId)
  .single();

// ✅ SIEMPRE verificar error antes de usar data
if (error) {
  console.error('[Supabase] Query failed:', error);
  return null;
}
```

### Seguridad
- NUNCA hardcodear API keys en frontend
- Usar Row Level Security (RLS) en todas las tablas
- Validar inputs antes de enviar a DB

## 🔍 Reglas de SEO

### Meta Tags Obligatorios
```html
<title>Lumu - [descripción específica]</title>
<meta name="description" content="...">
<link rel="canonical" href="https://www.lumu.dev/[ruta]">
<meta property="og:title" content="...">
<meta property="og:description" content="...">
<meta property="og:url" content="...">
<meta property="og:type" content="website">
```

### Schema.org JSON-LD
```html
<script type="application/ld+json">
{
  "@context": "https://schema.org",
  "@type": "WebSite",
  "name": "Lumu",
  "url": "https://www.lumu.dev/"
}
</script>
```

## 💾 Reglas de localStorage

### Límites y Manejo
```javascript
// ✅ SIEMPRE comprimir datos antes de guardar
function compressProduct(product) {
  return {
    titulo: String(product.titulo).slice(0, 200),
    precio: Number(product.precio),
    // Solo campos esenciales
  };
}

// ✅ SIEMPRE manejar QuotaExceededError
try {
  localStorage.setItem(key, JSON.stringify(data));
} catch (err) {
  if (err.name === 'QuotaExceededError') {
    // Prune old data and retry
    pruneOldData();
    tryAgain();
  }
}
```

### Keys Permitidas
- `lumu_theme` - Tema (dark/light)
- `lumu_local_history` - Historial local
- `lumu_search_snapshots` - Snapshots de búsqueda (comprimidos)
- `lumu_cookies` - Preferencia de cookies
- `lumu_*` - Otras keys con prefijo lumu

## 🔄 Cache Busting

### Versionado
```html
<!-- SIEMPRE usar query param con versión -->
<script src="app.js?v=storage_quota_fix_v1"></script>
<link rel="stylesheet" href="styles.css?v=sw_auto_reload_v2">
```

### Service Worker
- Usar `CACHE_VERSION` con fecha o timestamp
- Notificar a clientes cuando hay nueva versión
- Auto-reload cuando `controllerchange` detectado

## 🌍 Internacionalización

### Región Detectada
```javascript
const currentRegion = detectRegion(); // MX, US, CL, CO, AR, PE, etc.
const config = REGION_LABELS[currentRegion] || REGION_LABELS.MX;
```

### Textos
```javascript
// ✅ Usar función de localización
const text = getLocalizedText('Spanish text', 'English text');
```

## ⚡ Performance

### Lazy Loading
```html
<img loading="lazy" src="..." alt="...">
```

### Recursos Externos
```html
<!-- Preconnect a dominios críticos -->
<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="preconnect" href="https://cdn.supabase.co">
```

## 🚨 Patrones a EVITAR

```javascript
// ❌ NO usar alert() nativo (feo)
// Usar showGlobalFeedback() o showToast()

// ❌ NO hardcodear URLs
// Usar variables de entorno o config

// ❌ NO guardar datos completos en localStorage
// Comprimir y limitar cantidad

// ❌ NO usar eval() o innerHTML con datos de usuario
// Usar textContent o sanitizar con DOMPurify

// ❌ NO olvidar limpiar event listeners
// Siempre usar .removeEventListener() o AbortController
```

## 📝 Comentarios

```javascript
// ✅ Comentarios explican el POR QUÉ, no el QUÉ
// Mal: // Incrementar contador
// Bien: // Reset contador porque el usuario cambió de región

// ✅ Secciones marcadas con ---
// --- Search Logic ---
// --- Event Listeners ---
```

## 🔧 Comandos Útiles

```bash
# Cache busting manual
Ctrl+Shift+R  # Hard reload

# Ver errores de localStorage
localStorage.length  # Ver cuánto se ha usado

# Limpiar cache del SW
navigator.serviceWorker.getRegistrations().then(regs => {
  regs.forEach(r => r.unregister());
});
```

## 📚 Recursos del Proyecto

- **Dominio**: https://www.lumu.dev/
- **Repositorio**: https://github.com/johan1727/lumu
- **Supabase**: [Project URL]
- **Vercel**: [Project URL]

---

*Última actualización: [Se actualiza manualmente o con comando "actualiza CLAUDE.md"]*
