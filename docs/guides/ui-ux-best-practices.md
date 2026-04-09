# UI/UX Best Practices - Lumu

> Inspirado en [ui-ux-pro-max-skill](https://github.com/nextlevelbuilder/ui-ux-pro-max-skill) adaptado para el stack de Lumu.

## 🎯 Principios CRÍTICOS

### 1. Accessibility (A11y)

#### Color Contrast
- **Texto normal**: Mínimo 4.5:1 ratio contra fondo
- **Texto grande** (>18px): Mínimo 3:1 ratio
- **Herramienta**: [WebAIM Contrast Checker](https://webaim.org/resources/contrastchecker/)

```css
/* ✅ CORRECTO - Alto contraste */
.text-slate-50 { color: #f8fafc; } /* sobre #0f172a = 12.6:1 ✓ */

/* ❌ INCORRECTO - Bajo contraste */
.text-slate-400 { color: #94a3b8; } /* sobre #f1f5f9 = 2.6:1 ✗ */
```

#### Focus States
- Todos los elementos interactivos deben tener focus ring visible
- Tamaño: 2-4px de ancho
- Color: Contraste alto (ej: `ring-2 ring-emerald-500`)

```html
<!-- ✅ Focus visible -->
<button class="focus:outline-none focus:ring-2 focus:ring-emerald-500 focus:ring-offset-2">
  Buscar
</button>

<!-- ❌ Sin focus -->
<button class="bg-emerald-500">Buscar</button>
```

#### ARIA Labels
- Botones con solo íconos DEBEN tener `aria-label`
- Iconos decorativos: `aria-hidden="true"`
- Iconos informativos: `role="img"` + `aria-label`

```html
<!-- ✅ Botón de solo ícono con aria-label -->
<button aria-label="Cerrar modal" class="p-2">
  <svg aria-hidden="true">...</svg>
</button>

<!-- ❌ Sin aria-label -->
<button class="p-2">
  <svg>X</svg>
</button>
```

#### Keyboard Navigation
- Tab order debe seguir el orden visual
- Skip link para "saltar al contenido principal"
- Atajos de teclado para acciones frecuentes (Ctrl+K para buscar)

```html
<!-- Skip link -->
<a href="#main-content" class="sr-only focus:not-sr-only">
  Saltar al contenido principal
</a>
<main id="main-content">...</main>
```

---

### 2. Touch & Interaction

#### Touch Targets
- **Mínimo**: 48×48px (Material Design) / 44×44pt (Apple)
- **Gap entre targets**: Mínimo 8px

```css
/* ✅ Touch target correcto */
.touch-target {
  min-width: 48px;
  min-height: 48px;
  padding: 12px;
}

/* Extender hit area sin afectar visual */
.touch-target::before {
  content: '';
  position: absolute;
  inset: -8px; /* Hit area 64×64px */
}
```

#### Visual Feedback
- **Hover**: Cambio sutil de color/elevación
- **Active/Press**: Efecto de presión (scale 0.98 o sombra)
- **Loading**: Spinner o skeleton state
- **Disabled**: Opacidad 0.5 + cursor not-allowed

```css
/* Estados del botón */
.btn {
  @apply transition-all duration-200;
}
.btn:hover {
  @apply bg-emerald-600 shadow-lg;
}
.btn:active {
  @apply scale-95;
}
.btn:disabled {
  @apply opacity-50 cursor-not-allowed;
}
```

#### Mobile-First
- NO usar hover como única forma de interacción
- Siempre mostrar controles visibles para acciones críticas
- Evitar swipe horizontal en contenido principal (conflicto con back gesture)

---

### 3. Dark Mode Profesional

#### Surface Readability
Las tarjetas/superficies deben estar claramente separadas del fondo:

```css
/* ✅ Dark mode - Superficies distinguibles */
.dark .card {
  background-color: rgba(8, 26, 22, 0.95); /* #081a16 con opacidad */
  border: 1px solid rgba(255, 255, 255, 0.1);
}

/* ❌ Dark mode - Superficies transparentes confusas */
.dark .card {
  background-color: rgba(255, 255, 255, 0.05); /* Poco contraste */
}
```

#### Text Contrast Hierarchy
```css
/* Dark mode text hierarchy */
.dark .text-primary   { color: #e5e7eb; } /* >=4.5:1 */
.dark .text-secondary { color: #94a3b8; } /* >=3:1 */
.dark .text-muted    { color: #64748b; } /* Decorative */
```

#### Token-Driven Theming
NO usar hex values hardcodeados. Usar CSS variables:

```css
:root {
  /* Light theme */
  --color-bg: #ffffff;
  --color-surface: #f8fafc;
  --color-text: #0f172a;
}

.dark {
  /* Dark theme */
  --color-bg: #000104;
  --color-surface: #081a16;
  --color-text: #e5e7eb;
}

/* Uso */
.card {
  background-color: var(--color-surface);
  color: var(--color-text);
}
```

#### Modal Scrim
Para legibilidad de modales:
```css
.modal-scrim {
  background-color: rgba(0, 0, 0, 0.5); /* 40-60% black */
  backdrop-filter: blur(4px);
}
```

---

### 4. Layout & Spacing

#### Sistema 8px Grid
Usar múltiplos de 4 y 8 para todo:

| Token | Valor | Uso |
|-------|-------|-----|
| `space-1` | 4px | Micro spacing (íconos con texto) |
| `space-2` | 8px | Gap entre elementos relacionados |
| `space-3` | 12px | Padding de botones pequeños |
| `space-4` | 16px | Padding estándar de cards |
| `space-6` | 24px | Gap entre secciones |
| `space-8` | 32px | Gap entre secciones grandes |
| `space-12` | 48px | Padding de páginas |

#### Spacing Hierarchy Visual
```
[Section 1: 48px padding]
  
  [Subsection: 32px gap]
    
    [Card: 24px padding]
      [Header: 16px gap]
        [Title + Icon: 8px gap]
```

#### Safe Areas
```css
/* Mobile - respetar notch y gesture bar */
.safe-top {
  padding-top: env(safe-area-inset-top);
}

.safe-bottom {
  padding-bottom: env(safe-area-inset-bottom);
}

/* Fixed header/tab bar */
.fixed-header {
  padding-top: max(16px, env(safe-area-inset-top));
}
```

---

### 5. Pre-Delivery Checklist

Antes de entregar cualquier UI, verificar:

#### Visual Quality
- [ ] Spacing consistente (sistema 8px)
- [ ] Bordes y sombras uniformes
- [ ] Bord-radius consistente (cards: 16-24px, buttons: 8-12px)
- [ ] Tamaños de fuente escalonados correctamente

#### Interaction
- [ ] Loading states definidos
- [ ] Error feedback claro (cerca del problema)
- [ ] Tap targets >=48px
- [ ] Hover states en desktop
- [ ] Visual feedback en press/active

#### Light/Dark Mode
- [ ] Ambos temas funcionan correctamente
- [ ] Contrast ratios verificados (4.5:1 mínimo)
- [ ] Separadores visibles en ambos temas
- [ ] Estados (pressed/focused/disabled) funcionan en ambos

#### Layout
- [ ] Safe areas respetadas (mobile)
- [ ] Responsive en breakpoints (sm, md, lg, xl)
- [ ] Scroll insets para contenido detrás de barras fijas
- [ ] No hay overflow horizontal en mobile

#### Accessibility
- [ ] Contrast ratios verificados
- [ ] Focus rings visibles
- [ ] Aria labels donde corresponde
- [ ] Keyboard navigation funciona
- [ ] `prefers-reduced-motion` respetado

---

## 🧰 Tools & Resources

### Contrast Checkers
- [WebAIM Contrast Checker](https://webaim.org/resources/contrastchecker/)
- [Stark Plugin](https://www.getstark.co/) (Figma/Sketch)

### Design Systems Reference
- [Apple Human Interface Guidelines](https://developer.apple.com/design/human-interface-guidelines)
- [Material Design 3](https://m3.material.io/)
- [Tailwind UI](https://tailwindui.com/)

### Accessibility
- [axe DevTools](https://www.deque.com/axe/devtools/) (Chrome extension)
- [WAVE](https://wave.webaim.org/) (Web accessibility evaluator)

---

## 🎨 Decisiones de Diseño para Lumu

### Colores de Marca
- **Primary**: Emerald 500 (#10B981)
- **Secondary**: Teal 400 (#2dd4bf)
- **Accent**: Gradient emerald-teal para CTAs

### Tipografía
- **Headings**: System font stack (Inter/SF Pro)
- **Body**: 16px base, 1.5 line-height
- **Hierarchy**: 
  - H1: 32-40px bold
  - H2: 24-28px semibold
  - H3: 18-20px semibold
  - Body: 16px regular
  - Small: 14px regular
  - Caption: 12px regular

### Border Radius
- **Cards**: 16-24px (`rounded-2xl`)
- **Buttons**: 8-12px (`rounded-xl`)
- **Inputs**: 8-12px (`rounded-xl`)
- **Avatars**: 50% (`rounded-full`)

### Sombras
- **Cards**: `shadow-lg` + `shadow-emerald-500/10` para elevación
- **Buttons**: `shadow-[0_12px_26px_rgba(16,185,129,0.24)]`
- **Modals**: `shadow-2xl`

---

## 🔗 Related

- [Dark Mode Guide](./dark-mode.md)
- [CLAUDE.md](../../CLAUDE.md) - Reglas generales del proyecto

---

*Basado en ui-ux-pro-max-skill · Adaptado para Lumu · 2026-04-09*
