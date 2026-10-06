/**
 * Tareas en segundo plano: se ejecutan cuando el navegador está desocupado (o como muy tarde tras
 * `timeout` ms). Así la carga inicial no compite con la meteorología, los lugares ni el mapa.
 */

export function onIdle(fn: () => void, timeout = 2500): () => void {
  const w = window as unknown as {
    requestIdleCallback?: (cb: () => void, opts?: { timeout: number }) => number;
    cancelIdleCallback?: (handle: number) => void;
  };
  if (typeof w.requestIdleCallback === "function") {
    const handle = w.requestIdleCallback(fn, { timeout });
    return () => w.cancelIdleCallback?.(handle);
  }
  const t = window.setTimeout(fn, 250);
  return () => window.clearTimeout(t);
}

/** `true` si la conexión es lenta o el usuario ha pedido ahorrar datos. */
export function prefersReducedData(): boolean {
  const nav = navigator as Navigator & { connection?: { saveData?: boolean; effectiveType?: string } };
  return !!nav.connection && (nav.connection.saveData === true || nav.connection.effectiveType === "2g");
}
