import { useState } from "react";
import { cn } from "../../utils/cn";
import { Caps } from "../FindSun/ui";
import { CloseIcon } from "../Navigation/NavIcons";
import { LayersIcon } from "./MapIcons";

interface LayerState {
  buildings: boolean;
  shadows: boolean;
  clouds: boolean;
  sunPath: boolean;
}

interface Props extends LayerState {
  onBuildings(v: boolean): void;
  onShadows(v: boolean): void;
  onClouds(v: boolean): void;
  onSunPath(v: boolean): void;
}

function Toggle({
  label,
  detail,
  on,
  onChange,
}: {
  label: string;
  detail: string;
  on: boolean;
  onChange(): void;
}) {
  return (
    <button type="button" role="switch" aria-checked={on} onClick={onChange} className="fts-setting-row">
      <span className="min-w-0 flex-1 text-left">
        <span className="block text-[12px] font-medium text-ink">{label}</span>
        <span className="mt-0.5 block text-[10px] leading-snug text-ink-faint">{detail}</span>
      </span>
      <span className={cn("fts-switch", on && "is-on")} aria-hidden><i /></span>
    </button>
  );
}

/** Un solo control flotante agrupa todas las capas: no hay cuatro interruptores permanentes. */
export default function LayerControl(p: Props) {
  const [open, setOpen] = useState(false);
  return (
    <div className="relative">
      <button
        type="button"
        aria-label="Capas del mapa"
        aria-expanded={open}
        onClick={() => setOpen((v) => !v)}
        className={cn(
          "fts-glass group flex h-11 w-11 items-center justify-center rounded-full transition-all duration-300 hover:scale-[1.04] active:scale-95 sm:h-12 sm:w-12",
          open ? "bg-sun-soft text-sun-deep" : "text-ink"
        )}
      >
        <LayersIcon className="h-[18px] w-[18px]" />
      </button>

      {open && (
        <section className="fts-glass fts-slide-in absolute right-full top-0 z-40 mr-3 w-[min(78vw,264px)] rounded-[21px] p-3.5">
          <div className="flex items-center justify-between">
            <div>
              <Caps>Visibilidad</Caps>
              <p className="mt-1 font-serif text-[18px] leading-none text-ink">Capas del mapa</p>
            </div>
            <button type="button" aria-label="Cerrar capas" onClick={() => setOpen(false)} className="fts-close-button">
              <CloseIcon className="h-3.5 w-3.5" />
            </button>
          </div>
          <div className="mt-2 divide-y divide-line">
            <Toggle label="Edificios" detail="Volúmenes sobre el mapa" on={p.buildings} onChange={() => p.onBuildings(!p.buildings)} />
            <Toggle label="Sombras urbanas" detail="Sombra calculada por edificios" on={p.shadows} onChange={() => p.onShadows(!p.shadows)} />
            <Toggle label="Nubes" detail="Influencia estimada en el sol directo" on={p.clouds} onChange={() => p.onClouds(!p.clouds)} />
            <Toggle label="Trayectoria solar" detail="Recorrido y posición del Sol" on={p.sunPath} onChange={() => p.onSunPath(!p.sunPath)} />
          </div>
        </section>
      )}
    </div>
  );
}