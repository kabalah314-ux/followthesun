import type { SavedPlace } from "../../types";
import { PLACE_TYPE_LABEL } from "../../lib/placeTypes";
import { ArrowRightIcon, CloseIcon, SavedIcon } from "../Navigation/NavIcons";
import { Caps } from "../FindSun/ui";
import { useSavedForecast, type DayForecast } from "../../hooks/useSavedForecast";
import { fmtMin } from "../../lib/formatSun";
import { formatClock } from "../../services/timeService";

function forecastText(f: DayForecast | undefined): { text: string; tone: "sun" | "shade" | "faint" } {
  if (!f) return { text: "Calculando el sol de hoy…", tone: "faint" };
  if (f.state === "night") return { text: "El sol ya se ha puesto. Mañana, más.", tone: "faint" };
  if (f.state === "none") return { text: "Hoy ya no le queda sol directo", tone: "shade" };
  if (f.state === "sun" && f.until) return { text: `Sol ahora, hasta las ${formatClock(f.until)}`, tone: "sun" };
  if (f.next) return { text: `Sombra ahora · sol de ${formatClock(f.next.start)} a ${formatClock(f.next.end)}`, tone: "shade" };
  return { text: "", tone: "faint" };
}

export const directionsUrl = (lat: number, lng: number) =>
  `https://www.google.com/maps/dir/?api=1&destination=${lat},${lng}&travelmode=walking`;

interface Props {
  saved: SavedPlace[];
  onSelect(place: SavedPlace): void;
  onRemove(place: SavedPlace): void;
  onClose(): void;
}

/** Lugares guardados en este dispositivo; no requiere cuenta ni backend. */
export default function SavedPanel({ saved, onSelect, onRemove, onClose }: Props) {
  const forecast = useSavedForecast(saved, true);
  return (
    <section className="fts-glass fts-context-panel fts-slide-in">
      <div className="fts-section-head">
        <div className="flex min-w-0 items-center gap-2.5">
          <SavedIcon className="h-[19px] w-[19px] shrink-0 text-sun-deep" />
          <div>
            <Caps>En este dispositivo</Caps>
            <h2 className="mt-1 font-serif text-[23px] leading-none text-ink">Favoritos</h2>
          </div>
        </div>
        <button type="button" aria-label="Cerrar" onClick={onClose} className="fts-close-button">
          <CloseIcon className="h-4 w-4" />
        </button>
      </div>

      {saved.length === 0 ? (
        <div className="py-8 text-center">
          <div className="mx-auto flex h-11 w-11 items-center justify-center rounded-full bg-sun-soft text-sun-deep">
            <SavedIcon className="h-5 w-5" />
          </div>
          <p className="mt-3 font-serif text-[19px] text-ink">Tus lugares favoritos, a mano.</p>
          <p className="mx-auto mt-1.5 max-w-[230px] text-[12px] leading-relaxed text-ink-soft">
            Guarda un sitio con la estrella desde sus detalles y aquí verás cuánto sol le queda hoy. Sin cuenta: se guarda solo en este móvil.
          </p>
        </div>
      ) : (
        <ul className="fts-scroll-y mt-3 max-h-[min(52dvh,470px)] overflow-y-auto pr-1">
          {saved.map((p) => {
            const f = forecastText(forecast[p.id]);
            const left = forecast[p.id]?.remainingMinutes ?? 0;
            return (
            <li key={p.id} className="border-t border-line first:border-t-0" data-testid={`saved-item-${p.id}`}>
              <div className="flex items-center gap-2">
                <button type="button" onClick={() => onSelect(p)} className="fts-place-row group min-w-0 flex-1">
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-[13px] font-medium text-ink">{p.name}</span>
                    <span className="mt-1 block text-[10px] font-medium uppercase tracking-[0.14em] text-ink-faint">
                      {PLACE_TYPE_LABEL[p.type].singular}
                      {left > 0 ? ` · ${fmtMin(left)} de sol hoy` : ""}
                    </span>
                    <span
                      data-testid={`saved-forecast-${p.id}`}
                      className={`mt-1 block text-[12px] font-medium ${f.tone === "sun" ? "text-sun-deep" : f.tone === "shade" ? "text-ink-soft" : "text-ink-faint"}`}
                    >
                      {f.text}
                    </span>
                  </span>
                  <ArrowRightIcon className="h-4 w-4 shrink-0 text-ink-faint" />
                </button>
                <a
                  href={directionsUrl(p.latitude, p.longitude)}
                  target="_blank"
                  rel="noreferrer"
                  className="rounded-full px-2 py-2 text-[10px] font-semibold text-sun-deep transition-colors hover:bg-ink/[0.05]"
                >
                  Ir
                </a>
                <button
                  type="button"
                  onClick={() => onRemove(p)}
                  aria-label={`Quitar ${p.name} de guardados`}
                  className="mr-1 rounded-full px-2.5 py-2 text-[10px] font-semibold text-ink-faint transition-colors hover:bg-ink/[0.05] hover:text-ink"
                >
                  Quitar
                </button>
              </div>
            </li>
            );
          })}
        </ul>
      )}
      <p className="mt-3 border-t border-line pt-3 text-[10px] text-ink-faint">
        {saved.length} {saved.length === 1 ? "favorito" : "favoritos"} en este dispositivo · sol calculado con edificios y nubes de hoy
      </p>
    </section>
  );
}