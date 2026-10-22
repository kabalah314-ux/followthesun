/**
 * Páginas estáticas para buscadores y para compartir, después de `vite build`.
 *
 *   SITE_URL=https://midominio.es npx vite-node scripts/seo/prerender.ts   (lo llama `npm run build`)
 *
 * - dist/index.html: sustituye __SITE_URL__ (canonical, og:url, og:image).
 * - dist/lugar/<slug>/index.html por cada lugar con nombre de public/data/places.json (hasta
 *   MAX_PAGES): título, descripción, canonical, Open Graph, Twitter, JSON-LD (schema.org con
 *   coordenadas) y un texto breve dentro de #root que React sustituye al arrancar. La app se carga
 *   igual que siempre: la ruta /lugar/<slug> abre la ficha del lugar (src/lib/deepLinks).
 * - dist/barrio/<slug>/index.html si los lugares traen barrio (metadata.neighborhood). El
 *   inventario actual no lo trae; cuando lo haga, las páginas aparecen solas.
 * - dist/sitemap.xml y dist/robots.txt.
 *
 * La URL pública sale de SITE_URL (o VITE_SITE_URL); por defecto, la de Vercel.
 */
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { placeSlug, slugify } from "../../src/lib/deepLinks";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const DIST = path.join(ROOT, "dist");
const DEFAULT_SITE_URL = "https://followthesun-kabalah314-uxs-projects.vercel.app";
const SITE = (process.env.SITE_URL || process.env.VITE_SITE_URL || DEFAULT_SITE_URL).trim().replace(/\/+$/, "");
const MAX_PAGES = 1500;
const NEARBY = 6;

interface InventoryPlace {
  id: string;
  name: string;
  type: string;
  latitude: number;
  longitude: number;
  areaM2?: number;
  metadata?: Record<string, unknown>;
}

interface Page {
  slug: string;
  place: InventoryPlace;
  label: string;
  barrio: string | null;
}

/** Etiquetas propias (las páginas SEO van en castellano y no dependen de la interfaz). */
const TYPE_LABEL: Record<string, string> = {
  beach: "Playa",
  park: "Parque",
  square: "Plaza",
  viewpoint: "Mirador",
  open_space: "Espacio abierto",
  playground: "Área de juego",
  terrace: "Terraza",
};
const TERRACE_LABEL: Record<string, string> = {
  cafe: "Cafetería con terraza",
  bar: "Bar con terraza",
  pub: "Bar con terraza",
  restaurant: "Restaurante con terraza",
  ice_cream: "Heladería con terraza",
  biergarten: "Terraza cervecera",
};
const TYPE_PRIORITY: Record<string, number> = { beach: 0, viewpoint: 1, park: 2, square: 3, open_space: 4, playground: 5, terrace: 6 };

const SCHEMA_TYPE: Record<string, string> = {
  beach: "Beach",
  park: "Park",
  square: "Place",
  viewpoint: "TouristAttraction",
  open_space: "Place",
  playground: "Playground",
};
const SCHEMA_TERRACE: Record<string, string> = {
  cafe: "CafeOrCoffeeShop",
  bar: "BarOrPub",
  pub: "BarOrPub",
  restaurant: "Restaurant",
  ice_cream: "IceCreamShop",
};

const esc = (s: string) =>
  s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;").replace(/'/g, "&#39;");

function labelOf(p: InventoryPlace): string {
  if (p.type === "terrace") {
    const amenity = String(p.metadata?.amenity ?? "");
    return TERRACE_LABEL[amenity] ?? TYPE_LABEL.terrace;
  }
  return TYPE_LABEL[p.type] ?? "Lugar";
}

function schemaTypeOf(p: InventoryPlace): string {
  if (p.type === "terrace") return SCHEMA_TERRACE[String(p.metadata?.amenity ?? "")] ?? "FoodEstablishment";
  return SCHEMA_TYPE[p.type] ?? "Place";
}

function barrioOf(p: InventoryPlace): string | null {
  const b = p.metadata?.neighborhood ?? p.metadata?.barrio;
  return typeof b === "string" && b.trim() ? b.trim() : null;
}

function describe(p: InventoryPlace, label: string): string {
  const where = p.type === "terrace" ? " en su terraza" : "";
  return `${p.name} (${label.toLowerCase()}, Barcelona): a qué hora da el sol${where} y cuándo hay sombra, hoy y cualquier día, con las sombras de los edificios y la previsión de nubes.`;
}

function distanceM(a: InventoryPlace, b: InventoryPlace): number {
  const R = 6_371_000;
  const toRad = (d: number) => (d * Math.PI) / 180;
  const dLat = toRad(b.latitude - a.latitude);
  const dLng = toRad(b.longitude - a.longitude);
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(toRad(a.latitude)) * Math.cos(toRad(b.latitude)) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(h));
}

/** Sustituye un bloque entre comentarios marcador (incluidos los marcadores de cierre). */
function replaceBlock(html: string, start: string, end: string, content: string): string {
  const a = html.indexOf(start);
  const b = html.indexOf(end);
  if (a < 0 || b < 0 || b < a) throw new Error(`index.html no tiene el bloque ${start} … ${end}`);
  const startEnd = html.indexOf("-->", a) + 3;
  return html.slice(0, a) + html.slice(a, startEnd) + content + html.slice(b);
}

function headTags(o: { title: string; description: string; url: string; type: string; jsonLd?: object }): string {
  const img = `${SITE}/og-image.png`;
  const lines = [
    `<title>${esc(o.title)}</title>`,
    `<meta name="description" content="${esc(o.description)}" />`,
    `<link rel="canonical" href="${esc(o.url)}" />`,
    `<meta property="og:type" content="${o.type}" />`,
    `<meta property="og:site_name" content="I Follow the Sun" />`,
    `<meta property="og:locale" content="es_ES" />`,
    `<meta property="og:url" content="${esc(o.url)}" />`,
    `<meta property="og:title" content="${esc(o.title)}" />`,
    `<meta property="og:description" content="${esc(o.description)}" />`,
    `<meta property="og:image" content="${img}" />`,
    `<meta property="og:image:width" content="1200" />`,
    `<meta property="og:image:height" content="630" />`,
    `<meta name="twitter:card" content="summary_large_image" />`,
    `<meta name="twitter:title" content="${esc(o.title)}" />`,
    `<meta name="twitter:description" content="${esc(o.description)}" />`,
    `<meta name="twitter:image" content="${img}" />`,
  ];
  if (o.jsonLd) {
    // `<` escapado: un nombre con «</script>» no puede cerrar la etiqueta.
    lines.push(`<script type="application/ld+json">${JSON.stringify(o.jsonLd).replace(/</g, "\\u003c")}</script>`);
  }
  return `\n    ${lines.join("\n    ")}\n    `;
}

const BODY_STYLE =
  "max-width:36rem;margin:16vh auto 0;padding:0 1.25rem;font-family:Manrope,system-ui,sans-serif;color:#1f1c26;line-height:1.5";

function placeBody(page: Page, nearby: Page[]): string {
  const p = page.place;
  const links = nearby
    .map((n) => `<li><a href="/lugar/${n.slug}" style="color:#9a4d06">${esc(n.place.name)}</a> · ${esc(n.label.toLowerCase())}</li>`)
    .join("");
  return (
    `<main style="${BODY_STYLE}">` +
    `<p style="margin:0;font-size:.8rem;letter-spacing:.12em;text-transform:uppercase;color:#9a4d06">${esc(page.label)}${page.barrio ? ` · ${esc(page.barrio)}` : ""} · Barcelona</p>` +
    `<h1 style="font:600 1.9rem/1.2 'Instrument Serif',Georgia,serif;margin:.4rem 0 .6rem">${esc(p.name)}</h1>` +
    `<p style="margin:0 0 1rem;color:#4a4553">${esc(describe(p, page.label))}</p>` +
    `<p style="margin:0 0 1.5rem"><a href="/lugar/${page.slug}" style="color:#1f1c26;font-weight:600">Ver el sol de hoy en ${esc(p.name)}</a></p>` +
    (links ? `<h2 style="font-size:1rem;margin:0 0 .4rem">Cerca</h2><ul style="margin:0;padding-left:1.1rem;color:#4a4553">${links}</ul>` : "") +
    `</main>`
  );
}

/** Centro aproximado de un barrio: la media de sus lugares (para abrir el mapa allí). */
function centerOf(pages: Page[]): { lat: number; lng: number } {
  const lat = pages.reduce((s, p) => s + p.place.latitude, 0) / pages.length;
  const lng = pages.reduce((s, p) => s + p.place.longitude, 0) / pages.length;
  return { lat, lng };
}

function barrioBody(name: string, pages: Page[]): string {
  const c = centerOf(pages);
  const mapHref = `/?c=${c.lat.toFixed(5)},${c.lng.toFixed(5)}&amp;z=15`;
  const links = pages
    .slice(0, 60)
    .map((n) => `<li><a href="/lugar/${n.slug}" style="color:#9a4d06">${esc(n.place.name)}</a> · ${esc(n.label.toLowerCase())}</li>`)
    .join("");
  return (
    `<main style="${BODY_STYLE}">` +
    `<p style="margin:0;font-size:.8rem;letter-spacing:.12em;text-transform:uppercase;color:#9a4d06">Barrio · Barcelona</p>` +
    `<h1 style="font:600 1.9rem/1.2 'Instrument Serif',Georgia,serif;margin:.4rem 0 .6rem">Sol y sombra en ${esc(name)}</h1>` +
    `<p style="margin:0 0 1rem;color:#4a4553">Terrazas, plazas y parques de ${esc(name)} y a qué hora les da el sol (o la sombra), minuto a minuto.</p>` +
    `<p style="margin:0 0 1.5rem"><a href="${mapHref}" style="color:#1f1c26;font-weight:600">Ver el sol de ahora en ${esc(name)}</a></p>` +
    `<ul style="margin:0;padding-left:1.1rem;color:#4a4553">${links}</ul>` +
    `</main>`
  );
}

function writePage(dir: string, html: string) {
  mkdirSync(dir, { recursive: true });
  writeFileSync(path.join(dir, "index.html"), html);
}

function main() {
  const t0 = Date.now();
  const indexPath = path.join(DIST, "index.html");
  if (!existsSync(indexPath)) throw new Error("dist/index.html no existe: ¿se ejecutó vite build?");
  const template = readFileSync(indexPath, "utf8").replace(/__SITE_URL__/g, SITE);
  writeFileSync(indexPath, template);

  const dataPath = [path.join(DIST, "data", "places.json"), path.join(ROOT, "public", "data", "places.json")].find(existsSync);
  const sitemap: Array<{ loc: string; lastmod?: string; priority: string }> = [
    { loc: `${SITE}/`, priority: "1.0" },
    { loc: `${SITE}/planes`, priority: "0.8" },
  ];

  let pages: Page[] = [];
  let lastmod: string | undefined;
  if (dataPath) {
    const data = JSON.parse(readFileSync(dataPath, "utf8")) as { generatedAt?: string; places?: InventoryPlace[] };
    lastmod = data.generatedAt ? data.generatedAt.slice(0, 10) : undefined;
    const seen = new Set<string>();
    const candidates = (data.places ?? [])
      .filter((p) => p && typeof p.name === "string" && p.name.trim() && Number.isFinite(p.latitude) && Number.isFinite(p.longitude))
      .sort((a, b) => (TYPE_PRIORITY[a.type] ?? 9) - (TYPE_PRIORITY[b.type] ?? 9) || (b.areaM2 ?? 0) - (a.areaM2 ?? 0));
    for (const place of candidates) {
      const slug = placeSlug(place);
      if (!slug || seen.has(slug)) continue;
      seen.add(slug);
      pages.push({ slug, place, label: labelOf(place), barrio: barrioOf(place) });
      if (pages.length >= MAX_PAGES) break;
    }
  } else {
    console.warn("prerender · sin public/data/places.json: solo se generan sitemap y robots");
  }

  for (const page of pages) {
    const p = page.place;
    const url = `${SITE}/lugar/${page.slug}`;
    const nearby = pages
      .filter((o) => o !== page)
      .map((o) => ({ o, d: distanceM(p, o.place) }))
      .filter((x) => x.d < 1500)
      .sort((a, b) => a.d - b.d)
      .slice(0, NEARBY)
      .map((x) => x.o);
    const title = `${p.name} · sol y sombra hoy | I Follow the Sun`;
    const description = describe(p, page.label);
    const jsonLd = {
      "@context": "https://schema.org",
      "@type": schemaTypeOf(p),
      name: p.name,
      url,
      geo: { "@type": "GeoCoordinates", latitude: p.latitude, longitude: p.longitude },
      address: { "@type": "PostalAddress", addressLocality: "Barcelona", addressCountry: "ES" },
      containedInPlace: { "@type": "City", name: "Barcelona" },
    };
    let html = replaceBlock(template, "<!-- seo:start", "<!-- seo:end -->", headTags({ title, description, url, type: "website", jsonLd }));
    html = replaceBlock(html, "<!-- seo:body:start", "<!-- seo:body:end -->", placeBody(page, nearby));
    writePage(path.join(DIST, "lugar", page.slug), html);
    sitemap.push({ loc: url, lastmod, priority: p.type === "terrace" ? "0.5" : "0.6" });
  }

  // Barrios: solo si el inventario trae el dato.
  const byBarrio = new Map<string, Page[]>();
  for (const page of pages) {
    if (!page.barrio) continue;
    const list = byBarrio.get(page.barrio) ?? [];
    list.push(page);
    byBarrio.set(page.barrio, list);
  }
  for (const [name, list] of byBarrio) {
    if (list.length < 3) continue;
    const slug = slugify(name);
    const url = `${SITE}/barrio/${slug}`;
    const title = `Sol y sombra en ${name}, Barcelona | I Follow the Sun`;
    const description = `Terrazas, plazas y parques de ${name} con sol o con sombra ahora, y hasta qué hora.`;
    const c = centerOf(list);
    const district = list.map((p) => p.place.metadata?.district).find((d): d is string => typeof d === "string" && d.trim() !== "");
    const jsonLd = {
      "@context": "https://schema.org",
      "@type": "Place",
      name: `${name}, Barcelona`,
      url,
      geo: { "@type": "GeoCoordinates", latitude: Number(c.lat.toFixed(5)), longitude: Number(c.lng.toFixed(5)) },
      containedInPlace: district
        ? { "@type": "AdministrativeArea", name: district, containedInPlace: { "@type": "City", name: "Barcelona" } }
        : { "@type": "City", name: "Barcelona" },
    };
    let html = replaceBlock(template, "<!-- seo:start", "<!-- seo:end -->", headTags({ title, description, url, type: "website", jsonLd }));
    html = replaceBlock(html, "<!-- seo:body:start", "<!-- seo:body:end -->", barrioBody(name, list));
    writePage(path.join(DIST, "barrio", slug), html);
    sitemap.push({ loc: url, lastmod, priority: "0.7" });
  }

  const xml =
    `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n` +
    sitemap
      .map((u) => `  <url><loc>${esc(u.loc)}</loc>${u.lastmod ? `<lastmod>${u.lastmod}</lastmod>` : ""}<priority>${u.priority}</priority></url>`)
      .join("\n") +
    `\n</urlset>\n`;
  writeFileSync(path.join(DIST, "sitemap.xml"), xml);
  writeFileSync(path.join(DIST, "robots.txt"), `User-agent: *\nAllow: /\n\nSitemap: ${SITE}/sitemap.xml\n`);

  console.log(
    `prerender · ${pages.length} lugares · ${[...byBarrio.values()].filter((l) => l.length >= 3).length} barrios` +
      `${byBarrio.size === 0 ? " (el inventario no trae barrio)" : ""} · sitemap ${sitemap.length} URL · ${SITE} · ${Date.now() - t0} ms`
  );
}

main();
