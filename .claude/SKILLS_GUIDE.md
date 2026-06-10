# 🚀 LUMU AI - GUÍA DE 8 SKILLS CRÍTICAS

**Descargadas:** 2026-06-09  
**Locación:** `.claude/skills/`  
**Total Skills:** 8

---

## 📋 ÍNDICE DE SKILLS

| # | Skill | Carpeta | Propósito | Estado |
|---|-------|---------|-----------|--------|
| 1 | **Frontend Design** | `frontend-design/` | Estética visual consistente | ✅ Listo |
| 2 | **Superpers** | `superpers/` | Planificación arquitectónica | ✅ Listo |
| 3 | **Taskmaster AI** | `taskmaster-ai/` | Segmentación en micro-tareas | ✅ Listo |
| 4 | **Playwright** | `playwright/` | Testing web autónomo | ✅ Listo |
| 5 | **Web Artifacts Builder** | `web-artifacts-builder/` | 40+ componentes modernos | ✅ Listo |
| 6 | **Deep Research** | `deep-research/` | Investigación infalible | ✅ Listo |
| 7 | **Remotion** | `remotion/` | Videos 3D y animaciones | ✅ Listo |
| 8 | **Context Seven** | `context-seven/` | Documentación actualizada | ✅ Listo |

---

## 🎯 SKILL #1: FRONTEND DESIGN

**Repositorio:** `Ilm-Alan/frontend-design`  
**¿Qué hace?**
- Bloquea a Claude de usar fuentes genéricas (Arial, Roboto)
- Obliga estética consistente en todas las páginas
- Define 8 anchors visuales (glasmorfismo, dark mode, etc.)
- Asegura que cada página tenga la identidad de Lumu

**Para Lumu:**
```
✅ Standardiza dark mode (#000104, #081a16)
✅ Asegura Tailwind CSS consistente
✅ Evita variaciones de color/tipografía
✅ Aplica a: blog, dashboard, comparador
```

**Cómo activar:**
```
Pedir: "Diseña una página con Frontend Design skill"
O simplemente: "Crea un dashboard moderno"
```

---

## 🏗️ SKILL #2: SUPERPERS

**Repositorio:** `ericgandrade/claude-superskills`  
**¿Qué hace?**
- Bloquea código inicial
- Hace preguntas de arquitectura ANTES de codear
- Arma un plan detallado
- Ejecuta paso a paso

**Para Lumu:**
```
✅ Antes de agregar "filtros avanzados":
   1. ¿Qué tipos de filtros?
   2. ¿Dónde viven (DB o localStorage)?
   3. ¿UI: dropdown, checkbox, slider?
   4. ¿Guardar preferencias?
   
✅ Después: Plan → Ejecución ordenada
```

**Cuándo usarlo:**
- Proyectos grandes (40+ páginas)
- Integraciones complejas (Stripe + Gemini + Serper)
- Antes de escribir código

---

## ⚡ SKILL #3: TASKMASTER AI

**Repositorio:** `eyaltoledano/claude-task-master`  
**¿Qué hace?**
- Divide proyectos grandes en micro-tareas
- Aplica "divide y vencerás"
- Reduce errores hasta 90%
- Crea subtareas con aceptación criteria

**Para Lumu:**
```
✅ "Integra Stripe + búsqueda + notificaciones"

Se divide en:
  1. Stripe setup → webhook + is_vip
  2. Search upgrade → tiendas premium
  3. Notificaciones → email + triggers

✅ Cada tarea independiente = menos errores
```

**Resultado esperado:**
- 90% menos bugs
- Menos tokens gastados en fixes
- Desarrollo 2x más rápido

---

## 🌐 SKILL #4: PLAYWRIGHT

**Repositorio:** `lackeyjb/playwright-skill`  
**¿Qué hace?**
- Abre navegador automáticamente
- Prueba flujos completos sin intervención manual
- Genera reportes con screenshots
- Prueba casos bordes

**Para Lumu:**
```
✅ Automatiza testing:
   - Login funciona?
   - Comparador carga precios?
   - PWA cachea correctamente?
   - Búsqueda vacía maneja error?

✅ Ejecutas 1 vez, corre infinitas veces
```

**Uso:**
```
"Usa Playwright para:
1. Login con email+password
2. Buscar 'celular barato'
3. Verificar que aparezcan 5+ resultados
4. Probar búsqueda vacía"
```

---

## 🎨 SKILL #5: WEB ARTIFACTS BUILDER

**Repositorio:** `anthropics/skills`  
**¿Qué hace?**
- Proporciona 40+ componentes prehechos
- Glasmorfismo, cursores magnéticos, pop-ups
- Efectos hover animados
- Sin escribir CSS raw

**Componentes incluidos:**
```
✅ Botones (hover effects, gradients)
✅ Cards (glasmorfismo, sombras)
✅ Pop-ups (fade-in, modales)
✅ Cursores magnéticos
✅ Spinners animados
✅ Navbars responsivas
✅ Sliders y carousels
... y 30+ más
```

**Para Lumu:**
```
"Crea una tarjeta de producto con:
- Glasmorfismo
- Efecto magnético en hover
- Botón 'Comparar precio'
- Animación de fade-in"

→ Artifacts Builder lo hace automáticamente
```

---

## 🔍 SKILL #6: DEEP RESEARCH

**Repositorio:** `199-biotechnologies/claude-deep-research-skill`  
**¿Qué hace?**
- Busca info en Google con 8 fases
- Valida fuentes antes de usar
- NO alucina
- Genera reportes citados

**Para Lumu:**
```
✅ Para tu blog:
   - Validar precios antes de publicar
   - Verificar que ofertas son reales
   - Encontrar mejor precio actual
   - Citar fuentes confiables

✅ Modos:
   - Quick (rápido, pocos tokens)
   - Standard (balanceado)
   - Deep (profundo)
   - Ultra Deep (máxima precisión)
```

**Uso:**
```
"Investiga: ¿Cuánto cuesta el iPhone 15 Pro en México ahora?
Modo: Deep
Valida precios en: Amazon, Mercado Libre, Falabella"
```

---

## 🎬 SKILL #7: REMOTION

**Repositorio:** `wshuyi/remotion-video-skill`  
**¿Qué hace?**
- Crea videos 3D desde código
- Renderiza en paralelo
- Replicas videos para múltiples productos
- Genera demostraciones automáticamente

**Para Lumu:**
```
✅ Marketing videos:
   - "Cómo usar Lumu" (1 template)
   - Replicar para 10 tiendas
   
✅ Product demos:
   - Búsqueda de precio
   - Comparación de ofertas
   - Notificación de descuento

✅ Animaciones:
   - B-rolls
   - Transiciones 3D
   - Efectos de movimiento
```

**Ventaja principal:**
```
1 video template → 30 videos diferentes
(Sin trabajo manual repetitivo)
```

---

## 💾 SKILL #8: CONTEXT SEVEN

**Repositorio:** `upstash/context7`  
**¿Qué hace?**
- Mantiene contexto entre sesiones
- Actualiza documentación automáticamente
- Crea grafo de conocimiento
- Evita Claude "olvide" cosas

**Para Lumu:**
```
✅ Proyecto en constante evolución:
   - Cambios en Supabase RLS
   - Nueva versión de Gemini API
   - Updates en Stripe pricing
   
✅ Context Seven:
   - Detecta docs desactualizadas
   - Actualiza automáticamente
   - Usa versiones correctas

✅ Gasta 120x menos tokens
```

**Ejemplo:**
```
Semana 1: "Usa Supabase RLS para búsquedas"
Semana 2: RLS cambió en Supabase
Context Seven detecta y actualiza automáticamente
```

---

## 🔧 CÓMO INSTALAR CADA SKILL

### Opción 1: Automática (Recomendada)
```bash
# Dentro de Claude Code:
/skill-creator

# O simplemente pedir:
"Activa Frontend Design skill"
"Usa Superpers para este proyecto"
```

### Opción 2: Manual
```bash
# Verificar que estén en .claude/skills/
ls -la .claude/skills/

# Cada carpeta ya tiene SKILL.md con instrucciones
cat .claude/skills/frontend-design/SKILL.md
cat .claude/skills/superpers/SKILL.md
```

---

## 📊 ORDEN RECOMENDADO PARA LUMU

### Fase 1: Arquitectura (Semana 1)
```
1. SUPERPERS → Define arquitectura clara
2. FRONTEND DESIGN → Standardiza estética
```

### Fase 2: Desarrollo (Semana 2-3)
```
3. TASKMASTER AI → Divide features
4. WEB ARTIFACTS BUILDER → UI moderna
5. CONTEXT SEVEN → Mantén docs actualizadas
```

### Fase 3: Testing (Semana 4)
```
6. PLAYWRIGHT → Automatiza testing
7. DEEP RESEARCH → Valida contenido
```

### Fase 4: Marketing (Semana 5)
```
8. REMOTION → Crea videos demo
```

---

## 🚀 PRÓXIMOS PASOS

1. **Activa Superpers ahora**
   ```
   "Quiero mejorar Lumu. Usa Superpers para:
   - Analizar arquitectura actual
   - Proponer mejoras en filtros
   - Planificar integración con Gemini"
   ```

2. **Aplica Frontend Design a la landing page**
   ```
   "Rediseña index.html con:
   - Frontend Design skill
   - Dark mode consistente
   - Glasmorfismo moderno"
   ```

3. **Usa Taskmaster para integración de Stripe**
   ```
   "Integra Stripe con Taskmaster AI:
   - Divide en micro-tareas
   - Webhook setup
   - DB schema updates"
   ```

---

## 📚 DOCUMENTACIÓN OFICIAL

- **Frontend Design**: `frontend-design/SKILL.md`
- **Superpers**: `superpers/skills/senior-solution-architect/SKILL.md`
- **Taskmaster AI**: `taskmaster-ai/docs/tutorial.md`
- **Playwright**: `playwright/skills/playwright-skill/API_REFERENCE.md`
- **Web Artifacts**: `web-artifacts-builder/skills/web-artifacts-builder/SKILL.md`
- **Deep Research**: `deep-research/SKILL.md`
- **Remotion**: `remotion/README.md`
- **Context Seven**: `context-seven/README.md`

---

**Última actualización:** 2026-06-09  
**Creado para:** Proyecto Lumu AI
