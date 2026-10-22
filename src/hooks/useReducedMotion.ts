import { useMediaQuery } from "./useMediaQuery";

/** La persona pidió menos movimiento: sin vuelos de cámara ni animaciones largas. */
export function useReducedMotion(): boolean {
  return useMediaQuery("(prefers-reduced-motion: reduce)");
}
