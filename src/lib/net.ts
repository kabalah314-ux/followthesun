/**
 * Utilidades de red compartidas por la app y por el ETL de datos precalculados (`scripts/etl`).
 * No usan `window`: funcionan igual en el navegador y en Node 22.
 */

export class HttpError extends Error {
  readonly status: number;
  constructor(status: number, message: string) {
    super(message);
    this.name = "HttpError";
    this.status = status;
  }
}

/** Estados que suelen ser pasajeros: límite de peticiones, servidor saturado o caído un momento. */
export const RETRYABLE_STATUS: ReadonlySet<number> = new Set([408, 425, 429, 500, 502, 503, 504]);

/** ¿Merece la pena reintentar? HTTP pasajero, red caída, CORS fallido o tiempo agotado. */
export function isRetryable(err: unknown): boolean {
  if (err instanceof HttpError) return RETRYABLE_STATUS.has(err.status);
  if (!(err instanceof Error)) return false;
  return err.name === "AbortError" || err.name === "TypeError" || /network|fetch|timeout|abort/i.test(err.message);
}

export const sleep = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms));

/** `fetch` con tiempo máximo. Una respuesta no 2xx se convierte en `HttpError`. */
export async function fetchWithTimeout(
  url: string,
  init: RequestInit = {},
  timeoutMs = 20_000,
  fetchImpl: typeof fetch = fetch
): Promise<Response> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const res = await fetchImpl(url, { ...init, signal: controller.signal });
    if (!res.ok) throw new HttpError(res.status, `HTTP ${res.status} · ${url.split("?")[0]}`);
    return res;
  } finally {
    clearTimeout(timer);
  }
}

export interface RetryOptions {
  /** Reintentos después del primer intento. */
  retries?: number;
  /** Espera antes de cada reintento (se repite la última si hay más reintentos que valores). */
  delaysMs?: readonly number[];
  retryOn?: (err: unknown) => boolean;
  wait?: (ms: number) => Promise<void>;
}

/** Ejecuta `fn` y lo reintenta con espera solo ante errores pasajeros. */
export async function withRetry<T>(fn: (attempt: number) => Promise<T>, opts: RetryOptions = {}): Promise<T> {
  const retries = opts.retries ?? 2;
  const delays = opts.delaysMs ?? [700, 1800];
  const retryOn = opts.retryOn ?? isRetryable;
  const wait = opts.wait ?? sleep;
  for (let attempt = 0; ; attempt++) {
    try {
      return await fn(attempt);
    } catch (err) {
      if (attempt >= retries || !retryOn(err)) throw err;
      await wait(delays[Math.min(attempt, delays.length - 1)] ?? 1000);
    }
  }
}

/**
 * Cortacircuitos por servidor: un servidor que acaba de fallar se aparta durante `cooldownMs` para
 * no volver a esperar su tiempo máximo en la misma sesión. Si todos se están enfriando, el llamador
 * decide si los prueba igualmente (ETL) o falla rápido y usa sus cachés (navegador).
 */
export class EndpointBreaker {
  private readonly failedAt = new Map<string, number>();
  private readonly cooldownMs: number;
  private readonly now: () => number;

  constructor(cooldownMs = 10 * 60_000, now: () => number = () => Date.now()) {
    this.cooldownMs = cooldownMs;
    this.now = now;
  }

  fail(url: string) {
    this.failedAt.set(url, this.now());
  }

  ok(url: string) {
    this.failedAt.delete(url);
  }

  isCooling(url: string): boolean {
    const t = this.failedAt.get(url);
    return t !== undefined && this.now() - t < this.cooldownMs;
  }

  /** Servidores sanos en su orden; con `includeCooling`, después los que fallaron, el más antiguo primero. */
  order(urls: readonly string[], includeCooling = false): string[] {
    const healthy = urls.filter((u) => !this.isCooling(u));
    if (!includeCooling) return healthy;
    const cooling = urls
      .filter((u) => this.isCooling(u))
      .sort((a, b) => (this.failedAt.get(a) ?? 0) - (this.failedAt.get(b) ?? 0));
    return [...healthy, ...cooling];
  }
}

/** El resultado de `p`, o `null` si sigue pendiente pasados `ms`. Nunca rechaza. */
export function settleWithin<T>(p: Promise<T>, ms: number): Promise<PromiseSettledResult<T> | null> {
  return Promise.race([settle(p), sleep(ms).then(() => null)]);
}

export function settle<T>(p: Promise<T>): Promise<PromiseSettledResult<T>> {
  return p.then(
    (value) => ({ status: "fulfilled", value }) as const,
    (reason: unknown) => ({ status: "rejected", reason }) as const
  );
}

/**
 * Dos fuentes en paralelo que se complementan: cuando llega bien la primera, la otra tiene
 * `graceMs` más; si la primera falla, se espera a la otra entera (no hay alternativa). `null` =
 * esa fuente seguía pendiente y puede terminar en segundo plano.
 */
export async function settlePair<A, B>(
  a: Promise<A>,
  b: Promise<B>,
  graceMs: number
): Promise<[PromiseSettledResult<A> | null, PromiseSettledResult<B> | null]> {
  const sa = settle(a);
  const sb = settle(b);
  const first = await Promise.race([sa.then((r) => ({ who: "a" as const, r })), sb.then((r) => ({ who: "b" as const, r }))]);
  if (first.who === "a") {
    const ra = first.r as PromiseSettledResult<A>;
    const rb = ra.status === "fulfilled" ? await Promise.race([sb, sleep(graceMs).then(() => null)]) : await sb;
    return [ra, rb];
  }
  const rb = first.r as PromiseSettledResult<B>;
  const ra = rb.status === "fulfilled" ? await Promise.race([sa, sleep(graceMs).then(() => null)]) : await sa;
  return [ra, rb];
}
