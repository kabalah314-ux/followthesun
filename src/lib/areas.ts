import type { SunPlace } from "../types";
import { nameKey } from "./text";

/**
 * Barrios y distritos de Barcelona para el buscador universal.
 *
 * Dos fuentes que se combinan:
 *  · una lista corta con los nombres que la gente usa («el Born», «Gràcia», «Poblenou») y su centro
 *    aproximado, para que funcionen desde el primer instante;
 *  · los barrios que traen los datos abiertos del inventario (`metadata.neighborhood` y
 *    `metadata.district`, Open Data BCN): su centro es la media de sus lugares, así que se ajusta
 *    solo a los datos reales y cubre los 73 barrios.
 */

export interface Area {
  id: string;
  /** Nombre que se muestra. */
  name: string;
  kind: "barrio" | "distrito";
  lat: number;
  lng: number;
  /** Otras formas de nombrarlo (ya sin acentos ni artículo). */
  aliases: string[];
}

const area = (name: string, lat: number, lng: number, aliases: string[] = [], kind: Area["kind"] = "barrio"): Area => ({
  id: `area:${nameKey(name).replace(/\s+/g, "-")}`,
  name,
  kind,
  lat,
  lng,
  aliases: aliases.map(nameKey),
});

/** Centros aproximados (±300 m): sirven para encuadrar y como origen de «cerca de…». */
export const BCN_AREAS: Area[] = [
  area("Ciutat Vella", 41.3825, 2.1769, ["ciudad vieja", "old town", "casco antiguo"], "distrito"),
  area("Barri Gòtic", 41.3833, 2.177, ["gotic", "gotico", "barrio gotico", "el barri gotic", "gothic quarter", "gothic"]),
  area("El Born", 41.3851, 2.1817, ["born", "la ribera", "santa caterina", "sant pere santa caterina i la ribera"]),
  area("El Raval", 41.3797, 2.1683, ["raval"]),
  area("La Barceloneta", 41.3807, 2.1897, ["barceloneta"]),
  area("Eixample", 41.3917, 2.1649, ["l eixample", "ensanche"], "distrito"),
  area("Sant Antoni", 41.3786, 2.1617, ["san antonio"]),
  area("Sagrada Família", 41.4036, 2.1744, ["sagrada familia", "la sagrada familia"]),
  area("Fort Pienc", 41.3955, 2.182, ["el fort pienc"]),
  area("Dreta de l'Eixample", 41.3946, 2.167, ["la dreta de l eixample", "derecha del ensanche"]),
  area("Esquerra de l'Eixample", 41.3889, 2.1556, ["l antiga esquerra de l eixample", "antiga esquerra", "izquierda del ensanche"]),
  area("Gràcia", 41.4025, 2.1565, ["gracia", "vila de gracia", "la vila de gracia"]),
  area("Vallcarca", 41.4125, 2.1448, ["vallcarca i els penitents"]),
  area("Camp d'en Grassot", 41.4058, 2.1652, ["el camp d en grassot i gracia nova", "gracia nova"]),
  area("La Salut", 41.411, 2.153, ["salut"]),
  area("El Putxet", 41.4075, 2.1435, ["putxet", "putget", "el putxet i el farro"]),
  area("Sants", 41.3752, 2.136, ["sants badal"]),
  area("Hostafrancs", 41.3755, 2.144),
  area("El Poble-sec", 41.3727, 2.163, ["poble sec", "poblesec", "pueblo seco"]),
  area("Montjuïc", 41.3637, 2.1588, ["montjuic"]),
  area("Les Corts", 41.3858, 2.1319, ["corts"]),
  area("Pedralbes", 41.388, 2.111),
  area("Sarrià", 41.4002, 2.1213, ["sarria"]),
  area("Les Tres Torres", 41.3975, 2.1295, ["tres torres"]),
  area("Sant Gervasi", 41.401, 2.139, ["sant gervasi galvany", "galvany", "sant gervasi la bonanova", "la bonanova", "bonanova", "san gervasio"]),
  area("Horta", 41.4297, 2.1609),
  area("El Carmel", 41.4195, 2.1557, ["carmel", "el carmelo", "carmelo", "bunkers del carmel"]),
  area("El Guinardó", 41.418, 2.173, ["guinardo", "el baix guinardo", "baix guinardo"]),
  area("Vall d'Hebron", 41.429, 2.146, ["la vall d hebron", "vall hebron"]),
  area("Nou Barris", 41.441, 2.177, ["9 barris"], "distrito"),
  area("Sant Andreu", 41.4355, 2.1897, ["sant andreu de palomar", "san andres"]),
  area("La Sagrera", 41.4225, 2.1885, ["sagrera"]),
  area("El Clot", 41.4095, 2.1875, ["clot", "el camp de l arpa del clot", "camp de l arpa"]),
  area("Poblenou", 41.4005, 2.199, ["el poblenou", "poble nou", "pueblo nuevo"]),
  area("Vila Olímpica", 41.3895, 2.1965, ["la vila olimpica del poblenou", "vila olimpica", "villa olimpica", "port olimpic"]),
  area("Llacuna del Poblenou", 41.3985, 2.1915, ["el parc i la llacuna del poblenou", "llacuna"]),
  area("Diagonal Mar", 41.409, 2.216, ["diagonal mar i el front maritim del poblenou", "front maritim"]),
  area("El Besòs i el Maresme", 41.414, 2.215, ["besos", "el besos", "maresme"]),
  area("La Verneda", 41.423, 2.202, ["la verneda i la pau", "verneda"]),
  area("Sant Martí", 41.4135, 2.1995, ["sant marti de provencals", "san martin"], "distrito"),
  area("Sarrià-Sant Gervasi", 41.401, 2.127, [], "distrito"),
  area("Sants-Montjuïc", 41.371, 2.147, ["sants montjuic"], "distrito"),
  area("Horta-Guinardó", 41.422, 2.162, ["horta guinardo"], "distrito"),
];

/** Barrios y distritos a partir del inventario: centro = media de sus lugares (mínimo 3). */
export function areasFromPlaces(places: readonly SunPlace[]): Area[] {
  const groups = new Map<string, { name: string; kind: Area["kind"]; lat: number; lng: number; n: number }>();
  const add = (raw: unknown, kind: Area["kind"], p: SunPlace) => {
    if (typeof raw !== "string" || !raw.trim()) return;
    const key = `${kind}|${nameKey(raw)}`;
    const g = groups.get(key) ?? { name: raw.trim(), kind, lat: 0, lng: 0, n: 0 };
    g.lat += p.latitude;
    g.lng += p.longitude;
    g.n += 1;
    groups.set(key, g);
  };
  for (const p of places) {
    add(p.metadata?.neighborhood, "barrio", p);
    add(p.metadata?.district, "distrito", p);
  }
  const out: Area[] = [];
  for (const g of groups.values()) {
    if (g.n < 3) continue;
    const name = g.name.charAt(0).toUpperCase() + g.name.slice(1);
    out.push(area(name, Math.round((g.lat / g.n) * 1e5) / 1e5, Math.round((g.lng / g.n) * 1e5) / 1e5, [], g.kind));
  }
  return out;
}

const keysOf = (a: Area) => [nameKey(a.name), ...a.aliases];

/**
 * Une la lista corta y la del inventario. Si un barrio está en las dos, se queda el nombre corto y
 * sus alias, con el centro calculado a partir de los datos reales.
 */
export function mergeAreas(base: readonly Area[], extra: readonly Area[]): Area[] {
  const out = base.map((a) => ({ ...a, aliases: [...a.aliases] }));
  for (const e of extra) {
    const ek = nameKey(e.name);
    const hit = out.find((a) => a.kind === e.kind && keysOf(a).includes(ek));
    if (hit) {
      hit.lat = e.lat;
      hit.lng = e.lng;
      if (!hit.aliases.includes(ek) && ek !== nameKey(hit.name)) hit.aliases.push(ek);
    } else if (!out.some((a) => keysOf(a).includes(ek))) {
      out.push(e);
    }
  }
  return out;
}
