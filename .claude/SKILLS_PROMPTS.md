# 💡 LUMU AI - PROMPTS PRÁCTICOS PARA CADA SKILL

**Copia y pega estos prompts** en Claude Code para activar cada skill.

---

## 1️⃣ FRONTEND DESIGN - Activar Estética Consistente

### Prompt para Landing Page
```
Rediseña la landing page de Lumu (public/index.html) usando Frontend Design skill:

Requisitos:
- Dark mode consistente (#000104 bg, #081a16 surface)
- Tipografía moderna (sin Arial/Roboto genéricas)
- Gradientes: emerald-500 → teal-400
- Efectos glasmorfismo donde sea apropiado
- Responsive design móvil-first
- Accesibilidad WCAG AA

Mantén la estructura HTML actual pero mejora CSS y estética visual.
```

### Prompt para Dashboard
```
Crea un dashboard moderno con Frontend Design:

Secciones:
- Header con logo Lumu + nav
- Card principal: últimas búsquedas
- Widget: precios guardados
- Historial de comparaciones
- Settings sidebar

Estética: glasmorfismo + dark mode + hover effects animados
```

---

## 2️⃣ SUPERPERS - Planificación Arquitectónica

### Prompt #1: Antes de Agregar Filtros Avanzados
```
Usa Superpers skill para planificar la siguiente feature:

"Quiero agregar filtros avanzados al comparador de Lumu"

Por favor:
1. Haz preguntas sobre arquitectura
2. Crea un plan detallado con pasos
3. Identifica puntos de riesgo
4. Sugiere orden de implementación
5. NO escribas código todavía

Una vez que apruebe el plan, ejecuta paso a paso.
```

### Prompt #2: Integración de Múltiples APIs
```
Planifica con Superpers la integración:

Sistema Lumu necesita:
- Gemini API (análisis de ofertas)
- Serper API (búsqueda de precios)
- Stripe (pagos VIP)
- Supabase (almacenamiento)
- Service Worker (PWA)

¿Cómo estructurar esto sin acoplamiento?
¿Qué datos van en DB vs localStorage?
¿Orden de implementación?

Usa Superpers para el plan, luego implementa.
```

---

## 3️⃣ TASKMASTER AI - Dividir en Micro-Tareas

### Prompt #1: Feature Pequeña
```
Usa Taskmaster AI para esta feature:

"Agregar notificaciones cuando un precio baja"

Por favor:
- Divide en micro-tareas (máx 2 horas cada una)
- Define aceptación criteria para cada tarea
- Identifica dependencias
- Estima tokens por tarea

Luego ejecuta tarea por tarea.
```

### Prompt #2: Feature Grande
```
Taskmaster AI, divide esto en micro-tareas:

"Integrar Stripe payments + VIP features"

Features VIP:
- Acceso a comparador premium
- Histórico de 1 año de precios
- Alertas ilimitadas
- Múltiples watchlists
- Export a Excel

Necesito:
- Micro-tareas claras
- Subtareas dentro de cada una
- Testing criteria
- Orden de prioridad
```

---

## 4️⃣ PLAYWRIGHT - Testing Autónomo

### Prompt #1: Test Flujo Principal
```
Usa Playwright skill para testear:

Flujo crítico de Lumu:
1. Cargar index.html
2. Buscar "celular barato"
3. Esperar resultados
4. Comparar 3 opciones
5. Ver detalles de precio histórico
6. Guardar en watchlist

Requirements:
- Captura screenshots
- Valida que aparezcan datos
- Prueba casos bordes (búsqueda vacía)
- Genera reporte HTML

Ejecuta y comparte resultados.
```

### Prompt #2: Test de PWA
```
Playwright, verifica que PWA funcione:

1. Abre app en modo offline
2. Intenta buscar (debe venir del cache)
3. Va online
4. Actualiza datos
5. Verifica que el SW se registre
6. Comprueba cache de styles.css

Espero que offline muestre último resultado cached.
```

### Prompt #3: Test Responsivo
```
Playwright, prueba responsive design:

Viewports:
- Mobile: 375x667 (iPhone)
- Tablet: 768x1024 (iPad)
- Desktop: 1920x1080

Para cada uno:
- ¿Se ve bien el nav?
- ¿Funcionan todos los inputs?
- ¿Las cards se adaptan?
- ¿Se mantiene dark mode?
- ¿Performance ok?
```

---

## 5️⃣ WEB ARTIFACTS BUILDER - Componentes Modernos

### Prompt #1: Card de Producto
```
Usa Web Artifacts Builder para crear:

Card de producto con:
- Imagen del producto (placeholder)
- Nombre + precio
- Rating de la tienda
- Botón "Ver en tienda"
- Botón "Agregar alertas"
- Etiqueta "Mejor precio" (si aplica)

Efectos:
- Glasmorfismo
- Sombra elevada
- Hover: Scale 1.05 + shadow más intensa
- Fade-in al cargar
```

### Prompt #2: Comparador Side-by-Side
```
Construye con Artifacts Builder:

Interfaz de comparación:
- 3 columnas (productos)
- Header con nombre + tienda
- Precio grande en verde si es el mejor
- Especificaciones listadas
- Botón "Comprar" con hover magnético
- Footer con disponibilidad

Todo debe tener glasmorfismo + dark mode.
```

### Prompt #3: Search Bar Animado
```
Crea con Artifacts Builder:

Search bar premium:
- Input con icono de lupa
- Efecto magnético en el cursor
- Placeholder animado
- Dropdown con sugerencias (últimas búsquedas)
- Loading spinner mientras busca
- Fade-in de resultados

Estilo: glasmorfismo con gradiente emerald-teal
```

---

## 6️⃣ DEEP RESEARCH - Investigación Confiable

### Prompt #1: Validar Precios Actuales
```
Deep Research, investiga:

"¿Cuál es el precio actual del iPhone 15 Pro 256GB en México?"

Busca en:
- Amazon.com.mx
- Mercado Libre
- Falabella
- Walmart

Requisitos:
- Modo: Deep (máxima exactitud)
- Incluye links a precios
- Valida disponibilidad
- Cita fechas de búsqueda

Voy a publicar esto en el blog, debe ser 100% exacto.
```

### Prompt #2: Comparativa de Tiendas
```
Deep Research para artículo de blog:

"¿Dónde comprar laptops baratas en México? Análisis 2026"

Investiga:
- Mejores tiendas online
- Promociones actuales
- Garantías y política de devolución
- Envío gratis en qué casos
- Códigos descuento disponibles

Modo: Ultra Deep (quiero fuente confiable)
Output: Markdown con links citados
```

### Prompt #3: Trending Products
```
Deep Research, busca trending ahora:

"¿Qué productos de electrónica están en tendencia en México 2026?"

Análisis:
- Top 10 por categoría (celulares, laptops, audífonos)
- Por qué están trending (reviews, precio, specs)
- Dónde encontrar mejor precio
- Promociones actuales

Modo: Standard
Usa para actualizar landing page.
```

---

## 7️⃣ REMOTION - Videos 3D y Marketing

### Prompt #1: Video Demo de Búsqueda
```
Remotion, crea un video:

"Demo: Cómo usar el comparador Lumu"

Escenas:
1. Logo Lumu aparece (1s)
2. Search bar con texto "celular barato" (2s)
3. Zoom en card de producto (3s)
4. Mostrar precio en verde (1s)
5. Botón "Comparar" pulse effect (1s)
6. Fade a logo final (1s)

Total: 9 segundos
Resolución: 1920x1080 + 1080x1920 (landscape + portrait)
Música: opcional, fondo minimalista

Luego générame 5 versiones más para:
- iPhone, Samsung, Laptop, Audífonos, Gaming
```

### Prompt #2: Product Launch Video
```
Remotion, video promocional:

"Presentación de feature VIP de Lumu"

Contenido:
- Escena 1: Problema (precios diseminados)
- Escena 2: Solución (Lumu unifica)
- Escena 3: Feature VIP (alertas + histórico)
- Escena 4: Call to action (botón "Upgrade")

Duración: 30 segundos
Estilo: Modern, dark mode, animaciones smooth
Outputs: MP4 + PNG preview
```

### Prompt #3: Comparative Video
```
Remotion, video comparativo:

"Lumu vs Otros Comparadores"

Layout split-screen:
- Izquierda: Otro comparador (lento, genérico)
- Derecha: Lumu (rápido, inteligente)

Métrica: Tiempo de búsqueda, cantidad de tiendas, precisión

Duración: 60 segundos
Formato: YouTube Short + TikTok
```

---

## 8️⃣ CONTEXT SEVEN - Documentación Actualizada

### Prompt #1: Setup Inicial
```
Context Seven, necesito mantener actualizada la documentación de:

APIs integradas:
- Google Gemini (analysis)
- Serper (search)
- Stripe (payments)
- Supabase (database)
- Vercel (hosting)

Para cada una:
- Monitorea cambios en docs oficiales
- Actualiza cuando hay breaking changes
- Alerta si deprecations ocurren
- Sugerencia de migración

Quiero que me avises si algo cambia.
```

### Prompt #2: Proyecto en Evolución
```
Context Seven, mantén memoria de Lumu:

Información crítica:
- Stack: Vanilla JS + Supabase + Gemini
- Dark mode: #000104 (bg), #081a16 (surface)
- Estructura: /public (frontend), /src/api (serverless)
- Región: Enfocado en Latinoamérica (MX, CO, CL, AR)
- Usuarios: 40+ páginas de blog + dashboard

Cada semana cuando trabaje, actualiza contexto con:
- Cambios en arquitectura
- Nuevas features
- Bugs encontrados
- Deuda técnica

Cuando pregunto, dame contexto actualizado del proyecto.
```

---

## 🔄 FLUJO RECOMENDADO: UN PROYECTO REAL

### Escenario: "Agregar Filtros Avanzados de Búsqueda"

#### Paso 1: SUPERPERS (5 min)
```
"Planifica con Superpers: Quiero agregar filtros avanzados al comparador.
Filtros: marca, rango de precio, disponibilidad, rating mínimo"
```

#### Paso 2: TASKMASTER (2 min)
```
"Ahora Taskmaster: Divide el plan anterior en micro-tareas"
```

#### Paso 3: FRONTEND DESIGN (10 min)
```
"Diseña la UI de filtros con Frontend Design skill
Dark mode, glasmorfismo, componentes modernos"
```

#### Paso 4: WEB ARTIFACTS BUILDER (15 min)
```
"Crea componentes: DropdownFilter, SliderPrecio, CheckboxMarca
Con effectos magnéticos y animaciones"
```

#### Paso 5: Implementar (30 min)
```
"Implementa las micro-tareas en orden"
```

#### Paso 6: PLAYWRIGHT (10 min)
```
"Playwright: Prueba los nuevos filtros
- Selecciona cada filtro
- Verifica que se aplique
- Casos bordes (filtro vacío, rango inválido)"
```

#### Paso 7: CONTEXT SEVEN (automático)
```
"Actualiza la documentación del proyecto"
```

---

## ✅ CHECKLIST: Primer Uso de Skills

- [ ] Leí `SKILLS_GUIDE.md`
- [ ] Entiendo para qué sirve cada skill
- [ ] Descargué todas las 8 en `.claude/skills/`
- [ ] Probé mi primer prompt con SUPERPERS
- [ ] Probé FRONTEND DESIGN en una página
- [ ] Usé TASKMASTER para un feature pequeño
- [ ] Ejecuté PLAYWRIGHT para test de landing page
- [ ] Creé mi primer componente con ARTIFACTS BUILDER
- [ ] Hice una investigación con DEEP RESEARCH
- [ ] Configuré CONTEXT SEVEN para el proyecto

---

## 🎓 TIPS AVANZADOS

### Combinar Skills
```
"Usa SUPERPERS para planificar,
 TASKMASTER para dividir,
 FRONTEND DESIGN para estética,
 ARTIFACTS BUILDER para UI,
 PLAYWRIGHT para validar,
 Y todo registrado por CONTEXT SEVEN"
```

### Economizar Tokens
```
Deep Research: Quick mode para info simple
Deep Research: Ultra Deep solo para artículos críticos

CONTEXT SEVEN: Gasta 120x menos tokens con grafo de conocimiento
```

### Debugging
```
Si PLAYWRIGHT falla: Mejora selector CSS
Si DEEP RESEARCH alucina: Busca manualmente + cita fuente
Si REMOTION no renderiza: Revisa resolución y duración
```

---

**Última actualización:** 2026-06-09  
**Creado para:** Lumu AI Project
