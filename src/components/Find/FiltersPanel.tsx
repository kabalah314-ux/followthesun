import { WALK_OPTIONS, type ExploreFilters } from "../../lib/explore";
import { cn } from "../../utils/cn";
import { Caps, Switch } from "../FindSun/ui";
import { tr } from "../../i18n";

/**
 * Filtros de la hoja: abierto (a la hora elegida), terraza autorizada, wifi, perros, accesible y
 * distancia a pie. Solo se ofrecen los que tienen sentido para la búsqueda en curso, y se explica
 * de dónde sale el dato (OpenStreetMap o la licencia municipal).
 */
export default function FiltersPanel({
  filters,
  onChange,
  venues,
  hasOrigin,
  originLabel,
  onUseLocation,
  timeIsNow,
}: {
  filters: ExploreFilters;
  onChange(patch: Partial<ExploreFilters>): void;
  /** La búsqueda incluye bares y cafés (terraza autorizada y wifi). */
  venues: boolean;
  hasOrigin: boolean;
  /** «desde tu ubicación», «desde Gràcia»… */
  originLabel: string;
  onUseLocation(): void;
  timeIsNow: boolean;
}) {
  const any = filters.open || filters.licensed || filters.wifi || filters.dog || filters.accessible || filters.maxWalk !== null;
  return (
    <section aria-label={tr("filters.filtros")} className="fts-fade-in mb-3 rounded-[20px] border border-line bg-ink/[0.025] p-2">
      <Switch
        checked={filters.open}
        onChange={(v) => onChange({ open: v })}
        label={timeIsNow ? tr("filters.abierto_ahora") : tr("filters.abierto_a_esa_hora")}
        hint={tr("filters.abierto_hint")}
      />
      {venues && (
        <Switch
          checked={filters.licensed}
          onChange={(v) => onChange({ licensed: v })}
          label={tr("filters.terraza_autorizada")}
          hint={tr("filters.terraza_autorizada_hint")}
        />
      )}
      {venues && <Switch checked={filters.wifi} onChange={(v) => onChange({ wifi: v })} label={tr("filters.wifi")} hint={tr("filters.dato_de_osm")} />}
      <Switch checked={filters.dog} onChange={(v) => onChange({ dog: v })} label={tr("filters.perros")} hint={tr("filters.dato_de_osm")} />
      <Switch checked={filters.accessible} onChange={(v) => onChange({ accessible: v })} label={tr("filters.accesible")} hint={tr("filters.accesible_hint")} />

      <div className="px-2 pb-1 pt-2.5">
        <Caps>{tr("filters.distancia_a_pie")}</Caps>
        <div role="radiogroup" aria-label={tr("filters.distancia_a_pie")} className="mt-2 flex flex-wrap gap-1.5">
          {[null, ...WALK_OPTIONS].map((m) => (
            <button
              key={m ?? "any"}
              type="button"
              role="radio"
              aria-checked={filters.maxWalk === m}
              onClick={() => onChange({ maxWalk: m })}
              className={cn(
                "h-11 rounded-full px-3.5 text-[13px] font-semibold outline-none transition-colors focus-visible:ring-2 focus-visible:ring-sun/60",
                filters.maxWalk === m ? "bg-ink text-paper" : "border border-line text-ink hover:bg-ink/[0.05]"
              )}
            >
              {m === null ? tr("filters.sin_limite") : tr("filters.min", { p0: m })}
            </button>
          ))}
        </div>
        <p className="mt-2 text-[12.5px] leading-snug text-ink-soft">
          {originLabel}
          {!hasOrigin && (
            <>
              {" · "}
              <button type="button" onClick={onUseLocation} className="font-semibold text-sun-deep underline-offset-4 hover:underline">
                {tr("nearbyStrip.usar_mi_ubicacion")}
              </button>
            </>
          )}
        </p>
      </div>
      {any && (
        <button
          type="button"
          onClick={() => onChange({ open: false, licensed: false, wifi: false, dog: false, accessible: false, maxWalk: null })}
          className="ml-2 mt-1 inline-flex min-h-[44px] items-center text-[13.5px] font-semibold text-ink-soft underline-offset-4 hover:text-ink hover:underline"
        >
          {tr("filters.quitar_filtros")}
        </button>
      )}
    </section>
  );
}
