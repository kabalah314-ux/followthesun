/* Registro de diagnóstico: visible en desarrollo, silenciado en producción. */
const enabled = import.meta.env.DEV;

export const log = {
  debug: (...args: unknown[]): void => {
    if (enabled) console.debug("[I Follow the Sun]", ...args);
  },
  info: (...args: unknown[]): void => {
    if (enabled) console.info("[I Follow the Sun]", ...args);
  },
  warn: (...args: unknown[]): void => {
    if (enabled) console.warn("[I Follow the Sun]", ...args);
  },
};
