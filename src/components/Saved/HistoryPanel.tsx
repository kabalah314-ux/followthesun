import { PLACE_TYPE_LABEL } from "../../lib/placeTypes";
import type { HistoryEntry } from "../../services/historyService";
import { formatAge, formatClock, formatDayLabel } from "../../services/timeService";
import { tr } from "../../i18n";

/**
 * Historial de Mis sitios: las fichas que se han abierto (solo en este dispositivo). Desde aquí se
 * borra también lo aprendido (el gusto que ajusta «Para ti»).
 */
export default function HistoryPanel({
  entries,
  now,
  tasteCount,
  onOpen,
  onClearHistory,
  onClearTaste,
}: {
  entries: HistoryEntry[];
  now: number;
  tasteCount: number;
  onOpen(e: HistoryEntry): void;
  onClearHistory(): void;
  onClearTaste(): void;
}) {
  return (
    <div>
      {entries.length === 0 ? (
        <div className="rounded-[20px] border border-dashed border-line px-4 py-5 text-center">
          <p className="font-serif text-[19px] leading-tight text-ink">{tr("history.vacio")}</p>
          <p className="mt-1.5 text-[13.5px] leading-relaxed text-ink-soft">{tr("history.vacio_hint")}</p>
        </div>
      ) : (
        <ul className="space-y-2">
          {entries.map((e) => (
            <li key={e.id}>
              <button
                type="button"
                onClick={() => onOpen(e)}
                className="flex min-h-[60px] w-full items-center justify-between gap-3 rounded-[18px] border border-line bg-paper/60 px-3.5 py-2.5 text-left outline-none hover:bg-ink/[0.04] focus-visible:ring-2 focus-visible:ring-sun/60"
              >
                <span className="min-w-0">
                  <span className="block truncate text-[15px] font-semibold text-ink">{e.name}</span>
                  <span className="block truncate text-[13px] text-ink-soft">{PLACE_TYPE_LABEL[e.type]?.singular}</span>
                </span>
                <span className="shrink-0 text-right text-[12.5px] text-ink-faint">
                  {now - e.openedAt < 86_400_000 ? formatAge(now - e.openedAt) : `${formatDayLabel(e.openedAt)} · ${formatClock(e.openedAt)}`}
                </span>
              </button>
            </li>
          ))}
        </ul>
      )}
      <div className="mt-5 space-y-1 border-t border-line pt-3">
        <p className="text-[13px] leading-relaxed text-ink-soft">{tr("history.privacidad")}</p>
        <div className="flex flex-wrap gap-2 pt-1">
          {entries.length > 0 && (
            <button type="button" onClick={onClearHistory} className="min-h-[44px] rounded-full border border-line px-4 text-[13.5px] font-semibold text-ink hover:bg-ink/[0.05]">
              {tr("history.borrar_historial")}
            </button>
          )}
          {tasteCount > 0 && (
            <button type="button" onClick={onClearTaste} className="min-h-[44px] rounded-full border border-line px-4 text-[13.5px] font-semibold text-ink hover:bg-ink/[0.05]">
              {tr("history.borrar_lo_aprendido")}
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
