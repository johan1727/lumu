# Guías de Desarrollo - Lumu

Documentación técnica para el equipo de desarrollo y la IA (Cascade/Windsurf).

## 📚 Guías Disponibles

### [Dark Mode](./dark-mode.md)
Implementación del tema oscuro, colores de marca, y debugging de problemas de estilo.

**Tags**: `#tailwind` `#ui` `#css`

---

### [LocalStorage Patterns](./localstorage-patterns.md)
Manejo seguro de localStorage con compresión, quota protection, y patrones reutilizables.

**Tags**: `#localstorage` `#performance` `#frontend`

---

### [SEO Checklist](./seo-checklist.md)
Meta tags obligatorios, Schema.org JSON-LD, Open Graph, y optimización para motores de búsqueda.

**Tags**: `#seo` `#performance` `#deployment`

---

### [Service Worker](./service-worker.md)
Implementación de PWA, estrategias de cache, auto-reload, y debugging.

**Tags**: `#service-worker` `#pwa` `#performance` `#frontend`

---

## 🎯 Casos de Uso

### "Quiero agregar una nueva página"
1. Ver [SEO Checklist](./seo-checklist.md) - Meta tags necesarios
2. Ver [Dark Mode](./dark-mode.md) - Estructura HTML base

### "Hay error en localStorage"
1. Ver [LocalStorage Patterns](./localstorage-patterns.md) - Sección "Debugging"
2. Ver [Service Worker](./service-worker.md) - Si es problema de cache

### "El diseño no se ve bien en dark mode"
1. Ver [Dark Mode](./dark-mode.md) - Debugging section
2. Check `class="dark"` en HTML tag

### "Quiero mejorar el SEO"
1. Ver [SEO Checklist](./seo-checklist.md) - Checklist pre-deploy
2. Validar con herramientas mencionadas

---

## 🏷️ Búsqueda por Tags

| Tag | Guías Relacionadas |
|-----|-------------------|
| `#localstorage` | localstorage-patterns.md |
| `#service-worker` | service-worker.md |
| `#seo` | seo-checklist.md |
| `#tailwind` | dark-mode.md |
| `#ui` | dark-mode.md |
| `#performance` | localstorage-patterns.md, service-worker.md, seo-checklist.md |
| `#frontend` | dark-mode.md, localstorage-patterns.md, service-worker.md |
| `#deployment` | seo-checklist.md |

---

## 📝 Reglas Generales

- **Dark Mode Default**: Siempre asumir tema oscuro
- **Cache Busting**: Usar `?v=version` en assets
- **Prefijo `lumu_`**: Para todas las keys de localStorage
- **Error Handling**: Siempre usar try/catch para localStorage y fetch
- **Console Logs**: Usar prefijo `[Modulo]` para identificar origen

---

## 🔗 Recursos Externos

- [CLAUDE.md](../../CLAUDE.md) - Reglas generales del proyecto
- [MEMORY.md](../../MEMORY.md) - Memoria de sesiones y decisiones
- [.windsurfrules](../../.windsurfrules) - Reglas específicas de Windsurf/Cascade

---

*Última actualización: 2026-04-09*
