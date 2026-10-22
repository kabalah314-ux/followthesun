import { useEffect, useState } from "react";
import { PLACE_TYPE_LABEL } from "../../lib/placeTypes";
import { createList, deleteList, toggleInList, type PlaceList } from "../../services/listsService";
import { getPlaceSunSummaryCached, savedToPlace, type PlaceSunSummary } from "../../services/placeSunService";
import { formatClock } from "../../services/timeService";
import type { SavedPlace } from "../../types";
import { cn } from "../../utils/cn";
import { SunGlyph } from "../Icons";
import { Heart } from "../LineIcons";
import { tr } from "../../i18n";

type SummaryState = PlaceSunSummary | "loading" | "error";

function line(s: SummaryState | undefined): { text: string; glyph: "sun" | "shade" | "partial" } {
  if (!s || s === "loading") return { text: tr("savedPlaces.calculando_el_sol_de_hoy"), glyph: "partial" };
  if (s === "error") return { text: tr("savedPlaces.sin_datos_ahora_mismo"), glyph: "partial" };
  if (s.status === "sun" && s.window) {
    return {
      text: `${s.weatherAvailable ? tr("savedPlaces.mejor_sol_hoy") : tr("savedPlaces.sol_posible_hoy")} ${formatClock(s.window.start)}–${formatClock(s.window.end)}`,
      glyph: s.weatherAvailable ? "sun" : "partial",
    };
  }
  return {
    text: s.next ? tr("savedPlaces.sin_sol_directo_hoy_manana", { p0: formatClock(s.next.start) }) : tr("savedPlaces.sin_sol_directo_hoy_ni"),
    glyph: "shade",
  };
}

/**
 * Listas de Mis sitios: todos los guardados con su mejor sol de hoy, agrupables en listas
 * («Terrazas de invierno», «Con los niños»). Solo en este dispositivo.
 */
export default function ListsPanel({
  saved,
  lists,
  activeId,
  onOpen,
  onRemove,
}: {
  saved: SavedPlace[];
  lists: PlaceList[];
  activeId: string | null;
  onOpen(p: SavedPlace, summary: PlaceSunSummary | null): void;
  onRemove(p: SavedPlace): void;
}) {
  const [summaries, setSummaries] = useState<Record<string, SummaryState>>({});
  const [listId, setListId] = useState<string>("all");
  const [managing, setManaging] = useState<string | null>(null);
  const [naming, setNaming] = useState(false);
  const [name, setName] = useState("");

  const current = lists.find((l) => l.id === listId) ?? null;
  const shown = current ? saved.filter((p) => current.placeIds.includes(p.id)) : saved;
  const shownKey = shown.map((p) => p.id).join(",");

  useEffect(() => {
    let alive = true;
    (async () => {
      // En serie: cada análisis descarga los edificios de su zona; así no se satura la red.
      for (const p of shown) {
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
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [shownKey]);

  const chip = (on: boolean) =>
    cn(
      "h-11 shrink-0 rounded-full px-3.5 text-[13.5px] font-semibold outline-none transition-colors focus-visible:ring-2 focus-visible:ring-sun/60",
      on ? "bg-ink text-paper" : "border border-line text-ink hover:bg-ink/[0.05]"
    );

  if (saved.length === 0) {
    return (
      <div className="rounded-[20px] border border-dashed border-line px-4 py-5 text-center">
        <Heart size={22} strokeWidth={1.5} absoluteStrokeWidth className="mx-auto text-ink-faint" />
        <p className="mt-3 font-serif text-[19px] leading-tight text-ink">{tr("savedPlaces.aun_no_has_guardado_ningun")}</p>
        <p className="mt-1.5 text-[13.5px] leading-relaxed text-ink-soft">{tr("mine.guarda_desde_la_ficha")}</p>
      </div>
    );
  }

  return (
    <div>
      <div className="fts-scroll-x -mx-4 flex gap-1.5 overflow-x-auto px-4 pb-1">
        <button type="button" aria-pressed={listId === "all"} onClick={() => setListId("all")} className={chip(listId === "all")}>
          {tr("mine.todos", { p0: saved.length })}
        </button>
        {lists.map((l) => (
          <button key={l.id} type="button" aria-pressed={listId === l.id} onClick={() => setListId(l.id)} className={chip(listId === l.id)}>
            {l.name} · {l.placeIds.filter((id) => saved.some((p) => p.id === id)).length}
          </button>
        ))}
        {naming ? (
          <form
            onSubmit={(e) => {
              e.preventDefault();
              const l = createList(name);
              setNaming(false);
              setName("");
              if (l) setListId(l.id);
            }}
            className="flex shrink-0 items-center gap-1"
          >
            <input
              autoFocus
              value={name}
              onChange={(e) => setName(e.target.value)}
              onBlur={() => !name && setNaming(false)}
              maxLength={40}
              aria-label={tr("mine.nombre_de_la_lista")}
              placeholder={tr("mine.nombre_de_la_lista")}
              className="h-11 w-44 rounded-full border border-sun bg-paper/80 px-3.5 text-[14px] text-ink outline-none"
            />
            <button type="submit" className="h-11 rounded-full bg-ink px-3.5 text-[13px] font-semibold text-paper">
              {tr("mine.crear")}
            </button>
          </form>
        ) : (
          <button type="button" onClick={() => setNaming(true)} className={cn(chip(false), "border-dashed text-ink-soft")}>
            + {tr("mine.nueva_lista")}
          </button>
        )}
      </div>

      {current && shown.length === 0 && (
        <p className="mt-3 rounded-[18px] border border-dashed border-line px-4 py-3.5 text-[13.5px] leading-snug text-ink-soft">{tr("mine.lista_vacia")}</p>
      )}

      <ul className="mt-3 space-y-2">
        {shown.map((p) => {
          const s = summaries[p.id];
          const l = line(s);
          const inLists = lists.filter((x) => x.placeIds.includes(p.id));
          return (
            <li key={p.id} className="fts-fade-in">
              <div className={cn("rounded-[18px] border transition-colors", activeId === p.id ? "border-sun/60 bg-sun-soft" : "border-line bg-paper/60")}>
                <div className="flex items-center gap-1 pr-1">
                  <button
                    type="button"
                    onClick={() => onOpen(p, s && s !== "loading" && s !== "error" ? s : null)}
                    className="flex min-h-[64px] min-w-0 flex-1 items-center gap-3 rounded-[18px] px-3.5 py-2.5 text-left outline-none focus-visible:ring-2 focus-visible:ring-sun/60"
                  >
                    <SunGlyph state={l.glyph} size={26} className={cn("shrink-0", s === "loading" && "animate-pulse")} />
                    <span className="min-w-0">
                      <span className="block truncate text-[15px] font-semibold text-ink">{p.name}</span>
                      <span className="block truncate text-[13px] text-ink-soft">
                        {PLACE_TYPE_LABEL[p.type]?.singular} · {l.text}
                      </span>
                      {inLists.length > 0 && <span className="block truncate text-[12px] text-ink-faint">{inLists.map((x) => x.name).join(" · ")}</span>}
                    </span>
                  </button>
                  <button
                    type="button"
                    onClick={() => setManaging(managing === p.id ? null : p.id)}
                    aria-expanded={managing === p.id}
                    aria-label={tr("mine.listas_de", { p0: p.name })}
                    className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full text-ink-soft hover:bg-ink/5 hover:text-ink"
                  >
                    <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" aria-hidden>
                      <path d="M4 7h11M4 12h11M4 17h7M18 14v6M15 17h6" />
                    </svg>
                  </button>
                  <button
                    type="button"
                    onClick={() => onRemove(p)}
                    aria-label={tr("savedPlaces.quitar_de_guardados", { p0: p.name })}
                    className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full text-sun-deep hover:bg-ink/5"
                  >
                    <Heart size={17} strokeWidth={1.5} absoluteStrokeWidth fill="currentColor" />
                  </button>
                </div>
                {managing === p.id && (
                  <div className="fts-fade-in flex flex-wrap gap-1.5 border-t border-line px-3.5 py-2.5">
                    {lists.length === 0 && <p className="text-[13px] text-ink-soft">{tr("mine.crea_una_lista")}</p>}
                    {lists.map((x) => {
                      const on = x.placeIds.includes(p.id);
                      return (
                        <button key={x.id} type="button" aria-pressed={on} onClick={() => toggleInList(x.id, p.id)} className={chip(on)}>
                          {on ? "✓ " : ""}
                          {x.name}
                        </button>
                      );
                    })}
                  </div>
                )}
              </div>
            </li>
          );
        })}
      </ul>

      {current && (
        <button
          type="button"
          onClick={() => {
            deleteList(current.id);
            setListId("all");
          }}
          className="mt-3 min-h-[44px] text-[13px] font-semibold text-ink-soft underline-offset-4 hover:text-ink hover:underline"
        >
          {tr("mine.borrar_la_lista", { p0: current.name })}
        </button>
      )}
      <p className="mt-3 text-[12.5px] text-ink-faint">{tr("savedPlaces.guardado_solo_en_este_dispositivo")}</p>
    </div>
  );
}
