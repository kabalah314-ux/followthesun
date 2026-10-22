import { useEffect, useState } from "react";

export interface Viewport {
  width: number;
  height: number;
  /** Áreas seguras (muesca, barra de inicio) en px. */
  safeTop: number;
  safeBottom: number;
}

function measure(): Viewport {
  if (typeof window === "undefined") return { width: 390, height: 844, safeTop: 0, safeBottom: 0 };
  const probe = document.createElement("div");
  probe.style.cssText =
    "position:fixed;visibility:hidden;pointer-events:none;padding-top:env(safe-area-inset-top);padding-bottom:env(safe-area-inset-bottom)";
  document.body.appendChild(probe);
  const cs = getComputedStyle(probe);
  const safeTop = parseFloat(cs.paddingTop) || 0;
  const safeBottom = parseFloat(cs.paddingBottom) || 0;
  probe.remove();
  const vv = window.visualViewport;
  return {
    width: window.innerWidth,
    // Con el teclado abierto no se recalcula la hoja (se usa la altura de la ventana).
    height: Math.round(Math.max(window.innerHeight, vv ? vv.height : 0)),
    safeTop,
    safeBottom,
  };
}

/** Tamaño de la pantalla y áreas seguras, actualizados al girar o redimensionar. */
export function useViewport(): Viewport {
  const [vp, setVp] = useState<Viewport>(() => measure());
  useEffect(() => {
    let raf = 0;
    const onResize = () => {
      cancelAnimationFrame(raf);
      raf = requestAnimationFrame(() => setVp(measure()));
    };
    window.addEventListener("resize", onResize);
    window.addEventListener("orientationchange", onResize);
    return () => {
      cancelAnimationFrame(raf);
      window.removeEventListener("resize", onResize);
      window.removeEventListener("orientationchange", onResize);
    };
  }, []);
  return vp;
}
