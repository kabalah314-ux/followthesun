import { useCallback, useRef, useState } from "react";
import type {
  SearchProgress,
  SearchStatus,
  SunSearchOptions,
  SunSearchOutcome,
  SunSearchRequest,
} from "../types";

export interface SunSearchState {
  status: SearchStatus;
  request: SunSearchRequest | null;
  outcome: SunSearchOutcome | null;
  progress: SearchProgress | null;
  /** Fallo inesperado (nunca se muestra el error técnico). */
  failed: boolean;
}

const IDLE: SunSearchState = { status: "idle", request: null, outcome: null, progress: null, failed: false };

export interface SunSearchApi {
  state: SunSearchState;
  run(request: SunSearchRequest, options?: SunSearchOptions): Promise<SunSearchOutcome | null>;
  cancel(): void;
  reset(): void;
}

/**
 * Estado de la búsqueda: idle → searching → results · no_results · partial_data ·
 * weather_unavailable · places_unavailable. Cada búsqueda cancela la anterior y solo la última
 * puede actualizar la interfaz.
 */
export function useSunSearch(): SunSearchApi {
  const [state, setState] = useState<SunSearchState>(IDLE);
  const runId = useRef(0);
  const controller = useRef<AbortController | null>(null);

  const run = useCallback(async (request: SunSearchRequest, options?: SunSearchOptions) => {
    controller.current?.abort();
    const ctrl = new AbortController();
    controller.current = ctrl;
    const id = ++runId.current;
    setState({
      status: "searching",
      request,
      outcome: null,
      progress: { phase: "places", done: 0, total: 1 },
      failed: false,
    });
    try {
      // El motor de búsqueda (edificios, nubes, lugares) se descarga aquí, no al abrir la app.
      const { findBestSunPlaces } = await import("../services/sunSearchService");
      const outcome = await findBestSunPlaces(request, {
        ...options,
        signal: ctrl.signal,
        onProgress: (progress: SearchProgress) => {
          if (runId.current !== id) return;
          setState((s) => (s.status === "searching" ? { ...s, progress } : s));
        },
      });
      if (runId.current !== id) return null;
      setState({ status: outcome.status, request, outcome, progress: null, failed: false });
      return outcome;
    } catch (e) {
      if (runId.current !== id) return null;
      if (e instanceof DOMException && e.name === "AbortError") return null;
      setState({ status: "no_results", request, outcome: null, progress: null, failed: true });
      return null;
    }
  }, []);

  const reset = useCallback(() => {
    runId.current++;
    controller.current?.abort();
    setState(IDLE);
  }, []);

  return { state, run, cancel: reset, reset };
}
