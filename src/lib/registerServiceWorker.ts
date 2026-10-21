/**
 * Service worker de la app instalable (public/sw.js, generado en el build por scripts/pwa/build-sw.ts).
 *
 * Solo en producción y con HTTPS. Una versión nueva se activa sola (sin recargar la página: la
 * siguiente navegación ya la usa). `?sw=off` lo desinstala, para depurar.
 */

const RELOAD_KEY = "fts:preload-reload";

/** Tras un despliegue, un fragmento antiguo puede haber desaparecido: se recarga una vez. */
function reloadOnStaleChunks() {
  window.addEventListener("vite:preloadError", (event) => {
    try {
      const last = Number(window.sessionStorage.getItem(RELOAD_KEY) ?? 0);
      if (Date.now() - last < 30_000) return; // evita bucles si el fallo es otro
      window.sessionStorage.setItem(RELOAD_KEY, String(Date.now()));
    } catch {
      /* sin sessionStorage: se recarga igualmente */
    }
    event.preventDefault();
    window.location.reload();
  });
}

export function registerServiceWorker(): void {
  if (!import.meta.env.PROD || typeof window === "undefined") return;
  reloadOnStaleChunks();
  if (!("serviceWorker" in navigator) || window.location.protocol !== "https:") return;

  if (new URLSearchParams(window.location.search).get("sw") === "off") {
    void navigator.serviceWorker.getRegistrations().then((regs) => regs.forEach((r) => void r.unregister()));
    return;
  }

  const activate = (worker: ServiceWorker | null) => worker?.postMessage({ type: "SKIP_WAITING" });

  window.addEventListener("load", () => {
    navigator.serviceWorker
      .register("/sw.js", { scope: "/", updateViaCache: "none" })
      .then((reg) => {
        if (reg.waiting) activate(reg.waiting);
        reg.addEventListener("updatefound", () => {
          const worker = reg.installing;
          worker?.addEventListener("statechange", () => {
            if (worker.state === "installed" && navigator.serviceWorker.controller) activate(worker);
          });
        });
        // Con la app abierta mucho rato (p. ej. instalada), buscar versión nueva cada hora.
        window.setInterval(() => void reg.update().catch(() => undefined), 60 * 60 * 1000);
      })
      .catch(() => undefined);
  });
}
