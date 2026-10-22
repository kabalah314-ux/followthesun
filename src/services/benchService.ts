import { unpackBenches, type BenchFile } from "../lib/benches";
import type { SunPlace } from "../types";

/** Bancos precalculados (public/data/benches.json): se descargan solo al buscarlos y una vez por sesión. */
let promise: Promise<SunPlace[]> | null = null;

export function loadBenches(): Promise<SunPlace[]> {
  if (!promise) {
    promise = fetch("/data/benches.json")
      .then((r) => {
        if (!r.ok) throw new Error(`benches.json HTTP ${r.status}`);
        return r.json() as Promise<BenchFile>;
      })
      .then((f) => (Array.isArray(f.items) ? unpackBenches(f.items) : []))
      .catch((e) => {
        promise = null;
        throw e;
      });
  }
  return promise;
}
