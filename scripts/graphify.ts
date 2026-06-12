#!/usr/bin/env node
/**
 * Script para crear y consultar grafo de conocimiento del proyecto
 * Uso: npx ts-node scripts/graphify.ts [comando] [args]
 */

import { spawn } from "child_process";
import path from "path";

const commands = {
  // Crear grafo de todo el proyecto
  build: async () => {
    console.log("📊 Construyendo grafo de conocimiento...");
    console.log("Incluye: /app, /lib, /components, /api routes\n");

    const sourceDir = path.resolve(process.cwd());
    const cmd = `npx graphify "${sourceDir}" --output ./graph.json`;

    console.log(`Comando: ${cmd}\n`);
    console.log(
      "Esto puede tomar algunos minutos dependiendo del tamaño del proyecto...\n"
    );

    return new Promise<void>((resolve, reject) => {
      const proc = spawn("npx", [
        "graphify",
        sourceDir,
        "--output",
        "./graph.json",
      ]);

      proc.stdout?.on("data", (data) => {
        console.log(String(data).trim());
      });

      proc.stderr?.on("data", (data) => {
        console.error(String(data).trim());
      });

      proc.on("close", (code) => {
        if (code === 0) {
          console.log("✅ Grafo creado en: ./graph.json");
          resolve();
        } else {
          reject(new Error(`Graphify cerró con código ${code}`));
        }
      });
    });
  },

  // Info sobre el grafo
  info: async () => {
    try {
      const fs = await import("fs");
      const graph = JSON.parse(fs.readFileSync("./graph.json", "utf-8"));

      console.log("📈 Estadísticas del Grafo:");
      console.log(`  Nodos: ${graph.nodes?.length || 0}`);
      console.log(`  Relaciones: ${graph.edges?.length || 0}`);
      console.log(`  Archivos: ${graph.files?.length || 0}`);

      if (graph.files) {
        console.log("\n📄 Top archivos por complejidad:");
        graph.files
          .sort(
            (a: any, b: any) =>
              (b.complexity || 0) - (a.complexity || 0)
          )
          .slice(0, 5)
          .forEach((f: any, i: number) => {
            console.log(`  ${i + 1}. ${f.path} (${f.complexity})`);
          });
      }
    } catch (error) {
      console.error("❌ No se encontró graph.json. Ejecuta 'npm run graphify:build'");
    }
  },

  // Ayuda
  help: () => {
    console.log(`
🚀 Graphify Knowledge Graph Builder

Comandos disponibles:
  build       Construir/actualizar el grafo de conocimiento
  info        Mostrar estadísticas del grafo actual
  help        Mostrar esta ayuda

Ejemplos:
  npx ts-node scripts/graphify.ts build
  npx ts-node scripts/graphify.ts info
    `);
  },
};

const cmd = process.argv[2] || "help";
const handler = commands[cmd as keyof typeof commands] as (() => void) | (() => Promise<void>);

if (!handler) {
  console.error(`❌ Comando desconocido: ${cmd}`);
  commands.help();
  process.exit(1);
}

Promise.resolve(handler())
  .then(() => process.exit(0))
  .catch((error) => {
    console.error(`\n❌ Error: ${error.message}`);
    process.exit(1);
  });
