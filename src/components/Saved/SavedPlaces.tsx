import { Heart } from "../LineIcons";
import { useEffect, useState } from "react";
import { PLACE_TYPE_LABEL } from "../../lib/placeTypes";
import { getPlaceSunSummaryCached, savedToPlace, type PlaceSunSummary } from "../../services/placeSunService";
import { formatClock } from "../../services/timeService";
import type { SavedPlace } from "../../types";
import { cn } from "../../utils/cn";
import { SunGlyph } from "../Icons";
import { PanelHeader } from "../Layout/ContextPanel";

type SummaryState = PlaceSunSummary | "loading" | "error";

interface Props {
  saved: SavedPlace[];
  activeId: string | null;
  onOpen(p: SavedPlace, summary: PlaceSunSummary | null): void;
  onRemove(p: SavedPlace): void;
  onClose(): void;
}

function line(s: SummaryState | undefined): { text: string; glyph: "sun" | "shade" | "partial" } {
  if (!s || s === "loading") return { text: "Calculando el sol de hoy…", glyph: "partial" };
  if (s === "error") return { text: "Sin datos ahora mismo", glyph: "partial" };
  if (s.status === "sun" && s.window) {
    return {
      text: `${s.weatherAvailable ? "Mejor sol hoy" : "Sol posible hoy"} ${formatClock(s.window.start)}–${formatClock(s.window.end)}`,
      glyph: s.weatherAvailable ? "sun" : "partial",
    };
  }
  return {
    text: s.next ? `Sin sol directo hoy · Mañana desde las ${formatClock(s.next.start)}` : "Sin sol directo hoy ni mañana",
    glyph: "shade",
  };
}

/**
 * Guardados — el centro personal: tus sitios soleados con su mejor sol de hoy. Solo en este
 * dispositivo (sin cuentas todavía). Preparado para planes guardados y avisos de sol futuros.
 */
export default function SavedPlaces({ saved, activeId, onOpen, onRemove, onClose }: Props) {
  const [summaries, setSummaries] = useState<Record<string, SummaryState>>({});

  useEffect(() => {
    let alive = true;
    (async () => {
      // En serie: cada análisis descarga los edificios de su zona; así no se satura la red.
      for (const p of saved) {
        if (!alive) return;
        setSummaries((s) => (s[p.id] && s[p.id] !== "error" ? s : { ...s, [p.id]: "loading" }));
        try {
          const summary = await getPlaceSunSummaryCached(savedToPlace(p));
          if (alive) setSummaries((s) => ({ ...s, [p.id]: summary }));
        } catch {
          if (alive) setSummaries((s) => ({ ...s, [p.id]: "error" }));
        }
      }
    })();
    return () => {
      alive = false;
    };
  }, [saved]);

  return (
    <>
      <PanelHeader title="Guardados" subtitle="Tus sitios soleados" onClose={onClose} />

      {saved.length === 0 ? (
        <div className="rounded-2xl border border-dashed border-line px-4 py-5 text-center">
          <Heart size={22} strokeWidth={1.5} absoluteStrokeWidth className="mx-auto text-ink-faint" />
          <p className="mt-3 font-serif text-[18px] leading-tight text-ink">Aún no has guardado ningún sitio.</p>
          <p className="mt-1.5 text-[12px] leading-relaxed text-ink-soft">
            Pulsa «Guardar» en un resultado de Find the Sun o en cualquier punto del mapa (tu casa, tu banco
            favorito…) y aquí verás cuándo le da el sol.
          </p>
        </div>
      ) : (
        <ul className="space-y-2">
          {saved.map((p, i) => {
            const s = summaries[p.id];
            const l = line(s);
            return (
              <li key={p.id} className="fts-fade-in" style={{ animationDelay: `${i * 60}ms` }}>
                <div
                  className={cn(
                    "flex items-center gap-3 rounded-2xl border px-3.5 py-3 transition-colors duration-300",
                    activeId === p.id ? "border-sun/60 bg-sun-soft" : "border-line bg-ink/[0.025] hover:bg-ink/[0.05]"
                  )}
                >
                  <button
                    type="button"
                    onClick={() => onOpen(p, s && s !== "loading" && s !== "error" ? s : null)}
                    className="flex min-w-0 flex-1 items-center gap-3 text-left outline-none focus-visible:ring-2 focus-visible:ring-sun/60 rounded-xl"
                  >
                    <SunGlyph state={l.glyph} size={24} className={cn("shrink-0", s === "loading" && "animate-pulse")} />
                    <span className="min-w-0">
                      <span className="block truncate text-[13.5px] font-medium text-ink">{p.name}</span>
                      <span className="block truncate text-[11px] text-ink-soft">
                        {PLACE_TYPE_LABEL[p.type].singular} · {l.text}
                      </span>
                    </span>
                  </button>
                  <button
                    type="button"
                    onClick={() => onRemove(p)}
                    aria-label={`Quitar ${p.name} de guardados`}
                    className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-sun-deep outline-none transition-colors hover:bg-ink/5 focus-visible:ring-2 focus-visible:ring-sun/60"
                  >
                    <Heart size={16} strokeWidth={1.5} absoluteStrokeWidth fill="currentColor" />
                  </button>
                </div>
              </li>
            );
          })}
        </ul>
      )}

      <p className="mt-4 text-[10px] text-ink-faint">Guardado solo en este dispositivo.</p>
    </>
  );
}
