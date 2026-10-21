import { useEffect, useState } from "react";
import type { Comfort } from "../lib/comfort";
import { comfortAt, comfortService } from "../services/comfortService";

/**
 * Confort (al sol, a la sombra, viento y UV) para un instante. Es de escala de ciudad: una serie
 * horaria del modelo para Barcelona, cacheada 60 min. null hasta que hay datos o fuera de la previsión.
 */
export function useComfort(time: number | null): Comfort | null {
  const [ready, setReady] = useState(() => comfortService.hasData());
  useEffect(() => {
    if (ready) return;
    let alive = true;
    void comfortService.load().then((ok) => {
      if (alive && ok) setReady(true);
    });
    return () => {
      alive = false;
    };
  }, [ready]);
  if (!ready || time === null) return null;
  return comfortAt(time);
}
