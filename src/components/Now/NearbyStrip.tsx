import { nearbyLine } from "../../lib/placeAnswer";
import type { NearbyProps } from "./NowPanel";
import NearbyCard from "./NearbyCard";

/**
 * «Cerca de ti ahora» en móvil: una tira horizontal justo encima de la línea de tiempo, para no
 * taparla ni tapar el mapa. Desliza para ver los tres sitios; el último botón abre Buscar.
 */
export default function NearbyStrip(p: NearbyProps) {
  return (
    <section aria-label={p.title} className="pointer-events-auto">
      <div className="mb-1.5 flex items-center justify-between px-1">
        <span className="fts-glass rounded-full px-3 py-1 text-[12.5px] font-semibold text-ink">{p.title}</span>
        {!p.hasLocation && (
          <button
            type="button"
            onClick={p.onUseLocation}
            disabled={p.locating}
            className="fts-glass flex h-9 items-center rounded-full px-3 text-[12.5px] font-semibold text-ink disabled:opacity-60"
          >
            Usar mi ubicación
          </button>
        )}
      </div>
      <div className="fts-scroll-x -mx-2 flex snap-x gap-2 overflow-x-auto px-2 pb-1">
        {p.loading &&
          [0, 1, 2].map((i) => <div key={i} className="fts-glass h-[86px] w-[236px] shrink-0 animate-pulse rounded-2xl" />)}
        {!p.loading &&
          p.results.map((r) => (
            <div key={r.placeId} className="fts-glass w-[236px] shrink-0 snap-start rounded-2xl">
              <NearbyCard
                result={r}
                active={p.activeId === r.placeId}
                line={nearbyLine(r, p.now, p.mode, { sunset: p.sunset })}
                onPick={p.onPick}
                showWalk={p.hasLocation}
                className="border-transparent bg-transparent"
              />
            </div>
          ))}
        {!p.loading && p.results.length === 0 && (
          <p className="fts-glass shrink-0 rounded-2xl px-3.5 py-3 text-[13.5px] text-ink-soft">{p.emptyText}</p>
        )}
        <button
          type="button"
          onClick={p.onMore}
          className="fts-glass flex w-[120px] shrink-0 snap-start items-center justify-center rounded-2xl px-3 text-center text-[13.5px] font-semibold text-ink"
        >
          Más sitios →
        </button>
      </div>
    </section>
  );
}
