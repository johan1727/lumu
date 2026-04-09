# Guía: SEO Checklist para Páginas Lumu

## Meta Tags Obligatorios

Cada página HTML debe incluir:

```html
<head>
    <!-- Básicos -->
    <title>Lumu - [Descripción específica de la página]</title>
    <meta name="description" content="[Descripción única, 150-160 chars]">
    <meta name="robots" content="index, follow">
    
    <!-- Canonical -->
    <link rel="canonical" href="https://www.lumu.dev/[ruta]">
    
    <!-- Open Graph -->
    <meta property="og:title" content="[Igual que title]">
    <meta property="og:description" content="[Igual que description]">
    <meta property="og:url" content="https://www.lumu.dev/[ruta]">
    <meta property="og:type" content="website"> <!-- o 'article' para blogs -->
    <meta property="og:image" content="https://www.lumu.dev/images/og-cover-v2.png">
    <meta property="og:image:width" content="1200">
    <meta property="og:image:height" content="630">
    <meta property="og:locale" content="es_MX">
    
    <!-- Twitter -->
    <meta name="twitter:card" content="summary_large_image">
    <meta name="twitter:title" content="[Igual que title]">
    <meta name="twitter:description" content="[Igual que description]">
    <meta name="twitter:image" content="https://www.lumu.dev/images/og-cover-v2.png">
    <!-- NO incluir twitter:site -->
    
    <!-- hreflang -->
    <link rel="alternate" hreflang="es-MX" href="https://www.lumu.dev/[ruta]">
    <link rel="alternate" hreflang="es" href="https://www.lumu.dev/[ruta]">
    <link rel="alternate" hreflang="en-US" href="https://www.lumu.dev/en/[ruta]">
    <link rel="alternate" hreflang="x-default" href="https://www.lumu.dev/[ruta]">
</head>
```

## Schema.org JSON-LD

### Para Homepage
```html
<script type="application/ld+json">
{
  "@context": "https://schema.org",
  "@type": "WebSite",
  "name": "Lumu",
  "url": "https://www.lumu.dev/",
  "potentialAction": {
    "@type": "SearchAction",
    "target": {
      "@type": "EntryPoint",
      "urlTemplate": "https://www.lumu.dev/?q={search_term_string}"
    },
    "query-input": "required name=search_term_string"
  }
}
</script>
```

### Para Artículos de Blog
```html
<script type="application/ld+json">
{
  "@context": "https://schema.org",
  "@type": "Article",
  "headline": "[Título del artículo]",
  "description": "[Descripción]",
  "image": "https://www.lumu.dev/images/[imagen].jpg",
  "author": {
    "@type": "Organization",
    "name": "Lumu AI"
  },
  "publisher": {
    "@type": "Organization",
    "name": "Lumu",
    "logo": {
      "@type": "ImageObject",
      "url": "https://www.lumu.dev/images/logo.png"
    }
  },
  "datePublished": "2026-01-15",
  "dateModified": "2026-01-15",
  "mainEntityOfPage": {
    "@type": "WebPage",
    "@id": "https://www.lumu.dev/[articulo].html"
  }
}
</script>
```

## Estructura de URLs

### Buenas Prácticas
- ✅ `https://www.lumu.dev/comparar-precios-celulares-mexico.html`
- ✅ `https://www.lumu.dev/blog/como-elegir-laptop.html`
- ❌ `https://www.lumu.dev/p?id=123&cat=4` (evitar query params)

### Keywords en URL
- Usar guiones medios `-` no guiones bajos `_`
- Mantener cortas (máx 60 chars)
- Incluir keyword principal al inicio

## Optimización de Contenido

### Heading Structure
```html
<h1>Lumu - Comparador de precios con IA</h1>
  <h2>¿Cómo funciona?</h2>
    <h3>1. Busca tu producto</h3>
    <h3>2. Compara precios</h3>
  <h2>Categorías populares</h2>
```

### Images
```html
<img src="[ruta]" 
     alt="[Descripción descriptiva con keywords]"
     width="[ancho]"
     height="[alto]"
     loading="lazy">
```

### Internal Links
```html
<a href="/categoria/celulares.html">Ver celulares baratos</a>
```

## Sitemap

Mantener `sitemap.xml` actualizado:

```xml
<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
  <url>
    <loc>https://www.lumu.dev/</loc>
    <lastmod>2026-04-09</lastmod>
    <changefreq>daily</changefreq>
    <priority>1.0</priority>
  </url>
  <url>
    <loc>https://www.lumu.dev/comparar-precios-celulares-mexico.html</loc>
    <lastmod>2026-04-09</lastmod>
    <changefreq>weekly</changefreq>
    <priority>0.8</priority>
  </url>
</urlset>
```

## Performance SEO

### Core Web Vitals
```html
<!-- Preconnect a dominios críticos -->
<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>

<!-- Preload recursos críticos -->
<link rel="preload" href="/styles.css" as="style">
<link rel="preload" href="/app.js" as="script">
```

### Robots.txt
```
User-agent: *
Allow: /
Disallow: /api/
Disallow: /admin/

Sitemap: https://www.lumu.dev/sitemap.xml
```

## Checklist Pre-Deploy

- [ ] Title único y descriptivo (50-60 chars)
- [ ] Meta description única (150-160 chars)
- [ ] Canonical URL correcta
- [ ] Open Graph tags completos
- [ ] Twitter Card tags (sin twitter:site)
- [ ] hreflang para idiomas/regiones
- [ ] Schema.org JSON-LD válido
- [ ] Sitemap.xml actualizado
- [ ] URLs amigables (sin query params)
- [ ] Alt text en todas las imágenes
- [ ] Estructura de headings lógica (h1→h2→h3)
- [ ] Links internos relevantes
- [ ] Mobile-friendly (responsive)
- [ ] PageSpeed Insights > 90

## Herramientas de Validación

1. **Google Rich Results Test**: https://search.google.com/test/rich-results
2. **Schema Validator**: https://validator.schema.org/
3. **Open Graph Debugger**: https://developers.facebook.com/tools/debug/
4. **Twitter Card Validator**: https://cards-dev.twitter.com/validator
5. **Mobile-Friendly Test**: https://search.google.com/test/mobile-friendly

## Errores Comunes a Evitar

- ❌ Duplicar title/description entre páginas
- ❌ Olvidar canonical (causa contenido duplicado)
- ❌ Usar twitter:site (no tenemos Twitter oficial)
- ❌ Images sin alt text
- ❌ URLs con parámetros de query
- ❌ Schema.org inválido (siempre validar)
