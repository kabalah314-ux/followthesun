import {
  buildShadowGeometry,
  shadowGeometryTransferables,
  type ShadowSource,
} from "../graphics/shadowGeometry";

/**
 * Worker de geometría de sombras: triangula las huellas y prepara los búferes de la GPU fuera del
 * hilo principal (miles de edificios por zona). Devuelve los búferes transferidos, sin copia.
 */

export interface ShadowWorkerRequest {
  id: number;
  src: ShadowSource;
  origin?: { ox: number; oy: number };
}

export type ShadowWorkerResponse =
  | { id: number; ok: true; geometry: ReturnType<typeof buildShadowGeometry> }
  | { id: number; ok: false; error: string };

interface WorkerScope {
  onmessage: ((e: MessageEvent<ShadowWorkerRequest>) => void) | null;
  postMessage(message: ShadowWorkerResponse, transfer?: Transferable[]): void;
}

const scope = self as unknown as WorkerScope;

scope.onmessage = (e) => {
  const { id, src, origin } = e.data;
  try {
    const geometry = buildShadowGeometry(src, origin);
    scope.postMessage({ id, ok: true, geometry }, shadowGeometryTransferables(geometry));
  } catch (err) {
    scope.postMessage({ id, ok: false, error: err instanceof Error ? err.message : String(err) });
  }
};
