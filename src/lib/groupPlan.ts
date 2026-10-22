import type { SunPlace, SunPlaceType } from "../types";

/**
 * Plan en grupo (guía maestra 2): 2–5 opciones que viajan DENTRO del enlace, así se abre igual en
 * cualquier móvil sin cuentas ni servidor. Formato compacto en base64url de JSON:
 *   { t: título, o: [[id, nombre, lat, lng, tipo, minutos epoch | 0], …] }
 */

export interface GroupOption {
  id: string;
  name: string;
  type: SunPlaceType;
  lat: number;
  lng: number;
  /** Hora propuesta (ms) o null = el mejor momento de cada sitio. */
  time: number | null;
}

export interface GroupPlan {
  title: string;
  options: GroupOption[];
}

export const GROUP_MIN = 2;
export const GROUP_MAX = 5;

const TYPES: SunPlaceType[] = [
  "beach",
  "park",
  "square",
  "terrace",
  "viewpoint",
  "open_space",
  "playground",
  "climate_shelter",
  "fountain",
  "toilet",
  // Al final: los enlaces ya compartidos conservan sus índices.
  "bench",
];

const r5 = (v: number) => Math.round(v * 1e5) / 1e5;

function toBase64Url(text: string): string {
  const bytes = new TextEncoder().encode(text);
  let bin = "";
  for (const b of bytes) bin += String.fromCharCode(b);
  return btoa(bin).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

function fromBase64Url(s: string): string {
  const b64 = s.replace(/-/g, "+").replace(/_/g, "/") + "===".slice((s.length + 3) % 4);
  const bin = atob(b64);
  const bytes = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
  return new TextDecoder().decode(bytes);
}

export function encodeGroupPlan(p: GroupPlan): string {
  const compact = {
    t: p.title.trim().slice(0, 80),
    o: p.options
      .slice(0, GROUP_MAX)
      .map((o) => [o.id, o.name.slice(0, 80), r5(o.lat), r5(o.lng), Math.max(0, TYPES.indexOf(o.type)), o.time === null ? 0 : Math.round(o.time / 60_000)]),
  };
  return toBase64Url(JSON.stringify(compact));
}

/** El plan de un enlace, o null si el enlace está roto o no es un plan. */
export function decodeGroupPlan(s: string | null | undefined): GroupPlan | null {
  if (!s || s.length > 4000) return null;
  try {
    const raw: unknown = JSON.parse(fromBase64Url(s));
    if (!raw || typeof raw !== "object") return null;
    const r = raw as { t?: unknown; o?: unknown };
    if (!Array.isArray(r.o)) return null;
    const options: GroupOption[] = [];
    for (const item of r.o.slice(0, GROUP_MAX)) {
      if (!Array.isArray(item) || item.length < 6) continue;
      const [id, name, lat, lng, type, minutes] = item as unknown[];
      if (typeof id !== "string" || typeof name !== "string" || typeof lat !== "number" || typeof lng !== "number") continue;
      if (Math.abs(lat) > 90 || Math.abs(lng) > 180) continue;
      const ty = typeof type === "number" && TYPES[type] ? TYPES[type] : "open_space";
      const time = typeof minutes === "number" && minutes > 0 ? minutes * 60_000 : null;
      options.push({ id, name, lat, lng, type: ty, time });
    }
    if (options.length === 0) return null;
    return { title: typeof r.t === "string" ? r.t.slice(0, 80) : "", options };
  } catch {
    return null;
  }
}

/** Añade una opción (sin repetir el sitio y sin pasar de cinco). */
export function addOption(p: GroupPlan, o: GroupOption): GroupPlan {
  if (p.options.some((x) => x.id === o.id)) return p;
  return { ...p, options: [...p.options, o].slice(0, GROUP_MAX) };
}

export function removeOption(p: GroupPlan, id: string): GroupPlan {
  return { ...p, options: p.options.filter((o) => o.id !== id) };
}

/** Una opción como lugar (para abrir su ficha o calcular su sol). */
export const optionToPlace = (o: GroupOption): SunPlace => ({
  id: o.id,
  name: o.name,
  type: o.type,
  latitude: o.lat,
  longitude: o.lng,
  source: "group",
});

export function sanitizeGroupPlan(v: unknown): GroupPlan {
  if (!v || typeof v !== "object") return { title: "", options: [] };
  const o = v as { title?: unknown; options?: unknown };
  const options = Array.isArray(o.options)
    ? (o.options as unknown[]).filter(
        (x): x is GroupOption =>
          !!x &&
          typeof x === "object" &&
          typeof (x as GroupOption).id === "string" &&
          typeof (x as GroupOption).name === "string" &&
          typeof (x as GroupOption).lat === "number" &&
          typeof (x as GroupOption).lng === "number"
      )
    : [];
  return { title: typeof o.title === "string" ? o.title : "", options: options.slice(0, GROUP_MAX) };
}
