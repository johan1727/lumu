# Graphify Quick Start Guide 🚀

## ¿Qué es Graphify?

Graphify transforma tu código en un **grafo de conocimiento semántico** que permite:
- 🔍 Búsqueda semántica de código y documentación
- 🤖 Enriquecer prompts de IA con contexto del proyecto
- 📊 Visualizar relaciones entre componentes
- 🎯 Análisis de dependencias y arquitectura

## Instalación

✅ **Ya está completamente instalado en este proyecto**

### Dependencias Incluidas:
```
✓ @sentropic/graphify@0.11.0
✓ 12 tree-sitter parsers (JS, Python, Go, Rust, etc.)
✓ Soporte PDF, Office, Markdown
✓ PostgreSQL + pgvector para embeddings
✓ Neo4j para almacenamiento de grafos
✓ MCP SDK para integración
```

## Uso Rápido

### 1. Construir el Grafo del Proyecto

```bash
npm run graphify:build
```

Esto crea `graph.json` con toda la estructura del proyecto.

**Tiempo estimado:** 1-3 minutos según tamaño del proyecto

### 2. Ver Estadísticas

```bash
npm run graphify:info
```

Salida:
```
📈 Estadísticas del Grafo:
  Nodos: 156
  Relaciones: 342
  Archivos: 28

📄 Top archivos por complejidad:
  1. app/api/analysis/generate.ts (45)
  2. lib/supabase/client.ts (28)
  ...
```

### 3. Usar en Código TypeScript

```typescript
import { graphify } from "@/lib/graphify/client";

// Cargar el grafo
await graphify.load();

// Buscar componentes relacionados con "análisis"
const results = graphify.search("análisis");

// Obtener contexto para un prompts de IA
const context = graphify.getPromptContext([
  "análisis",
  "gemini",
  "reporte",
]);

// Ver resumen del proyecto
const summary = graphify.getSummary();
console.log(`Proyecto en ${summary?.languages.join(", ")}`);
```

## Casos de Uso en "Pronósticos Mundial"

### Caso 1: Enriquecer Análisis de Gemini
```typescript
// En POST /api/analysis/generate

import { graphify } from "@/lib/graphify/client";

const projectContext = graphify.getPromptContext([
  "análisis",
  "partido",
  "gemini",
  "reporte",
]);

const prompt = `
Analiza este partido del Mundial...

${projectContext}
`;

const response = await gemini.generateContent(prompt);
```

### Caso 2: Búsqueda de Implementaciones

```typescript
// Encontrar todos los handlers de análisis
const analysisHandlers = graphify.search("analysis", "function");
analysisHandlers.forEach((fn) => {
  console.log(`Encontrado: ${fn.name} en ${fn.path}`);
});
```

### Caso 3: Documentación Automática

```typescript
// Generar documentación automática del proyecto
const summary = graphify.getSummary();

const docs = `
# Documentación Auto-generada

## Estructura
- **Archivos:** ${summary.totalFiles}
- **Componentes:** ${summary.totalNodes}
- **Relaciones:** ${summary.totalRelations}
- **Lenguajes:** ${summary.languages.join(", ")}
`;
```

## Estructura del Grafo

### Nodos (Nodes)
```json
{
  "id": "app/api/analysis/generate",
  "type": "file|function|class|import",
  "name": "generateAnalysis",
  "path": "app/api/analysis/generate.ts",
  "description": "Genera análisis de un partido",
  "complexity": 28
}
```

### Relaciones (Edges)
```json
{
  "source": "app/api/analysis/generate",
  "target": "lib/gemini/client",
  "type": "imports|defines|calls|extends"
}
```

## Configuración Avanzada

### Conectar a PostgreSQL (para embeddings)

```env
GRAPHIFY_DB_URL=postgresql://user:pass@localhost:5432/graphify
```

Luego:
```typescript
import { createSupabaseVectorStore } from "@sentropic/graphify";

const vectorStore = await createSupabaseVectorStore({
  client: supabaseClient,
  tableName: "graphify_embeddings",
});
```

### Neo4j (Graph Database)

```env
GRAPHIFY_NEO4J_URI=neo4j://localhost:7687
GRAPHIFY_NEO4J_USER=neo4j
GRAPHIFY_NEO4J_PASS=password
```

## Performance

- **Construcción:** O(files × complexity)
- **Búsqueda:** O(nodes) - instantáneo con índices
- **Contexto:** O(depth × branching_factor)

Para proyectos >1000 archivos, usar PostgreSQL + pgvector para caching.

## Troubleshooting

### "No se encontró graph.json"
```bash
npm run graphify:build
```

### "Grafo muy grande (>500MB)"
Filtrar carpetas:
```typescript
graphify.search("análisis", "file", { path: "app/**" });
```

### "Faltan parsers de código"
Todos los tree-sitter están instalados. Verifica:
```bash
npm ls tree-sitter-*
```

## Próximos Pasos

1. ✅ Construir grafo: `npm run graphify:build`
2. 🔄 Integrar en `/api/analysis/generate.ts` para RAG
3. 📊 Crear visualización del grafo (opcional)
4. 🚀 Deploy a Vercel con cron para actualizar grafo

## Recursos

- 📖 [Docs Graphify](https://github.com/rhanka/graphify)
- 🔗 [Tree-sitter Languages](https://tree-sitter.github.io/tree-sitter/)
- 🎯 [Model Context Protocol](https://modelcontextprotocol.io/)
