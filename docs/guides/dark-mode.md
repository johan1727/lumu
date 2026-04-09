# Guía: Dark Mode en Lumu

## Visión General
El dark mode es el tema **por defecto** de Lumu. Todo el diseño está optimizado para fondos oscuros.

## Implementación

### 1. HTML Base
```html
<!DOCTYPE html>
<html lang="es" class="dark">
<head>
    <meta name="theme-color" content="#080e1e" media="(prefers-color-scheme: dark)">
</head>
```

### 2. Estructura de Colores

#### CSS Variables (en `input.css`)
```css
@theme {
    --color-bg: #000104;
    --color-surface: #081a16;
    --color-surface-2: #0d241e;
    --color-text: #e5e7eb;
    --color-muted: #94a3b8;
    --color-primary: #10B981;
}
```

#### Tailwind Classes
```css
/* Fondos oscuros */
.dark .bg-white { background-color: var(--color-surface) !important; }
.dark .bg-slate-50 { background-color: rgba(15, 23, 42, 0.35) !important; }
.dark .bg-slate-100 { background-color: rgba(15, 23, 42, 0.55) !important; }
.dark .bg-emerald-50 { background-color: rgba(16, 185, 129, 0.08) !important; }
```

### 3. Componentes Comunes

#### Card/Panel Oscuro
```html
<div class="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-700">
    <h3 class="text-slate-800 dark:text-slate-50">Título</h3>
    <p class="text-slate-600 dark:text-slate-400">Descripción</p>
</div>
```

#### Botón Primario (Emerald)
```html
<button class="bg-emerald-500 hover:bg-emerald-600 text-white 
               rounded-xl px-5 py-2.5 font-bold shadow-lg">
    Acción
</button>
```

#### Input Oscuro
```html
<input type="text" 
       class="bg-slate-900 border border-slate-700 text-slate-50 
              placeholder-slate-500 rounded-xl px-4 py-3 
              focus:border-emerald-500 focus:ring-2 focus:ring-emerald-500/20"
       placeholder="Buscar...">
```

### 4. Toggle de Tema (Opcional)

Si necesitas permitir cambio de tema:

```javascript
const darkBtn = document.getElementById('btn-dark-mode');

// Guardar preferencia
localStorage.setItem('lumu_theme', 'dark'); // o 'light'

// Aplicar tema
document.documentElement.classList.toggle('dark', isDark);
```

## Debugging

### Problema: Se ve gris/blanco en lugar de negro
**Solución**: Verificar que `class="dark"` esté en el tag `<html>`

### Problema: Estilos no se aplican
**Solución**: 
1. Verificar que `styles.css` carga correctamente
2. Verificar que Tailwind incluye las clases `.dark`
3. Hard reload: `Ctrl+Shift+R`

### Problema: Override no funciona
**Solución**: Usar `!important` en overrides de CSS:
```css
.dark .bg-white { background-color: #081a16 !important; }
```

## Recursos
- Variables CSS: `/src/styles/input.css`
- Tailwind config: Ajustar `darkMode: 'class'` si es necesario
- Colores de marca: Emerald 500 (#10B981), Teal 400 (#2dd4bf)
