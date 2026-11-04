// Hooks de resolución para ejecutar pruebas TypeScript con `node --test` (Node ≥ 22.18
// ejecuta .ts quitando tipos). Resuelve el alias "@/" -> src/ y las importaciones
// sin extensión (./modulo -> ./modulo.ts), igual que Next.js/TypeScript.
import { existsSync, statSync } from "node:fs";
import { fileURLToPath, pathToFileURL } from "node:url";

const SRC = new URL("../src/", import.meta.url);
const EXTENSIONS = [".ts", ".tsx", "/index.ts"];

function withExtension(url) {
  const path = fileURLToPath(url);
  if (existsSync(path) && statSync(path).isFile()) return url;
  for (const extension of EXTENSIONS) {
    if (existsSync(path + extension)) return pathToFileURL(path + extension).href;
  }
  return null;
}

export async function resolve(specifier, context, nextResolve) {
  // "server-only" lanza fuera de los Server Components de Next; en pruebas es un no-op.
  if (specifier === "server-only") return { url: "data:text/javascript,export {};", shortCircuit: true };
  if (specifier.startsWith("@/")) {
    const target = withExtension(new URL(specifier.slice(2), SRC).href);
    if (target) return { url: target, shortCircuit: true };
  }
  if ((specifier.startsWith("./") || specifier.startsWith("../")) && context.parentURL?.startsWith("file:")) {
    const target = withExtension(new URL(specifier, context.parentURL).href);
    if (target) return { url: target, shortCircuit: true };
  }
  return nextResolve(specifier, context);
}
