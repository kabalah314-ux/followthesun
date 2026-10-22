import { HttpError, RETRYABLE_STATUS, fetchWithTimeout as fetchTimed, withRetry } from "../../lib/net";
import { decodeBytes } from "./csv";
import { OPEN_DATA_CONFIG as C } from "./config";

/**
 * Cliente mínimo de la API CKAN de Open Data BCN (solo lectura, desde el navegador).
 *
 *  · `package_show`        → recursos de un conjunto (se elige el más reciente de cada formato)
 *  · `datastore_search`     → registros paginados con solo los campos que hacen falta
 *  · `datastore_search_sql` → consultas agregadas (p. ej. áreas de juego agrupadas por espacio)
 */

export interface CkanResource {
  id: string;
  name?: string;
  format?: string;
  url: string;
  last_modified?: string | null;
  created?: string | null;
  datastore_active?: boolean;
}

interface CkanEnvelope<T> {
  success: boolean;
  result: T;
  error?: unknown;
}

interface CkanSettings {
  timeoutMs: number;
  /** Reintentos ante errores pasajeros (el portal devuelve 503/429 sueltos por su protección antibots). */
  retries: number;
  delaysMs: readonly number[];
  retryOn: (err: unknown) => boolean;
  /** Solo en Node (ETL): en el navegador una cabecera extra forzaría un preflight CORS. */
  headers?: Record<string, string>;
}

/** En el navegador: dos reintentos rápidos solo ante HTTP pasajero (un tiempo agotado no se repite). */
const settings: CkanSettings = {
  timeoutMs: C.timeoutMs,
  retries: 2,
  delaysMs: [700, 1800],
  retryOn: (e) => e instanceof HttpError && RETRYABLE_STATUS.has(e.status),
};

/** El ETL de datos precalculados usa tiempos y reintentos más generosos. */
export function configureCkan(patch: Partial<CkanSettings>) {
  Object.assign(settings, patch);
}

function fetchWithTimeout(url: string, timeoutMs: number): Promise<Response> {
  return withRetry(
    () =>
      fetchTimed(url, settings.headers ? { headers: settings.headers } : {}, timeoutMs).catch((e: unknown) => {
        if (e instanceof HttpError) throw new HttpError(e.status, `Open Data BCN HTTP ${e.status}`);
        throw e;
      }),
    { retries: settings.retries, delaysMs: settings.delaysMs, retryOn: settings.retryOn }
  );
}

async function action<T>(name: string, params: Record<string, string>, timeoutMs = settings.timeoutMs): Promise<T> {
  const url = `${C.apiBase}${name}?${new URLSearchParams(params).toString()}`;
  const res = await fetchWithTimeout(url, timeoutMs);
  const json = (await res.json()) as CkanEnvelope<T>;
  if (!json || json.success !== true) throw new Error(`Open Data BCN: ${name} sin éxito`);
  return json.result;
}

export async function packageResources(slug: string): Promise<CkanResource[]> {
  const result = await action<{ resources?: CkanResource[] }>("package_show", { id: slug });
  if (!Array.isArray(result?.resources) || result.resources.length === 0) {
    throw new Error(`Open Data BCN: «${slug}» sin recursos`);
  }
  return result.resources;
}

const stampOf = (r: CkanResource) => Date.parse(r.last_modified ?? r.created ?? "") || 0;

/** El recurso más reciente de un formato (los conjuntos semestrales acumulan uno por periodo). */
export function newestResource(
  resources: CkanResource[],
  format: string,
  opts: { datastore?: boolean } = {}
): CkanResource | null {
  const f = format.toLowerCase();
  const list = resources.filter(
    (r) => (r.format ?? "").toLowerCase() === f && (!opts.datastore || r.datastore_active === true)
  );
  if (list.length === 0) return null;
  return list.reduce((a, b) => (stampOf(b) > stampOf(a) ? b : a));
}

/** Descarga un fichero de texto (CSV) decodificándolo según su BOM. */
export async function fetchText(url: string, timeoutMs = settings.timeoutMs): Promise<string> {
  const res = await fetchWithTimeout(url, timeoutMs);
  return decodeBytes(new Uint8Array(await res.arrayBuffer()));
}

/** Todos los registros de un recurso del datastore, solo con `fields` (todos si va vacío), en páginas. */
export async function datastoreSearch<T>(
  resourceId: string,
  fields: readonly string[],
  opts: { pageSize?: number; maxRows?: number } = {}
): Promise<T[]> {
  const pageSize = opts.pageSize ?? 5000;
  const maxRows = opts.maxRows ?? 20_000;
  const out: T[] = [];
  for (let offset = 0; offset < maxRows; offset += pageSize) {
    const params: Record<string, string> = { resource_id: resourceId, limit: String(pageSize), offset: String(offset) };
    if (fields.length > 0) params.fields = fields.join(",");
    const page = await action<{ records?: T[]; total?: number }>("datastore_search", params);
    const records = page.records ?? [];
    out.push(...records);
    const total = typeof page.total === "number" ? page.total : out.length;
    if (records.length < pageSize || out.length >= total) break;
  }
  return out;
}

export async function datastoreSql<T>(sql: string): Promise<T[]> {
  const result = await action<{ records?: T[] }>("datastore_search_sql", { sql });
  return result.records ?? [];
}
