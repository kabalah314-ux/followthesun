import { Layers, LocateFixed, Minus, Plus } from "../LineIcons";
import type { ReactNode } from "react";
import { cn } from "../../utils/cn";
import { CompassIcon } from "../Icons";
import SunIndicator from "./SunIndicator";

interface Props {
  variant: "desktop" | "mobile";
  onZoomIn(): void;
  onZoomOut(): void;
  onLocate(): void;
  onResetNorth(): void;
  bearing: number;
  pitch: number;
  layersOpen: boolean;
  onToggleLayers(): void;
  layerPanel: ReactNode;
  sun: { azimuthDeg: number; altitudeDeg: number };
  /** El instante elegido es «ahora». */
  isNow: boolean;
  onNow(): void;
  /** Mostrar el dial del sol (solo tiene sentido con la trayectoria activa). */
  showSunDial?: boolean;
}

function Tip({ children }: { children: ReactNode }) {
  return (
    <span
      role="tooltip"
      className="pointer-events-none absolute right-full top-1/2 mr-3 -translate-y-1/2 whitespace-nowrap rounded-full bg-ink px-3 py-1.5 text-[11px] font-medium text-paper opacity-0 shadow-lg transition-opacity duration-200 group-hover:opacity-100 group-focus-visible:opacity-100"
    >
      {children}
    </span>
  );
}

const btn =
  "group relative flex h-11 w-11 items-center justify-center text-ink outline-none transition-colors focus-visible:ring-2 focus-visible:ring-sun/60";
const icon = { size: 18, strokeWidth: 1.5, absoluteStrokeWidth: true } as const;

/**
 * Controles del mapa: pocos y agrupados. Zoom (solo escritorio: en móvil se pellizca), ubicación,
 * capas y el Sol de ahora. La brújula solo aparece si el mapa está girado o inclinado.
 */
export default function MapControls(p: Props) {
  const tilted = Math.abs(p.bearing) > 0.5 || p.pitch > 0.5;

  const compass = tilted && (
    <button
      type="button"
      onClick={p.onResetNorth}
      aria-label="Orientar al norte"
      className="fts-glass fts-pop-in group relative flex h-11 w-11 items-center justify-center rounded-full outline-none focus-visible:ring-2 focus-visible:ring-sun/60"
    >
      <CompassIcon bearing={p.bearing} />
      {p.variant === "desktop" && <Tip>Orientar al norte</Tip>}
    </button>
  );

  // El dial del sol solo aparece cuando la trayectoria está activa (es su brújula visual).
  const sunDial = p.showSunDial ? (
    <button
      type="button"
      onClick={p.onNow}
      aria-label={p.isNow ? "Sol de ahora" : "Volver al sol de ahora"}
      className="group relative rounded-full outline-none transition-transform duration-300 hover:scale-[1.04] focus-visible:ring-2 focus-visible:ring-sun/60 active:scale-95"
    >
      <SunIndicator variant="dial" azimuthDeg={p.sun.azimuthDeg} altitudeDeg={p.sun.altitudeDeg} bearing={p.bearing} />
      {!p.isNow && (
        <span className="absolute -bottom-1.5 left-1/2 -translate-x-1/2 rounded-full bg-ink px-1.5 py-[1px] text-[8.5px] font-semibold uppercase tracking-[0.12em] text-paper">
          Ahora
        </span>
      )}
      {p.variant === "desktop" && <Tip>{p.isNow ? "Sol de ahora" : "Volver a ahora"}</Tip>}
    </button>
  ) : null;

  if (p.variant === "mobile") {
    return (
      <div className="flex flex-col items-end gap-2.5">
        {sunDial}
        {compass}
      </div>
    );
  }

  return (
    <div className="fts-rise flex flex-col items-center gap-2.5" style={{ animationDelay: "500ms" }}>
      {compass}
      <div className="fts-glass flex flex-col overflow-hidden rounded-full">
        <button type="button" aria-label="Acercar" onClick={p.onZoomIn} className={cn(btn, "hover:bg-ink/5")}>
          <Plus {...icon} />
        </button>
        <span className="mx-3 h-px bg-line" />
        <button type="button" aria-label="Alejar" onClick={p.onZoomOut} className={cn(btn, "hover:bg-ink/5")}>
          <Minus {...icon} />
        </button>
      </div>

      <div className="fts-glass flex flex-col overflow-visible rounded-full">
        <button type="button" aria-label="Mi ubicación" onClick={p.onLocate} className={cn(btn, "rounded-t-full hover:bg-ink/5")}>
          <LocateFixed {...icon} />
          <Tip>Mi ubicación</Tip>
        </button>
        <span className="mx-3 h-px bg-line" />
        <div className="relative">
          <button
            type="button"
            data-layers-toggle
            aria-label="Capas del mapa"
            aria-expanded={p.layersOpen}
            onClick={p.onToggleLayers}
            className={cn(btn, "rounded-b-full", p.layersOpen ? "bg-ink/[0.08]" : "hover:bg-ink/5")}
          >
            <Layers {...icon} />
            {!p.layersOpen && <Tip>Capas</Tip>}
          </button>
          {p.layersOpen && <div className="absolute right-full top-1/2 mr-3 -translate-y-1/2">{p.layerPanel}</div>}
        </div>
      </div>

      {sunDial}
    </div>
  );
}
