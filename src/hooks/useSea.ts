import { useEffect, useState } from "react";
import { seaService, type SeaSample } from "../services/seaService";

/** El mar en un instante; null mientras carga, sin red o fuera de la previsión. `enabled` evita pedirlo si no hace falta. */
export function useSea(time: number | null, enabled = true): SeaSample | null {
  const [ready, setReady] = useState(() => seaService.hasData());
  useEffect(() => {
    if (!enabled || ready) return;
    let alive = true;
    void seaService.load().then((ok) => {
      if (alive && ok) setReady(true);
    });
    return () => {
      alive = false;
    };
  }, [enabled, ready]);
  if (!enabled || !ready || time === null) return null;
  return seaService.sampleAt(time);
}
