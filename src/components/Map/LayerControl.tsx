import { useEffect, useRef, type CSSProperties, type ReactNode } from "react";
import { SUN_RAMP_CSS } from "../../engine/layers/SolarHeatmap";
import type { Preferences } from "../../lib/preferences";
import { Caps, Switch } from "../FindSun/ui";

type LayerKey =
  | "satelliteView"
  | "showBuildings"
  | "buildings3D"
  | "showShadows"
  | "showClouds"
  | "showSunPath";

const dot = (cls: string, style?: CSSProperties) => (
  <i className={`block h-[9px] w-[9px] rounded-full ${cls}`} style={style} />
);

const SatelliteIcon = () => (
  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" className="text-ink-soft" aria-hidden>
    <rect x="3.5" y="5" width="17" height="14" rx="2" />
    <circle cx="9" cy="10" r="1.6" />
    <path d="M4.5 17l4.5-4.5 3.5 3.5 3-2.5 4 3.5" />
  </svg>
);

const CubeIcon = () => (
  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinejoin="round" className="text-ink-soft" aria-hidden>
    <path d="M12 3l8 4.5v9L12 21l-8-4.5v-9L12 3z" />
    <path d="M4 7.5l8 4.5 8-4.5M12 12v9" />
  </svg>
);

const LAYERS: Array<{ key: LayerKey; label: string; hint: string; swatch: ReactNode }> = [
  {
    key: "satelliteView",
    label: "Vista satélite",
    hint: "Imagen real de Barcelona, con calles y sombras encima",
    swatch: <SatelliteIcon />,
  },
  { key: "showBuildings", label: "Edificios", hint: "Huellas de los edificios", swatch: dot("border border-ink/30 bg-ink/10") },
  { key: "buildings3D", label: "Relieve 3D", hint: "Al acercarte, los edificios con su altura real", swatch: <CubeIcon /> },
  { key: "showShadows", label: "Sombra urbana", hint: "Sombra de los edificios, calle a calle", swatch: dot("bg-shade/80") },
  { key: "showClouds", label: "Nubes", hint: "Lo que las nubes tapan al sol (escala de barrio)", swatch: dot("bg-ink/30") },
  {
    key: "showSunPath",
    label: "Trayectoria del sol",
    hint: "El recorrido del sol hoy",
    swatch: (
      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" aria-hidden>
        <path d="M4 18a8 8 0 0 1 16 0" stroke="var(--sun-deep)" strokeWidth="2" strokeDasharray="2 3" strokeLinecap="round" />
      </svg>
    ),
  },
];

/** Leyenda de la luz: escala de intensidad del sol + nubes + sombra. */
export function SunLegend() {
  return (
    <div>
      <div className="h-[10px] w-full rounded-full ring-1 ring-ink/10" style={{ background: SUN_RAMP_CSS }} />
      <div className="mt-1.5 flex justify-between text-[10px] text-ink-soft">
        <span>Sol débil</span>
        <span>Sol fuerte</span>
      </div>
      <div className="mt-2 flex flex-wrap gap-x-3.5 gap-y-1.5 text-[10.5px] text-ink-soft">
        <span className="flex items-center gap-1.5">{dot("", { background: "#cfd6e2" })}Nubes</span>
        <span className="flex items-center gap-1.5">{dot("", { background: "#3b4377" })}Sombra</span>
      </div>
    </div>
  );
}

interface Props {
  prefs: Preferences;
  onChange(patch: Partial<Preferences>): void;
  onClose(): void;
}

/**
 * Capas del mapa: solo aparecen cuando se piden. Incluye la leyenda de la luz, para que nadie tenga
 * que adivinar qué significa cada tono.
 */
export default function LayerControl({ prefs, onChange, onClose }: Props) {
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const onDown = (e: PointerEvent) => {
      const target = e.target as HTMLElement;
      if (ref.current?.contains(target) || target.closest("[data-layers-toggle]")) return;
      onClose();
    };
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("pointerdown", onDown);
    window.addEventListener("keydown", onKey);
    return () => {
      window.removeEventListener("pointerdown", onDown);
      window.removeEventListener("keydown", onKey);
    };
  }, [onClose]);

  return (
    <div ref={ref} role="dialog" aria-label="Capas del mapa" className="fts-glass fts-pop-in w-[280px] rounded-[22px] p-3">
      <Caps className="px-2 pb-1 pt-1">Mapa</Caps>
      {LAYERS.map((l) => {
        const disabled = l.key === "buildings3D" && !prefs.showBuildings;
        return (
          <div key={l.key} className={disabled ? "pointer-events-none opacity-40" : undefined}>
            <Switch
              checked={prefs[l.key]}
              onChange={(v) => onChange({ [l.key]: v } as Partial<Preferences>)}
              label={l.label}
              hint={l.hint}
              swatch={l.swatch}
            />
          </div>
        );
      })}
      <div className="mx-2 mt-2 border-t border-line pt-2.5">
        <Caps className="mb-2">Luz del sol</Caps>
        <SunLegend />
      </div>
    </div>
  );
}
