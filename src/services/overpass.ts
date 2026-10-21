import { PLACES_CONFIG } from "../config";
import { EndpointBreaker, fetchWithTimeout } from "../lib/net";

/**
 * Cliente de Overpass compartido por el inventario de lugares, los negocios con terraza y el ETL.
 *
 * Los servidores públicos limitan, se saturan y a veces no responden. Para que la app no se quede
 * esperando: cada servidor tiene su tiempo máximo, uno que acaba de fallar se aparta 10 min
 * (cortacircuitos) y, si todos están apartados, se falla al momento para usar las cachés.
 */

export interface OverpassOptions {
  /** Tiempo máximo por servidor. */
  timeoutMs: number;
  endpoints?: readonly string[];
  /** Solo en Node (ETL): en el navegador una cabecera extra forzaría un preflight CORS. */
  headers?: Record<string, string>;
  /** Probar también los servidores que acaban de fallar (ETL). Por defecto, no. */
  includeCooling?: boolean;
  fetchImpl?: typeof fetch;
}

export const overpassBreaker = new EndpointBreaker(10 * 60_000);

export class OverpassUnavailableError extends Error {
  constructor() {
    super("Overpass no disponible ahora (servidores apartados tras fallar)");
    this.name = "OverpassUnavailableError";
  }
}

export async function overpass<T>(query: string, opts: OverpassOptions): Promise<T[]> {
  const urls = overpassBreaker.order(opts.endpoints ?? PLACES_CONFIG.endpoints, opts.includeCooling ?? false);
  if (urls.length === 0) throw new OverpassUnavailableError();
  let last: unknown = new OverpassUnavailableError();
  for (const url of urls) {
    try {
      // Cuerpo `application/x-www-form-urlencoded`: petición «simple», sin preflight CORS.
      const res = await fetchWithTimeout(
        url,
        { method: "POST", body: new URLSearchParams({ data: query }), headers: opts.headers },
        opts.timeoutMs,
        opts.fetchImpl
      );
      const json = (await res.json()) as { elements?: T[]; remark?: string };
      if (!json || !Array.isArray(json.elements)) throw new Error("Overpass: respuesta inesperada");
      // Overpass responde 200 con un `remark` cuando se queda sin tiempo o memoria (datos parciales).
      if (json.remark && /runtime error|timed out|out of memory/i.test(json.remark)) {
        throw new Error("Overpass: consulta incompleta");
      }
      overpassBreaker.ok(url);
      return json.elements;
    } catch (e) {
      overpassBreaker.fail(url);
      last = e;
    }
  }
  throw last;
}
