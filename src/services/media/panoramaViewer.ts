/**
 * Visor 360° ligero para imágenes equirectangulares (Panoramax o Mapillary), sin dependencias:
 * la imagen se amplía para llenar el recuadro y se arrastra en horizontal con inercia; también con
 * las flechas del teclado. Da la vuelta completa sin cortes (fondo repetido en horizontal).
 */
export function mountPanorama(el: HTMLElement, url: string, opts: { label?: string } = {}): () => void {
  const view = document.createElement("div");
  view.setAttribute("role", "img");
  if (opts.label) view.setAttribute("aria-label", opts.label);
  view.tabIndex = 0;
  Object.assign(view.style, {
    width: "100%",
    height: "100%",
    backgroundImage: `url("${url.replace(/"/g, "%22")}")`,
    backgroundRepeat: "repeat-x",
    // Una equirectangular es 2:1; al 180 % de alto se ve algo menos de media vuelta.
    backgroundSize: "auto 180%",
    backgroundPosition: "0px 50%",
    cursor: "grab",
    touchAction: "pan-y",
    outline: "none",
  } satisfies Partial<CSSStyleDeclaration>);
  el.appendChild(view);

  let x = 0;
  let v = 0;
  let dragging = false;
  let lastX = 0;
  let lastT = 0;
  let raf = 0;
  const apply = () => {
    view.style.backgroundPosition = `${Math.round(x)}px 50%`;
  };
  const glide = () => {
    if (Math.abs(v) < 0.02) {
      raf = 0;
      return;
    }
    x += v * 16;
    v *= 0.92;
    apply();
    raf = requestAnimationFrame(glide);
  };
  const onDown = (e: PointerEvent) => {
    dragging = true;
    lastX = e.clientX;
    lastT = e.timeStamp;
    v = 0;
    cancelAnimationFrame(raf);
    view.style.cursor = "grabbing";
    try {
      view.setPointerCapture(e.pointerId);
    } catch {
      /* noop */
    }
  };
  const onMove = (e: PointerEvent) => {
    if (!dragging) return;
    const dx = e.clientX - lastX;
    const dt = Math.max(1, e.timeStamp - lastT);
    x += dx;
    v = dx / dt;
    lastX = e.clientX;
    lastT = e.timeStamp;
    apply();
  };
  const onUp = () => {
    if (!dragging) return;
    dragging = false;
    view.style.cursor = "grab";
    if (Math.abs(v) > 0.05 && !window.matchMedia?.("(prefers-reduced-motion: reduce)").matches) raf = requestAnimationFrame(glide);
  };
  const onKey = (e: KeyboardEvent) => {
    if (e.key === "ArrowLeft") x += 48;
    else if (e.key === "ArrowRight") x -= 48;
    else return;
    e.preventDefault();
    apply();
  };
  view.addEventListener("pointerdown", onDown);
  view.addEventListener("pointermove", onMove);
  view.addEventListener("pointerup", onUp);
  view.addEventListener("pointercancel", onUp);
  view.addEventListener("keydown", onKey);
  return () => {
    cancelAnimationFrame(raf);
    view.removeEventListener("pointerdown", onDown);
    view.removeEventListener("pointermove", onMove);
    view.removeEventListener("pointerup", onUp);
    view.removeEventListener("pointercancel", onUp);
    view.removeEventListener("keydown", onKey);
    view.remove();
  };
}
