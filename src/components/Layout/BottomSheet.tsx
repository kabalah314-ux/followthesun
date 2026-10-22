import { useEffect, useRef, useState, type KeyboardEvent, type PointerEvent, type ReactNode } from "react";
import { useReducedMotion } from "../../hooks/useReducedMotion";
import {
  releaseVelocity,
  rubberBand,
  settleDuration,
  SHEET_LEVELS,
  snapLevel,
  stepLevel,
  type DragSample,
  type SheetHeights,
  type SheetLevel,
} from "../../lib/sheet";
import { cn } from "../../utils/cn";
import { tr } from "../../i18n";

/**
 * Hoja inferior de tres alturas (guía maestra 2): asomada, media y completa.
 *
 *  · Se arrastra por el asa o la cabecera, con inercia (la velocidad del gesto decide el nivel).
 *  · Teclado: el asa es un deslizador (flechas, Inicio, Fin; Intro cambia de nivel).
 *  · Lector de pantalla: anuncia el nivel («Hoja: media»).
 *  · La altura visible se comunica al asentarse: es el relleno inferior de la cámara del mapa, para
 *    que lo elegido quede siempre en la parte visible.
 *  · En «completa» con una ficha abierta puede dejar una ventana transparente al mapa (el 3D del
 *    sitio dentro de la ficha).
 */

export interface WindowRect {
  top: number;
  bottom: number;
  left: number;
  right: number;
}

interface Props {
  label: string;
  level: SheetLevel;
  onLevel(level: SheetLevel): void;
  heights: SheetHeights;
  /** Distancia al borde inferior de la pantalla (barra de navegación con su área segura), px. */
  bottom: number;
  /** Siempre visible arriba (frase-respuesta, título de la ficha): forma parte del asa. */
  header?: ReactNode;
  /** Bajo la cabecera y fuera del desplazamiento (pestañas, filtros). */
  subheader?: ReactNode;
  /** Ventana transparente al mapa bajo la cabecera (solo en «completa»), alto en px. */
  windowHeight?: number;
  onWindowRect?(rect: WindowRect | null): void;
  /** Altura visible al asentarse en un nivel. */
  onSettle?(visible: number): void;
  /** Altura visible durante el arrastre. */
  onMove?(visible: number): void;
  /** Cambia para volver arriba el contenido (otra ficha u otra sección). */
  scrollKey?: string | number;
  /** Encima de la hoja, sobre el mapa, moviéndose con ella (la píldora de la hora). */
  above?: ReactNode;
  children: ReactNode;
}

const LEVEL_KEY = { peek: "sheet.asomada", half: "sheet.media", full: "sheet.completa" } as const;
const INTERACTIVE = "button, a, input, select, textarea, label, [role='tab'], [data-no-drag]";

interface Gesture {
  id: number;
  startY: number;
  startH: number;
  samples: DragSample[];
  moved: boolean;
  onHandle: boolean;
}

export default function BottomSheet(p: Props) {
  const { heights, level } = p;
  const target = heights[level];
  const [drag, setDrag] = useState<number | null>(null);
  const [duration, setDuration] = useState(320);
  const reduced = useReducedMotion();
  const visible = drag ?? target;
  const gesture = useRef<Gesture | null>(null);
  const contentRef = useRef<HTMLDivElement>(null);
  const windowRef = useRef<HTMLDivElement>(null);
  const cb = useRef(p);
  cb.current = p;

  const windowShown = !!p.windowHeight && level === "full" && drag === null;

  useEffect(() => {
    cb.current.onSettle?.(target);
  }, [target]);

  // Ventana al mapa: se mide cuando la hoja termina de moverse.
  useEffect(() => {
    if (!windowShown) {
      cb.current.onWindowRect?.(null);
      return;
    }
    const t = window.setTimeout(() => {
      const el = windowRef.current;
      if (!el) return;
      const r = el.getBoundingClientRect();
      cb.current.onWindowRect?.({ top: r.top, bottom: r.bottom, left: r.left, right: r.right });
    }, (reduced ? 0 : duration) + 40);
    return () => window.clearTimeout(t);
  }, [windowShown, target, p.windowHeight, duration, reduced]);

  useEffect(() => {
    contentRef.current?.scrollTo({ top: 0 });
  }, [p.scrollKey]);

  const goTo = (next: SheetLevel, velocity = 0, from = visible) => {
    setDuration(reduced ? 0 : settleDuration(heights[next] - from, velocity) || 260);
    cb.current.onLevel(next);
  };

  const onPointerDown = (e: PointerEvent<HTMLDivElement>) => {
    if (e.pointerType === "mouse" && e.button !== 0) return;
    const el = e.target as HTMLElement;
    const onHandle = !!el.closest("[data-sheet-handle]");
    if (!onHandle && el.closest(INTERACTIVE)) return;
    gesture.current = { id: e.pointerId, startY: e.clientY, startH: visible, samples: [{ t: e.timeStamp, y: e.clientY }], moved: false, onHandle };
    e.currentTarget.setPointerCapture(e.pointerId);
  };

  const onPointerMove = (e: PointerEvent<HTMLDivElement>) => {
    const g = gesture.current;
    if (!g || g.id !== e.pointerId) return;
    const dy = e.clientY - g.startY;
    if (!g.moved && Math.abs(dy) < 5) return;
    g.moved = true;
    g.samples.push({ t: e.timeStamp, y: e.clientY });
    if (g.samples.length > 10) g.samples.shift();
    const h = rubberBand(g.startH - dy, heights.peek, heights.full);
    setDrag(h);
    cb.current.onMove?.(h);
  };

  const endGesture = (e: PointerEvent<HTMLDivElement>) => {
    const g = gesture.current;
    if (!g || g.id !== e.pointerId) return;
    gesture.current = null;
    if (!g.moved) {
      setDrag(null);
      // Un toque en el asa (o en la cabecera de la hoja asomada) cambia de nivel.
      if (g.onHandle || level === "peek") goTo(level === "peek" ? "half" : level === "half" ? "full" : "half");
      return;
    }
    const last = g.samples[g.samples.length - 1];
    const h = rubberBand(g.startH - (last.y - g.startY), heights.peek, heights.full);
    const v = releaseVelocity(g.samples);
    const next = snapLevel(h, v, level, heights);
    setDrag(null);
    if (next === level) {
      setDuration(reduced ? 0 : settleDuration(heights[next] - h, v) || 220);
      cb.current.onMove?.(heights[next]);
    } else goTo(next, v, h);
  };

  const onKeyDown = (e: KeyboardEvent<HTMLDivElement>) => {
    let next: SheetLevel | null = null;
    if (e.key === "ArrowUp" || e.key === "ArrowRight") next = stepLevel(level, 1);
    else if (e.key === "ArrowDown" || e.key === "ArrowLeft") next = stepLevel(level, -1);
    else if (e.key === "Home") next = "peek";
    else if (e.key === "End") next = "full";
    else if (e.key === "Enter" || e.key === " ") next = level === "full" ? "half" : stepLevel(level, 1);
    if (!next) return;
    e.preventDefault();
    if (next !== level) goTo(next);
  };

  const hidden = Math.max(0, heights.full - visible);
  const levelName = tr(LEVEL_KEY[level]);

  return (
    <section
      aria-label={p.label}
      className="pointer-events-none fixed inset-x-0 z-30"
      style={{
        bottom: p.bottom,
        height: heights.full,
        transform: `translate3d(0, ${hidden}px, 0)`,
        clipPath: `inset(-320px 0 ${hidden}px 0)`,
        transition: drag === null && duration > 0 ? `transform ${duration}ms cubic-bezier(0.22, 1, 0.36, 1), clip-path ${duration}ms cubic-bezier(0.22, 1, 0.36, 1)` : "none",
        willChange: "transform",
      }}
    >
      {p.above && <div className="pointer-events-none absolute inset-x-0 bottom-full mx-auto max-w-[640px] px-3 pb-2.5">{p.above}</div>}
      <div className="mx-auto flex h-full max-w-[640px] flex-col">
        <div
          onPointerDown={onPointerDown}
          onPointerMove={onPointerMove}
          onPointerUp={endGesture}
          onPointerCancel={endGesture}
          className={cn(
            "pointer-events-auto relative shrink-0 touch-none select-none rounded-t-[24px] border border-b-0 border-line bg-glass-strong shadow-[0_-18px_40px_-26px_rgba(66,42,10,0.45)] backdrop-blur-xl",
            level === "peek" && "cursor-pointer"
          )}
        >
          <div
            data-sheet-handle
            role="slider"
            tabIndex={0}
            aria-label={tr("sheet.altura_de_la_hoja")}
            aria-orientation="vertical"
            aria-valuemin={0}
            aria-valuemax={SHEET_LEVELS.length - 1}
            aria-valuenow={SHEET_LEVELS.indexOf(level)}
            aria-valuetext={levelName}
            onKeyDown={onKeyDown}
            className="flex h-7 cursor-grab items-center justify-center rounded-t-[24px] outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-sun/60 active:cursor-grabbing"
          >
            <span className="h-[5px] w-11 rounded-full bg-ink/25" />
          </div>
          {p.header && <div className="px-4 pb-2.5">{p.header}</div>}
          {p.subheader && <div className="pb-2">{p.subheader}</div>}
        </div>

        {windowShown && (
          <div ref={windowRef} aria-hidden className="pointer-events-none relative shrink-0" style={{ height: p.windowHeight }}>
            <div className="absolute inset-0 shadow-[inset_0_0_0_1px_var(--line),inset_0_10px_18px_-14px_rgba(0,0,0,0.35),inset_0_-10px_18px_-14px_rgba(0,0,0,0.35)]" />
          </div>
        )}

        <div
          ref={contentRef}
          className="fts-scroll-y pointer-events-auto min-h-0 flex-1 overflow-y-auto overscroll-contain border-x border-line bg-glass-strong px-4 pt-1 backdrop-blur-xl"
          style={{ paddingBottom: Math.max(0, heights.full - target) + 28 }}
        >
          {p.children}
        </div>
      </div>
    </section>
  );
}
