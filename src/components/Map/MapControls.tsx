import type { ReactNode } from "react";
import { cn } from "../../utils/cn";
import { CompassIcon, LocateIcon, MinusIcon, PlusIcon } from "../Icons";
import LayerControl from "./LayerControl";

interface Props {
  onZoomIn(): void;
  onZoomOut(): void;
  onLocate(): void;
  onResetNorth(): void;
  bearing: number;
  pitch: number;
  showBuildings: boolean;
  onToggleBuildings(): void;
  showShadows: boolean;
  onToggleShadows(): void;
  showClouds: boolean;
  onToggleClouds(): void;
  showSunPath: boolean;
  onToggleSunPath(): void;
}

function Tip({ children }: { children: ReactNode }) {
  return (
    <span className="pointer-events-none absolute right-full mr-3 hidden whitespace-nowrap rounded-full bg-ink px-3 py-1.5 text-[9.5px] font-semibold uppercase tracking-[0.2em] text-paper opacity-0 transition-opacity duration-300 group-hover:opacity-100 sm:block">
      {children}
    </span>
  );
}

function RoundButton({
  label,
  active,
  onClick,
  children,
}: {
  label: string;
  active?: boolean;
  onClick(): void;
  children: ReactNode;
}) {
  return (
    <button
      type="button"
      aria-label={label}
      aria-pressed={active}
      onClick={onClick}
      className={cn(
        "fts-glass group relative flex h-11 w-11 items-center justify-center rounded-full transition-all duration-300 hover:scale-[1.06] active:scale-95 sm:h-12 sm:w-12",
        active ? "bg-sun-soft text-sun-deep ring-1 ring-sun/50" : "text-ink"
      )}
    >
      {children}
      <Tip>{label}</Tip>
    </button>
  );
}

export default function MapControls(p: Props) {
  // La brújula solo aparece cuando el mapa está rotado o inclinado.
  const tilted = Math.abs(p.bearing) > 0.5 || p.pitch > 0.5;

  return (
    <div className="fts-rise flex flex-col items-center gap-2.5" style={{ animationDelay: "800ms" }}>
      <div
        className={cn(
          "transition-all duration-500 ease-out",
          tilted ? "max-h-14 scale-100 opacity-100" : "pointer-events-none -mb-2.5 max-h-0 scale-75 opacity-0"
        )}
        inert={!tilted}
      >
        <RoundButton label="Orientar al norte" onClick={p.onResetNorth}>
          <CompassIcon bearing={p.bearing} />
        </RoundButton>
      </div>

      <div className="fts-glass hidden flex-col overflow-hidden rounded-full sm:flex">
        <button
          type="button"
          aria-label="Acercar"
          onClick={p.onZoomIn}
          className="flex h-12 w-12 items-center justify-center text-ink transition-colors hover:bg-ink/5 active:bg-ink/10"
        >
          <PlusIcon />
        </button>
        <span className="mx-3 h-px bg-line" />
        <button
          type="button"
          aria-label="Alejar"
          onClick={p.onZoomOut}
          className="flex h-12 w-12 items-center justify-center text-ink transition-colors hover:bg-ink/5 active:bg-ink/10"
        >
          <MinusIcon />
        </button>
      </div>

      <RoundButton label="Mi ubicación" onClick={p.onLocate}>
        <LocateIcon />
      </RoundButton>
      <LayerControl
        buildings={p.showBuildings}
        shadows={p.showShadows}
        clouds={p.showClouds}
        sunPath={p.showSunPath}
        onBuildings={p.onToggleBuildings}
        onShadows={p.onToggleShadows}
        onClouds={p.onToggleClouds}
        onSunPath={p.onToggleSunPath}
      />
    </div>
  );
}
