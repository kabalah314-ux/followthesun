import { DEG } from "./coordinates";
import { routeWaypoints } from "./routeShade";
import type { LngLatPair } from "./terraceShape";

/**
 * Correr o ir en bici a la sombra (guía maestra 2, utilidad 31): circuitos conocidos de Barcelona,
 * vueltas desde donde estás y las horas de salida con más sombra (o más sol) a primera y a última
 * hora. Sin red ni mapa: la ruta la da OSRM y la sombra el motor (`hooks/useSportRoute`).
 */

export type Sport = "run" | "bike";

/** Ritmo de referencia: correr a 6 min/km; bici de paseo por ciudad a 15 km/h. */
export const SPORT_SPEED_M_PER_MIN: Record<Sport, number> = { run: 1000 / 6, bike: 250 };

/** Metros entre muestras de sombra a lo largo del recorrido. */
export const SPORT_SAMPLE_M: Record<Sport, number> = { run: 25, bike: 40 };

export type CircuitId = "ciutadella" | "santjoan" | "montjuic" | "aigues" | "diagonal" | "maritim";

export interface Circuit {
  id: CircuitId;
  /** Nombre propio (igual en los tres idiomas). */
  name: string;
  /** Distancia aproximada por deporte (km); sin el deporte, el circuito no se ofrece para él. */
  km: Partial<Record<Sport, number>>;
  /** Puntos de paso en orden, con la vuelta incluida (los de ida y vuelta repiten el camino). */
  points: readonly LngLatPair[];
  /** Ida y vuelta por el mismo camino (si no, circuito cerrado). */
  outAndBack: boolean;
}

const ARC: LngLatPair = [2.18064, 41.39104];
const CIUTADELLA_LAP: LngLatPair[] = [ARC, [2.18653, 41.39014], [2.1887, 41.38796], [2.18449, 41.38704], [2.1834, 41.38808], ARC];
const MACIA: LngLatPair = [2.1445, 41.39274];
const VERDAGUER: LngLatPair = [2.16976, 41.39928];
const AIGUES: LngLatPair[] = [
  [2.10822, 41.41197],
  [2.10656, 41.40963],
  [2.10588, 41.40295],
  [2.10442, 41.40084],
  [2.10014, 41.38998],
];
const there = (pts: LngLatPair[]) => [...pts, ...pts.slice(0, -1).reverse()];

/** Puntos sacados de OpenStreetMap; cada recorrido se comprobó con OSRM (a pie y en bici). */
export const CIRCUITS: readonly Circuit[] = [
  { id: "ciutadella", name: "Parc de la Ciutadella", km: { run: 2.3 }, points: CIUTADELLA_LAP, outAndBack: false },
  {
    id: "santjoan",
    name: "Passeig de Sant Joan i Ciutadella",
    km: { run: 5, bike: 5.3 },
    points: [ARC, VERDAGUER, ...CIUTADELLA_LAP],
    outAndBack: false,
  },
  {
    id: "montjuic",
    name: "Montjuïc",
    km: { run: 4.2, bike: 6.7 },
    points: [
      [2.15174, 41.37116],
      [2.15346, 41.3686],
      [2.15565, 41.36472],
      [2.1595, 41.36228],
      [2.16008, 41.36864],
      [2.15867, 41.36831],
      [2.15174, 41.37116],
    ],
    outAndBack: false,
  },
  { id: "aigues", name: "Carretera de les Aigües", km: { run: 7.9, bike: 8 }, points: there(AIGUES), outAndBack: true },
  {
    id: "diagonal",
    name: "Diagonal",
    km: { run: 6.2, bike: 6.7 },
    points: there([MACIA, [2.15713, 41.39601], VERDAGUER, [2.17873, 41.40097]]),
    outAndBack: true,
  },
  { id: "maritim", name: "Passeig Marítim", km: { run: 6.4, bike: 6.9 }, points: there([[2.18926, 41.37135], [2.20667, 41.39395]]), outAndBack: true },
];

export const circuitsFor = (sport: Sport): Circuit[] => CIRCUITS.filter((c) => c.km[sport] !== undefined);

/** Distancias que se ofrecen para una vuelta desde donde estás (km). */
export const LOOP_KM: Record<Sport, readonly number[]> = { run: [3, 5, 8, 10], bike: [10, 15, 25] };

const M_LAT = 110_574;
const mLng = (lat: number) => 111_320 * Math.cos(lat * DEG);

/**
 * Puntos de una vuelta de unos `km` que sale de `start` y vuelve a él: un cuadrado inscrito en un
 * círculo cuyo centro queda hacia `bearingDeg`. Por calles sale ~25 % más largo que el cuadrado.
 */
export function loopWaypoints(start: { lng: number; lat: number }, km: number, bearingDeg: number): LngLatPair[] {
  const side = (km * 1000) / 4 / 1.25;
  const r = side / Math.SQRT2;
  const kx = mLng(start.lat);
  const b = bearingDeg * DEG;
  const cx = start.lng + (r * Math.sin(b)) / kx;
  const cy = start.lat + (r * Math.cos(b)) / M_LAT;
  const pts: LngLatPair[] = [[start.lng, start.lat]];
  for (let k = 1; k <= 3; k++) {
    const a = b + Math.PI + (k * Math.PI) / 2;
    pts.push([round6(cx + (r * Math.sin(a)) / kx), round6(cy + (r * Math.cos(a)) / M_LAT)]);
  }
  pts.push([start.lng, start.lat]);
  return pts;
}

const round6 = (x: number) => Math.round(x * 1e6) / 1e6;

const MIN = 60_000;
const HOUR = 3_600_000;

export interface SportSlots {
  morning: number[];
  evening: number[];
}

/**
 * Horas de salida que se comparan: cada media hora desde la salida del sol hasta tres horas
 * después, y de tres horas y media antes de la puesta hasta media hora antes. Las anteriores a
 * `notBefore` (lo que ya ha pasado hoy) se quitan.
 */
export function sportSlots(sunrise: number, sunset: number, notBefore = -Infinity): SportSlots {
  const q = 15 * MIN;
  const ceilQ = (t: number) => Math.ceil(t / q) * q;
  const morning: number[] = [];
  for (let t = ceilQ(sunrise); t <= sunrise + 3 * HOUR; t += 30 * MIN) if (t >= notBefore) morning.push(t);
  const evening: number[] = [];
  for (let t = ceilQ(sunset - 3.5 * HOUR); t <= sunset - 30 * MIN; t += 30 * MIN) if (t >= notBefore && !morning.includes(t)) evening.push(t);
  return { morning, evening };
}

export interface SlotPick {
  index: number;
  slot: number;
  pct: number;
}

/**
 * Hora recomendada de una franja. `pct` es el % de lo que se busca (sombra o sol) en cada hora.
 * Con alguna hora que llega al umbral, la más cómoda de las buenas: la más tardía (`latest`, p. ej.
 * para no madrugar) o la más temprana (`earliest`). Si ninguna llega, la de mejor %.
 */
export function pickSlot(slots: readonly number[], pct: readonly number[], prefer: "latest" | "earliest", threshold = 75): (SlotPick & { good: boolean }) | null {
  if (slots.length === 0) return null;
  const order = slots.map((_, i) => i);
  if (prefer === "latest") order.reverse();
  for (const i of order) if (pct[i] >= threshold) return { index: i, slot: slots[i], pct: pct[i], good: true };
  let best = order[0];
  for (const i of order) if (pct[i] > pct[best]) best = i;
  return { index: best, slot: slots[best], pct: pct[best], good: false };
}

const esc = (s: string) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");

/** Recorrido en GPX 1.1 (para relojes y apps de deporte). */
export function gpxOf(name: string, coords: readonly LngLatPair[]): string {
  const pts = coords.map(([lng, lat]) => `      <trkpt lat="${lat.toFixed(6)}" lon="${lng.toFixed(6)}"/>`).join("\n");
  return [
    `<?xml version="1.0" encoding="UTF-8"?>`,
    `<gpx version="1.1" creator="I Follow the Sun" xmlns="http://www.topografix.com/GPX/1/1">`,
    `  <metadata><name>${esc(name)}</name></metadata>`,
    `  <trk>`,
    `    <name>${esc(name)}</name>`,
    `    <trkseg>`,
    pts,
    `    </trkseg>`,
    `  </trk>`,
    `</gpx>`,
    ``,
  ].join("\n");
}

/** El recorrido en Google Maps, a pie o en bici, con puntos intermedios para que lo siga. */
export function sportMapsUrl(coords: readonly LngLatPair[], sport: Sport): string {
  if (coords.length === 0) return "https://www.google.com/maps";
  const ll = ([lng, lat]: LngLatPair) => `${lat.toFixed(6)},${lng.toFixed(6)}`;
  const p = new URLSearchParams({
    api: "1",
    origin: ll(coords[0]),
    destination: ll(coords[coords.length - 1]),
    travelmode: sport === "bike" ? "bicycling" : "walking",
  });
  const wps = routeWaypoints(coords, 8);
  if (wps.length > 0) p.set("waypoints", wps.map(ll).join("|"));
  return `https://www.google.com/maps/dir/?${p.toString()}`;
}

/** Nombre de fichero seguro a partir del nombre del recorrido. */
export function fileSlug(name: string): string {
  return (
    name
      .normalize("NFD")
      .replace(/[̀-ͯ]/g, "")
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "") || "ruta"
  );
}
