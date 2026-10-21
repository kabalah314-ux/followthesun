import type { ReactNode } from "react";
import { nearbyLine } from "../../lib/placeAnswer";
import type { SunShadeMode } from "../../lib/answer";
import type { SunSearchResult } from "../../types";
import { Caps } from "../FindSun/ui";
import NearbyCard from "./NearbyCard";
import { tr } from "../../i18n";

export interface NearbyProps {
  title: string;
  results: SunSearchResult[];
  loading: boolean;
  /** Mensaje cuando la búsqueda termina sin sitios. */
  emptyText: string;
  mode: SunShadeMode;
  now: number;
  sunset?: number;
  hasLocation: boolean;
  locating?: boolean;
  activeId: string | null;
  onUseLocation(): void;
  onPick(r: SunSearchResult): void;
  onMore(): void;
}

/**
 * «Ahora» en escritorio y tableta: la respuesta arriba y, debajo, los tres mejores sitios para la
 * próxima hora (sol o sombra según el modo), cerca de ti o, sin ubicación, cerca del centro.
 */
export default function NowPanel({ answerCard, ...p }: NearbyProps & { answerCard: ReactNode }) {
  return (
    <div>
      {answerCard}
      <div className="mt-5">
        <div className="flex min-h-[44px] items-center justify-between gap-3">
          <Caps>{p.title}</Caps>
          {!p.hasLocation && (
            <button
              type="button"
              onClick={p.onUseLocation}
              disabled={p.locating}
              className="rounded-full px-2 py-2 text-[13.5px] font-semibold text-ink underline-offset-4 outline-none hover:underline focus-visible:ring-2 focus-visible:ring-sun/60 disabled:opacity-60"
            >
              {tr("nearbyStrip.usar_mi_ubicacion")}
            </button>
          )}
        </div>
        <div className="mt-1 space-y-2">
          {p.loading &&
            [0, 1, 2].map((i) => <div key={i} className="h-[76px] animate-pulse rounded-2xl bg-ink/[0.05]" />)}
          {!p.loading &&
            p.results.map((r) => (
              <NearbyCard
                key={r.placeId}
                result={r}
                active={p.activeId === r.placeId}
                line={nearbyLine(r, p.now, p.mode, { sunset: p.sunset })}
                onPick={p.onPick}
                showWalk={p.hasLocation}
              />
            ))}
          {!p.loading && p.results.length === 0 && <p className="py-2 text-[14px] text-ink-soft">{p.emptyText}</p>}
        </div>
        <button
          type="button"
          onClick={p.onMore}
          className="mt-3 inline-flex min-h-[44px] items-center text-[14px] font-semibold text-ink outline-none hover:underline focus-visible:ring-2 focus-visible:ring-sun/60"
        >
          {tr("nowPanel.mas_sitios_y_otras_horas")}
        </button>
      </div>
    </div>
  );
}
