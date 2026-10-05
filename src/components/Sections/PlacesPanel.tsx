import { useMemo, useState } from "react";
import { placeService } from "../../services/placeService";
import { PLACE_TYPE_LABEL, PLACE_TYPE_ORDER } from "../../lib/placeTypes";
import type { PlaceInventoryStatus, SunPlace, SunPlaceType } from "../../types";
import { ArrowRightIcon, CloseIcon, PlacesIcon } from "../Navigation/NavIcons";
import { Caps, Chip } from "../FindSun/ui";

interface Props {
  inventory: PlaceInventoryStatus;
  onSelect(place: SunPlace): void;
  onClose(): void;
}

/** Explorador de lugares reales de OpenStreetMap; no presenta categorías sin datos. */
export default function PlacesPanel({ inventory, onSelect, onClose }: Props) {
  const [filter, setFilter] = useState<SunPlaceType | "any">("any");
  const [query, setQuery] = useState("");
  const available = PLACE_TYPE_ORDER.filter((t) => inventory.counts[t] > 0);
  const places = placeService.getPlaces();
  const list = useMemo(() => {
    const q = query.trim().toLocaleLowerCase("ca");
    return (places ?? [])
      .filter((p) => filter === "any" || p.type === filter)
      .filter((p) => !q || p.name.toLocaleLowerCase("ca").includes(q))
      .sort((a, b) => (b.areaM2 ?? 0) - (a.areaM2 ?? 0))
      .slice(0, 80);
  }, [places, filter, query]);

  return (
    <section className="fts-glass fts-context-panel fts-slide-in">
      <div className="fts-section-head">
        <div className="flex min-w-0 items-center gap-2.5">
          <PlacesIcon className="h-[19px] w-[19px] shrink-0 text-sun-deep" />
          <div className="min-w-0">
            <Caps>Descubre Barcelona</Caps>
            <h2 className="mt-1 font-serif text-[23px] leading-none text-ink">Lugares</h2>
          </div>
        </div>
        <button type="button" aria-label="Cerrar" onClick={onClose} className="fts-close-button">
          <CloseIcon className="h-4 w-4" />
        </button>
      </div>

      <p className="mt-3 text-[12px] leading-relaxed text-ink-soft">
        Explora espacios reales. Elige uno para verlo en el mapa y comprobar cuándo recibe luz.
      </p>

      <div className="mt-3.5">
        <label htmlFor="fts-place-search" className="sr-only">Buscar un lugar</label>
        <input
          id="fts-place-search"
          type="search"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Buscar playa, parque, plaza…"
          className="fts-search-input"
        />
      </div>

      <div className="fts-scroll-x mt-3 flex gap-1.5 overflow-x-auto pb-1">
        <Chip active={filter === "any"} onClick={() => setFilter("any")}>Todos</Chip>
        {available.map((t) => (
          <Chip key={t} active={filter === t} onClick={() => setFilter(t)}>
            {PLACE_TYPE_LABEL[t].plural}
          </Chip>
        ))}
      </div>

      <div className="fts-scroll-y mt-2 max-h-[min(45dvh,420px)] overflow-y-auto pr-1">
        {inventory.state === "loading" && (
          <div className="space-y-2 py-2" aria-busy="true">
            {[0, 1, 2].map((i) => <div key={i} className="fts-shimmer h-[54px] rounded-xl" />)}
          </div>
        )}
        {inventory.state === "unavailable" && (
          <div className="py-5">
            <p className="font-serif text-[19px] text-ink">Lugares no disponibles</p>
            <p className="mt-1.5 text-[12px] leading-relaxed text-ink-soft">
              No hemos podido cargar el inventario. Comprueba tu conexión e inténtalo de nuevo.
            </p>
          </div>
        )}
        {inventory.state !== "loading" && inventory.state !== "unavailable" && list.length === 0 && (
          <p className="py-5 text-[12px] leading-relaxed text-ink-soft">
            No hay lugares con ese nombre o categoría en el inventario disponible.
          </p>
        )}
        {inventory.state !== "loading" && list.length > 0 && (
          <ul className="divide-y divide-line">
            {list.map((p) => (
              <li key={p.id}>
                <button type="button" onClick={() => onSelect(p)} className="fts-place-row group">
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-[13px] font-medium text-ink">{p.name}</span>
                    <span className="mt-1 block text-[10px] font-medium uppercase tracking-[0.14em] text-ink-faint">
                      {PLACE_TYPE_LABEL[p.type].singular}
                      {p.areaM2 ? ` · ${p.areaM2 >= 10000 ? `${(p.areaM2 / 10000).toFixed(1).replace(".", ",")} ha` : `${Math.round(p.areaM2)} m²`}` : ""}
                      {p.metadata?.locationApproximate ? " · ubicación aproximada" : ""}
                    </span>
                  </span>
                  <ArrowRightIcon className="h-4 w-4 shrink-0 text-ink-faint transition-transform group-hover:translate-x-0.5" />
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>

      <div className="mt-3 flex items-center justify-between border-t border-line pt-3 text-[10px] text-ink-faint">
        <span>{inventory.total} lugares · © OpenStreetMap</span>
        {inventory.state === "stale" && <span className="text-sun-deep">Datos guardados</span>}
      </div>
    </section>
  );
}