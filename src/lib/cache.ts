/**
 * Caché con TTL, memoria + persistencia opcional en localStorage.
 *
 * Distingue tres situaciones para un mismo dato:
 *  · fresco   (edad ≤ ttl)        → se usa sin pedir nada
 *  · caducado (ttl < edad ≤ stale) → solo como respaldo si la red falla ("stale-while-error")
 *  · expirado (edad > stale)       → se descarta
 */

export interface CacheHit<T> {
  value: T;
  storedAt: number;
  ageMs: number;
  fresh: boolean;
}

interface Stored<T> {
  v: number;
  t: number;
  d: T;
}

export interface TtlCacheOptions {
  namespace: string;
  ttlMs: number;
  /** Edad máxima a partir de la cual el dato se descarta. Por defecto 4 × ttl. */
  maxStaleMs?: number;
  /** Cambiar para invalidar todo lo guardado con un formato anterior. */
  version?: number;
  persist?: boolean;
}

export class TtlCache<T> {
  private readonly mem = new Map<string, Stored<T>>();
  private readonly ns: string;
  private readonly ttlMs: number;
  private readonly maxStaleMs: number;
  private readonly version: number;
  private readonly persist: boolean;

  constructor(opts: TtlCacheOptions) {
    this.ns = opts.namespace;
    this.ttlMs = opts.ttlMs;
    this.maxStaleMs = opts.maxStaleMs ?? opts.ttlMs * 4;
    this.version = opts.version ?? 1;
    this.persist = opts.persist ?? false;
  }

  private fullKey(key: string) {
    return `${this.ns}:v${this.version}:${key}`;
  }

  private storage(): Storage | null {
    if (!this.persist) return null;
    try {
      return window.localStorage;
    } catch {
      return null;
    }
  }

  private read(key: string): Stored<T> | null {
    const k = this.fullKey(key);
    const cached = this.mem.get(k);
    if (cached) return cached;
    const s = this.storage();
    if (!s) return null;
    try {
      const raw = s.getItem(k);
      if (!raw) return null;
      const parsed = JSON.parse(raw) as Stored<T> | null;
      if (!parsed || parsed.v !== this.version || typeof parsed.t !== "number") return null;
      this.mem.set(k, parsed);
      return parsed;
    } catch {
      return null;
    }
  }

  /** Devuelve el dato si no ha expirado (fresco o caducado) indicando cuál de los dos es. */
  peek(key: string, now: number = Date.now()): CacheHit<T> | null {
    const entry = this.read(key);
    if (!entry) return null;
    const ageMs = Math.max(0, now - entry.t);
    if (ageMs > this.maxStaleMs) {
      this.delete(key);
      return null;
    }
    return { value: entry.d, storedAt: entry.t, ageMs, fresh: ageMs <= this.ttlMs };
  }

  /** Solo datos frescos. */
  get(key: string, now?: number): CacheHit<T> | null {
    const hit = this.peek(key, now);
    return hit && hit.fresh ? hit : null;
  }

  /** Datos frescos o caducados (respaldo cuando la red falla). */
  getAllowStale(key: string, now?: number): CacheHit<T> | null {
    return this.peek(key, now);
  }

  set(key: string, value: T, now: number = Date.now()) {
    const k = this.fullKey(key);
    const entry: Stored<T> = { v: this.version, t: now, d: value };
    this.mem.set(k, entry);
    const s = this.storage();
    if (!s) return;
    try {
      s.setItem(k, JSON.stringify(entry));
    } catch {
      // Cuota llena u otro error: la caché en memoria sigue funcionando.
    }
  }

  delete(key: string) {
    const k = this.fullKey(key);
    this.mem.delete(k);
    try {
      this.storage()?.removeItem(k);
    } catch {
      /* noop */
    }
  }

  clear() {
    this.mem.clear();
    const s = this.storage();
    if (!s) return;
    try {
      const prefix = `${this.ns}:`;
      const doomed: string[] = [];
      for (let i = 0; i < s.length; i++) {
        const k = s.key(i);
        if (k && k.startsWith(prefix)) doomed.push(k);
      }
      doomed.forEach((k) => s.removeItem(k));
    } catch {
      /* noop */
    }
  }
}
