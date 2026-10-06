import { useEffect, useRef, useState, type CSSProperties, type PointerEvent, type ReactNode } from "react";
import { cn } from "../../utils/cn";
import type { Device } from "./layout";

/**
 * Panel contextual — el patrón común de Follow the Sun: barra de navegación + mapa + panel.
 *
 *   escritorio / tableta  panel flotante translúcido (izquierda: la vista; derecha: el detalle)
 *   móvil                 hoja inferior sobre el mapa, con asa: se arrastra para plegarla
 *                         (el mapa queda libre) o desplegarla; plegada, un tirón más la cierra.
 */

interface Props {
  device: Device;
  side: "left" | "right";
  /** Posición en escritorio/tableta (left/right/top/bottom). */
  style?: CSSProperties;
  width?: number;
  label: string;
  /** Distancia al borde inferior en móvil (altura de la barra de navegación). */
  mobileBottom?: number;
  /** Arrastrar hacia abajo una hoja ya plegada la cierra. */
  onDismiss?(): void;
  /** Cambia para volver a desplegar la hoja (p. ej. al cambiar de contenido). */
  resetKey?: string | number;
  children: ReactNode;
}

const PEEK_PX = 148;

export default function ContextPanel({
  device,
  side,
  style,
  width,
  label,
  mobileBottom = 0,
  onDismiss,
  resetKey,
  children,
}: Props) {
  const [collapsed, setCollapsed] = useState(false);
  const [drag, setDrag] = useState(0);
  const start = useRef<number | null>(null);

  useEffect(() => {
    setCollapsed(false);
  }, [resetKey]);

  if (device !== "mobile") {
    return (
      <aside
        aria-label={label}
        className={cn(
          "fts-glass fts-scroll-y pointer-events-auto absolute z-20 overflow-y-auto overscroll-contain rounded-[26px] p-4 sm:p-5",
          side === "left" ? "fts-panel-left" : "fts-panel-right"
        )}
        style={{ ...style, width }}
      >
        {children}
      </aside>
    );
  }

  const onDown = (e: PointerEvent<HTMLDivElement>) => {
    e.currentTarget.setPointerCapture(e.pointerId);
    start.current = e.clientY;
  };
  const onMove = (e: PointerEvent<HTMLDivElement>) => {
    if (start.current === null) return;
    setDrag(Math.max(-120, Math.min(260, e.clientY - start.current)));
  };
  const onUp = () => {
    if (start.current === null) return;
    start.current = null;
    if (drag > 60) {
      if (collapsed && onDismiss) onDismiss();
      else setCollapsed(true);
    } else if (drag < -40) {
      setCollapsed(false);
    } else if (Math.abs(drag) < 6) {
      setCollapsed((c) => !c);
    }
    setDrag(0);
  };

  return (
    <section
      aria-label={label}
      className="fts-glass fts-sheet-in pointer-events-auto fixed inset-x-2 z-30 flex flex-col rounded-[24px]"
      style={{
        bottom: `calc(${mobileBottom}px + env(safe-area-inset-bottom) + 8px)`,
        maxHeight: collapsed ? PEEK_PX : "calc(100dvh - 140px)",
        transform: drag ? `translateY(${Math.max(drag, -40)}px)` : undefined,
        transition: start.current === null ? "max-height 320ms cubic-bezier(0.22,1,0.36,1), transform 260ms ease" : "none",
      }}
    >
      <div
        role="button"
        tabIndex={0}
        aria-label={collapsed ? "Desplegar panel" : "Plegar panel"}
        aria-expanded={!collapsed}
        onPointerDown={onDown}
        onPointerMove={onMove}
        onPointerUp={onUp}
        onPointerCancel={onUp}
        onKeyDown={(e) => {
          if (e.key === "Enter" || e.key === " ") {
            e.preventDefault();
            setCollapsed((c) => !c);
          }
        }}
        className="flex h-6 shrink-0 cursor-grab touch-none items-center justify-center outline-none focus-visible:ring-2 focus-visible:ring-sun/60"
      >
        <span className="h-[4px] w-10 rounded-full bg-ink/20" />
      </div>
      <div
        className={cn(
          "fts-scroll-y min-h-0 flex-1 overscroll-contain px-4 pb-4",
          collapsed ? "overflow-hidden" : "overflow-y-auto"
        )}
      >
        {children}
      </div>
    </section>
  );
}

/** Cabecera estándar de un panel: título, subtítulo y cerrar. */
export function PanelHeader({
  title,
  subtitle,
  onClose,
  onBack,
}: {
  title: string;
  subtitle?: string;
  onClose?(): void;
  onBack?(): void;
}) {
  return (
    <div className="mb-4 flex items-start justify-between gap-3">
      <div className="flex min-w-0 items-start gap-2">
        {onBack && (
          <button
            type="button"
            onClick={onBack}
            aria-label="Atrás"
            className="-ml-1.5 mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-ink-soft transition-colors hover:bg-ink/5 hover:text-ink"
          >
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
              <path d="M15 18l-6-6 6-6" />
            </svg>
          </button>
        )}
        <div className="min-w-0">
          <h2 className="font-serif text-[25px] leading-none text-ink">{title}</h2>
          {subtitle && <p className="mt-1.5 text-[12px] text-ink-soft">{subtitle}</p>}
        </div>
      </div>
      {onClose && (
        <button
          type="button"
          onClick={onClose}
          aria-label="Cerrar"
          className="-mr-1.5 -mt-1 flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-ink-soft transition-colors hover:bg-ink/5 hover:text-ink"
        >
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" aria-hidden>
            <path d="M6 6l12 12M18 6L6 18" />
          </svg>
        </button>
      )}
    </div>
  );
}

/** Raíz de la app: el mapa persistente al fondo y, encima, navegación y paneles. */
export function AppShell({ map, children }: { map: ReactNode; children: ReactNode }) {
  return (
    <div className="relative h-dvh w-screen overflow-hidden bg-paper text-ink">
      {map}
      {children}
    </div>
  );
}
