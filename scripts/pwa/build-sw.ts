/**
 * Prepara dist/sw.js después de `vite build`: le pone versión y la lista de precarga del shell.
 *
 *   npx vite-node scripts/pwa/build-sw.ts      (lo llama `npm run build`)
 *
 * La precarga es mínima: la app (/), el manifiesto, los iconos y los ficheros que index.html carga
 * al arrancar. El resto de fragmentos se guardan en caché la primera vez que se usan.
 * La versión es un hash del contenido de esos ficheros: cambia solo si cambia la app.
 */
import { createHash } from "node:crypto";
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const DIST = path.join(ROOT, "dist");
const SW = path.join(DIST, "sw.js");

const STATIC = ["/manifest.webmanifest", "/icons/icon-192.png", "/icons/icon-512.png", "/icons/apple-touch-icon.png"];

function main() {
  if (!existsSync(SW)) throw new Error("dist/sw.js no existe: ¿se ejecutó vite build?");
  const html = readFileSync(path.join(DIST, "index.html"), "utf8");
  const entry = [...new Set([...html.matchAll(/(?:src|href)="(\/assets\/[^"]+)"/g)].map((m) => m[1]))];
  const precache = ["/", ...STATIC, ...entry].filter((url) => url === "/" || existsSync(path.join(DIST, url)));

  const hash = createHash("sha256");
  hash.update(html);
  for (const url of precache) {
    if (url !== "/") hash.update(readFileSync(path.join(DIST, url)));
  }
  const version = hash.digest("hex").slice(0, 12);

  let sw = readFileSync(SW, "utf8");
  const before = sw;
  sw = sw.replace('"__FTS_SW_VERSION__"', JSON.stringify(version));
  sw = sw.replace("/* __FTS_PRECACHE__ */ []", JSON.stringify(precache));
  if (sw === before || sw.includes("__FTS_")) throw new Error("dist/sw.js no tiene los marcadores esperados");
  writeFileSync(SW, sw);
  console.log(`sw.js · versión ${version} · ${precache.length} ficheros en precarga`);
}

main();
