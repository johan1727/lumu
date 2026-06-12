/**
 * Cliente para interactuar con el grafo de conocimiento de Graphify
 * Se usa para RAG (Retrieval-Augmented Generation) en análisis de Gemini
 */

import fs from "fs";
import path from "path";

interface GraphNode {
  id: string;
  type: "file" | "function" | "class" | "import";
  name: string;
  path?: string;
  description?: string;
  complexity?: number;
}

interface GraphEdge {
  source: string;
  target: string;
  type: "imports" | "defines" | "calls" | "extends";
}

interface KnowledgeGraph {
  nodes: GraphNode[];
  edges: GraphEdge[];
  files: any[];
  summary?: {
    totalFiles: number;
    totalNodes: number;
    totalRelations: number;
    languages: string[];
  };
}

export class GraphifyClient {
  private graph: KnowledgeGraph | null = null;
  private graphPath: string;

  constructor(graphPath: string = "./graph.json") {
    this.graphPath = path.resolve(graphPath);
  }

  async load(): Promise<void> {
    try {
      const content = fs.readFileSync(this.graphPath, "utf-8");
      this.graph = JSON.parse(content);
      console.log(`✅ Grafo cargado: ${this.graphPath}`);
    } catch {
      console.warn(
        `⚠️ No se encontró grafo en ${this.graphPath}. Ejecuta 'npm run graphify:build'`
      );
      this.graph = null;
    }
  }

  search(query: string, type?: GraphNode["type"]): GraphNode[] {
    if (!this.graph) return [];

    const lowQuery = query.toLowerCase();
    return this.graph.nodes.filter(
      (node) =>
        (node.name.toLowerCase().includes(lowQuery) ||
          node.description?.toLowerCase().includes(lowQuery)) &&
        (!type || node.type === type)
    );
  }

  getContext(nodeId: string, depth: number = 2): {
    node: GraphNode | undefined;
    related: GraphNode[];
    context: string;
  } {
    if (!this.graph) {
      return { node: undefined, related: [], context: "" };
    }

    const node = this.graph.nodes.find((n) => n.id === nodeId);
    if (!node) return { node: undefined, related: [], context: "" };

    const visited = new Set<string>();
    const queue: { id: string; depth: number }[] = [{ id: nodeId, depth: 0 }];
    const related: GraphNode[] = [];

    while (queue.length > 0) {
      const { id, depth: d } = queue.shift()!;
      if (visited.has(id) || d > depth) continue;
      visited.add(id);

      const connectedEdges = this.graph.edges.filter(
        (e) => e.source === id || e.target === id
      );

      for (const edge of connectedEdges) {
        const nextId = edge.source === id ? edge.target : edge.source;
        const nextNode = this.graph.nodes.find((n) => n.id === nextId);
        if (nextNode && !visited.has(nextId)) {
          related.push(nextNode);
          queue.push({ id: nextId, depth: d + 1 });
        }
      }
    }

    const context = `
## ${node.name}
Tipo: ${node.type}
${node.path ? `Ruta: ${node.path}` : ""}
${node.description ? `Descripción: ${node.description}` : ""}
${node.complexity ? `Complejidad: ${node.complexity}` : ""}

### Relacionados:
${related.map((r) => `- ${r.name} (${r.type})`).join("\n")}
    `.trim();

    return { node, related, context };
  }

  getPromptContext(keywords: string[]): string {
    if (!this.graph) return "";

    const results: string[] = [];

    for (const keyword of keywords) {
      const matches = this.search(keyword);
      if (matches.length > 0) {
        for (const match of matches.slice(0, 3)) {
          const { context } = this.getContext(match.id);
          results.push(context);
        }
      }
    }

    if (results.length === 0) {
      return `Base de datos de grafo disponible pero sin coincidencias para: ${keywords.join(", ")}`;
    }

    return `Contexto del proyecto:\n${results.join("\n\n---\n\n")}`;
  }

  getSummary(): KnowledgeGraph["summary"] {
    if (!this.graph) return undefined;

    const languages = new Set<string>();
    (this.graph.files || []).forEach((f: any) => {
      if (f.language) languages.add(f.language);
    });

    return {
      totalFiles: (this.graph.files || []).length,
      totalNodes: this.graph.nodes.length,
      totalRelations: this.graph.edges.length,
      languages: Array.from(languages),
    };
  }

  isAvailable(): boolean {
    return this.graph !== null;
  }
}

export const graphify = new GraphifyClient();
