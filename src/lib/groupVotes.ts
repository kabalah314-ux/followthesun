import { createLocalStore } from "./localStore";
import type { GroupPlan } from "./groupPlan";

/**
 * Votos del plan en grupo sin servidor (guía maestra 2, D6): cada voto viaja en el propio enlace
 * que se manda al grupo (`?g=<plan>&v=<voto>`). Quien abre esos enlaces va sumando los votos en
 * su móvil, así el que organiza ve el recuento al abrir las respuestas. No es en tiempo real (eso
 * pediría un servidor), pero no necesita cuentas ni datos de nadie fuera de su teléfono.
 */

export interface GroupVote {
  /** Nombre que puso quien vota (puede ir vacío). */
  voter: string;
  /** Índice de la opción (0–4). */
  option: number;
  at: number;
}

/** Huella estable de un plan: título y sitios en orden. */
export function planKey(plan: GroupPlan): string {
  const s = `${plan.title}|${plan.options.map((o) => o.id).join(",")}`;
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return (h >>> 0).toString(36);
}

function toB64(text: string): string {
  const bytes = new TextEncoder().encode(text);
  let bin = "";
  for (const b of bytes) bin += String.fromCharCode(b);
  return btoa(bin).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

function fromB64(s: string): string {
  const b64 = s.replace(/-/g, "+").replace(/_/g, "/") + "===".slice((s.length + 3) % 4);
  const bin = atob(b64);
  const bytes = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
  return new TextDecoder().decode(bytes);
}

export function encodeVote(v: { voter: string; option: number }): string {
  return toB64(JSON.stringify({ n: v.voter.trim().slice(0, 30), o: v.option }));
}

export function decodeVote(s: string | null | undefined, options: number): { voter: string; option: number } | null {
  if (!s || s.length > 200) return null;
  try {
    const raw = JSON.parse(fromB64(s)) as { n?: unknown; o?: unknown };
    const option = typeof raw.o === "number" && Number.isInteger(raw.o) ? raw.o : -1;
    if (option < 0 || option >= options) return null;
    return { voter: typeof raw.n === "string" ? raw.n.trim().slice(0, 30) : "", option };
  } catch {
    return null;
  }
}

type VoteBook = Record<string, GroupVote[]>;

const sanitize = (v: unknown): VoteBook => {
  if (!v || typeof v !== "object") return {};
  const out: VoteBook = {};
  for (const [k, list] of Object.entries(v as Record<string, unknown>)) {
    if (!Array.isArray(list)) continue;
    out[k] = list
      .filter((x): x is GroupVote => !!x && typeof x === "object" && typeof (x as GroupVote).option === "number")
      .map((x) => ({ voter: String(x.voter ?? "").slice(0, 30), option: x.option, at: Number(x.at) || 0 }))
      .slice(-50);
  }
  return out;
};

export const groupVotesStore = createLocalStore<VoteBook>("fts:group-votes:v1", {}, sanitize);

/** Añade un voto: la misma persona (por nombre) solo cuenta una vez, con su último voto. Sin nombre, cada voto cuenta. */
export function addVote(book: VoteBook, key: string, v: { voter: string; option: number }, at = Date.now()): VoteBook {
  const list = (book[key] ?? []).filter((x) => !(v.voter && x.voter.toLowerCase() === v.voter.toLowerCase()));
  // Un mismo enlace abierto dos veces no suma dos votos anónimos.
  if (!v.voter && list.some((x) => !x.voter && x.option === v.option && Math.abs(x.at - at) < 2000)) return book;
  return { ...book, [key]: [...list, { voter: v.voter, option: v.option, at }].slice(-50) };
}

/** Recuento por opción. */
export function tally(votes: readonly GroupVote[], options: number): number[] {
  const out = new Array(options).fill(0) as number[];
  for (const v of votes) if (v.option >= 0 && v.option < options) out[v.option]++;
  return out;
}

/** Nombre que la persona usa al votar (se recuerda en su móvil). */
export const voterNameStore = createLocalStore<string>("fts:group-name", "", (v) => (typeof v === "string" ? v.slice(0, 30) : ""));
