import type { BuildingSet } from "../services/buildingService";
import { buildShadowGeometry, shadowSourceKey, type ShadowGeometry, type ShadowSource } from "./shadowGeometry";
import type { ShadowWorkerRequest, ShadowWorkerResponse } from "../workers/shadowGeometry.worker";

/**
 * Cliente del worker de geometría de sombras, con caché por zona.
 *
 *  · Cada zona visible (el `BuildingSet` que extrae el motor al mover el mapa) se convierte en
 *    búferes de GPU en el worker; volver a una zona ya vista reutiliza el resultado (LRU de 3: la memoria del móvil manda).
 *  · Si el navegador no permite workers (o falla), se calcula en el hilo principal en un hueco
 *    libre: más lento, pero el mapa nunca se queda sin sombras.
 */

const CACHE_SIZE = 3;

interface Pending {
  src: ShadowSource;
  resolve(g: ShadowGeometry): void;
  reject(e: Error): void;
}

export function toShadowSource(set: BuildingSet): ShadowSource {
  return {
    count: set.count,
    coords: set.coords,
    offsets: set.offsets,
    heights: set.heights,
    renderHeights: set.renderHeights,
    buckets: set.buckets,
    hide3d: set.hide3d,
  };
}

export class ShadowGeometryClient {
  private worker: Worker | null = null;
  private workerFailed = false;
  private seq = 0;
  private pending = new Map<number, Pending>();
  private cache = new Map<string, ShadowGeometry>();
  private destroyed = false;

  /** Geometría de GPU para un conjunto de edificios (de la caché si ya se calculó). */
  build(set: BuildingSet): Promise<ShadowGeometry> {
    const src = toShadowSource(set);
    const key = shadowSourceKey(src);
    const hit = this.cache.get(key);
    if (hit) {
      // Refresca su posición en la LRU.
      this.cache.delete(key);
      this.cache.set(key, hit);
      return Promise.resolve(hit);
    }
    return this.compute(src).then((g) => {
      this.remember(key, g);
      return g;
    });
  }

  destroy() {
    this.destroyed = true;
    this.worker?.terminate();
    this.worker = null;
    this.pending.forEach((p) => p.reject(new Error("destroyed")));
    this.pending.clear();
    this.cache.clear();
  }

  private remember(key: string, g: ShadowGeometry) {
    this.cache.set(key, g);
    while (this.cache.size > CACHE_SIZE) {
      const oldest = this.cache.keys().next().value;
      if (oldest === undefined) break;
      this.cache.delete(oldest);
    }
  }

  private compute(src: ShadowSource): Promise<ShadowGeometry> {
    const worker = this.ensureWorker();
    if (!worker) return this.computeInline(src);
    const id = ++this.seq;
    return new Promise<ShadowGeometry>((resolve, reject) => {
      this.pending.set(id, { src, resolve, reject });
      try {
        const msg: ShadowWorkerRequest = { id, src };
        worker.postMessage(msg);
      } catch {
        this.pending.delete(id);
        this.disableWorker();
        this.computeInline(src).then(resolve, reject);
      }
    });
  }

  private computeInline(src: ShadowSource): Promise<ShadowGeometry> {
    return new Promise((resolve, reject) => {
      const run = () => {
        if (this.destroyed) return reject(new Error("destroyed"));
        try {
          resolve(buildShadowGeometry(src));
        } catch (e) {
          reject(e instanceof Error ? e : new Error(String(e)));
        }
      };
      const ric = (globalThis as { requestIdleCallback?: (cb: () => void, o?: { timeout: number }) => number })
        .requestIdleCallback;
      if (ric) ric(run, { timeout: 120 });
      else setTimeout(run, 0);
    });
  }

  private ensureWorker(): Worker | null {
    if (this.worker || this.workerFailed || this.destroyed) return this.worker;
    if (typeof Worker === "undefined") {
      this.workerFailed = true;
      return null;
    }
    try {
      const w = new Worker(new URL("../workers/shadowGeometry.worker.ts", import.meta.url), { type: "module" });
      w.onmessage = (e: MessageEvent<ShadowWorkerResponse>) => {
        const msg = e.data;
        const p = this.pending.get(msg.id);
        if (!p) return;
        this.pending.delete(msg.id);
        if (msg.ok) p.resolve(msg.geometry);
        else p.reject(new Error(msg.error));
      };
      w.onerror = (ev) => {
        ev.preventDefault?.();
        // El worker no arrancó (p. ej. compilación en un solo archivo): todo pasa al hilo principal.
        const waiting = [...this.pending.values()];
        this.pending.clear();
        this.disableWorker();
        waiting.forEach((p) => this.computeInline(p.src).then(p.resolve, p.reject));
      };
      this.worker = w;
      return w;
    } catch {
      this.workerFailed = true;
      return null;
    }
  }

  private disableWorker() {
    this.workerFailed = true;
    try {
      this.worker?.terminate();
    } catch {
      /* noop */
    }
    this.worker = null;
  }
}
