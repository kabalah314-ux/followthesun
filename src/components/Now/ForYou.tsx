import type { ReactNode } from "react";
import type { SunShadeMode } from "../../lib/answer";
import type { SunSearchResult } from "../../types";
import { cn } from "../../utils/cn";
import { Caps } from "../FindSun/ui";
import ForYouCard from "./ForYouCard";
import { tr } from "../../i18n";

export interface ForYouProps {
  title: string;
  /** «Hoy 17:30–19:30», «Mañana a primera hora (ya no queda sol hoy)». */
  subtitle?: string | null;
  results: SunSearchResult[];
  loading: boolean;
  /** Recalculando con los resultados anteriores a la vista. */
  refreshing?: boolean;
  emptyText: string;
  mode: SunShadeMode;
  now: number;
  sunset?: number;
  showWalk: boolean;
  activeId: string | null;
  onPick(r: SunSearchResult): void;
  onHover?(id: string | null): void;
  /** Hay una búsqueda (chip, texto o colección) en lugar de «Para ti». */
  onBackToForYou?(): void;
  hasLocation: boolean;
  locating?: boolean;
  onUseLocation(): void;
  /** Filtros abiertos (van encima de la lista). */
  filters?: ReactNode;
  /** Dato extra por sitio («lavabo a 120 m»). */
  extraFor?(r: SunSearchResult): string | null;
  /** Bajo la lista (refugio climático más cercano, sugerencias…). */
  footer?: ReactNode;
  onRetry?(): void;
  failed?: boolean;
}

/**
 * «Para ti ahora»: 3–5 tarjetas con su porqué, sincronizadas con los pines numerados del mapa.
 * La misma lista sirve para un chip, una búsqueda escrita o una colección.
 */
export default function ForYou(p: ForYouProps) {
  return (
    <section aria-label={p.title} aria-busy={p.loading || p.refreshing}>
      <div className="flex min-h-[44px] items-center justify-between gap-2">
        <div className="flex min-w-0 items-center gap-1">
          {p.onBackToForYou && (
            <button
              type="button"
              onClick={p.onBackToForYou}
              aria-label={tr("forYou.volver_a_para_ti")}
              className="-ml-2.5 flex h-11 w-11 shrink-0 items-center justify-center rounded-full text-ink-soft outline-none transition-colors hover:bg-ink/5 hover:text-ink focus-visible:ring-2 focus-visible:ring-sun/60"
            >
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
                <path d="M15 18l-6-6 6-6" />
              </svg>
            </button>
          )}
          <div className="min-w-0">
            <h2 className="flex items-center gap-2 truncate text-[16px] font-semibold leading-tight text-ink">
              <span className="truncate">{p.title}</span>
              {p.refreshing && <span aria-hidden className="fts-breathe block h-2 w-2 shrink-0 rounded-full bg-sun" />}
            </h2>
            {p.subtitle && <p className="mt-0.5 truncate text-[12.5px] text-ink-soft">{p.subtitle}</p>}
          </div>
        </div>
        {!p.hasLocation && (
          <button
            type="button"
            onClick={p.onUseLocation}
            disabled={p.locating}
            className="min-h-[44px] shrink-0 rounded-full px-2 text-[13px] font-semibold text-sun-deep underline-offset-4 outline-none hover:underline focus-visible:ring-2 focus-visible:ring-sun/60 disabled:opacity-60"
          >
            {tr("forYou.cerca_de_mi")}
          </button>
        )}
      </div>

      {p.filters}

      <div className={cn("mt-1.5 space-y-2 transition-opacity duration-300", p.refreshing && "opacity-60")}>
        {p.loading &&
          [0, 1, 2].map((i) => (
            <div key={i} className="fts-shimmer h-[76px] rounded-[18px]" style={{ animationDelay: `${i * 120}ms` }} />
          ))}
        {!p.loading &&
          p.results.map((r, i) => (
            <div key={r.placeId} className="fts-fade-in" style={{ animationDelay: `${i * 50}ms` }}>
              <ForYouCard
                result={r}
                rank={i + 1}
                mode={p.mode}
                now={p.now}
                sunset={p.sunset}
                showWalk={p.showWalk}
                active={p.activeId === r.placeId}
                extra={p.extraFor?.(r) ?? null}
                onPick={p.onPick}
                onHover={p.onHover}
              />
            </div>
          ))}
        {!p.loading && p.results.length === 0 && (
          <div className="rounded-[18px] border border-dashed border-line px-4 py-4">
            <p className="text-[14px] leading-snug text-ink-soft">{p.emptyText}</p>
            {p.failed && p.onRetry && (
              <button
                type="button"
                onClick={p.onRetry}
                className="mt-2 min-h-[44px] text-[13.5px] font-semibold text-sun-deep underline-offset-4 hover:underline"
              >
                {tr("forYou.reintentar")}
              </button>
            )}
          </div>
        )}
      </div>
      {p.footer && <div className={cn("mt-3")}>{p.footer}</div>}
    </section>
  );
}

export function SectionTitle({ children }: { children: ReactNode }) {
  return <Caps className="mb-2 mt-6">{children}</Caps>;
}
