import { useEffect, useState } from "react";
import { log } from "../lib/log";

/** Preferencia de interfaz (no sensible) recordada en este navegador. */
export function useStoredFlag(key: string, fallback = false) {
  const [value, setValue] = useState(() => {
    try {
      const raw = window.localStorage.getItem(key);
      return raw === null ? fallback : raw === "1";
    } catch (error) {
      log.warn(`I Follow the Sun: no se pudo leer la preferencia «${key}»`, error);
      return fallback;
    }
  });
  useEffect(() => {
    try {
      window.localStorage.setItem(key, value ? "1" : "0");
    } catch (error) {
      log.warn(`I Follow the Sun: no se pudo guardar la preferencia «${key}»`, error);
    }
  }, [key, value]);
  return [value, setValue] as const;
}
