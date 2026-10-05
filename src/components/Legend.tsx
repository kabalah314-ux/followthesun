import type { CSSProperties } from "react";
import { cn } from "../utils/cn";

type Kind = "sun" | "partial" | "cloud" | "shade";

const SWATCH_CLASS: Record<Kind, string> = {
  sun: "bg-sun",
  partial: "",
  cloud: "bg-ink/30",
  shade: "bg-shade/70",
};

const PARTIAL_STYLE: CSSProperties = {
  background:
    "linear-gradient(90deg, var(--sun) 50%, color-mix(in srgb, var(--sun) 22%, transparent) 50%)",
};

function Swatch({ kind }: { kind: Kind }) {
  return (
    <i
      className={cn("block h-[7px] w-[7px] shrink-0 rounded-full", SWATCH_CLASS[kind])}
      style={kind === "partial" ? PARTIAL_STYLE : undefined}
    />
  );
}

interface Props {
  showClouds: boolean;
  showShadows: boolean;
  /** Versión de una línea, siempre visible bajo el titular. */
  compact?: boolean;
}

/**
 * Leyenda mínima de luz solar. "Nubes" y "Sombra" son además interruptores de su capa:
 * así no hace falta ningún botón extra en el mapa.
 */
export default function Legend({ showClouds, showShadows, compact = false }: Props) {
  const item = "flex items-center gap-1.5 text-[10px] font-medium tracking-[0.04em] text-ink-soft";
  const state = (on: boolean) => cn(item, !on && "opacity-40");

  return (
    <div role="group" aria-label="Leyenda de luz solar" className="flex flex-col gap-2">
      {!compact && <p className="fts-caps !text-[9px]">En el mapa</p>}
      <div className="flex flex-wrap items-center gap-x-3.5 gap-y-1.5">
        <span className={item}>
          <Swatch kind="sun" />
          Sol
        </span>
        <span className={item}>
          <Swatch kind="partial" />
          Sol a ratos
        </span>
        <span className={state(showClouds)}>
          <Swatch kind="cloud" />
          Nubes
        </span>
        <span className={state(showShadows)}>
          <Swatch kind="shade" />
          Sombra
        </span>
      </div>
    </div>
  );
}
