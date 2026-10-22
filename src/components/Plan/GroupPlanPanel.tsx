import { useEffect, useState, type ReactNode } from "react";
import { decodeGroupPlan, encodeGroupPlan, GROUP_MAX, GROUP_MIN, optionToPlace, type GroupOption, type GroupPlan } from "../../lib/groupPlan";
import { PLACE_TYPE_LABEL } from "../../lib/placeTypes";
import { dayChoiceLabel } from "../../lib/planningTime";
import { absoluteUrl } from "../../lib/routing";
import { getPlaceSunSummaryCached, type PlaceSunSummary } from "../../services/placeSunService";
import { formatClock, startOfZoneDay } from "../../services/timeService";
import { cn } from "../../utils/cn";
import { Caps, PrimaryButton } from "../FindSun/ui";
import { tr } from "../../i18n";


/** Enlace que abre el plan igual en cualquier móvil (las opciones van dentro del enlace). */
export function groupPlanLink(plan: GroupPlan): string {
  return absoluteUrl({ view: "plans", tab: "group" }, `?g=${encodeGroupPlan(plan)}`);
}

function sunLine(s: PlaceSunSummary | "loading" | "error" | undefined, now: number): string {
  if (!s || s === "loading") return tr("savedPlaces.calculando_el_sol_de_hoy");
  if (s === "error") return tr("savedPlaces.sin_datos_ahora_mismo");
  if (s.status === "sun" && s.window) return tr("group.mejor_sol", { p0: formatClock(s.window.start), p1: formatClock(s.window.end) });
  if (s.next) return tr("group.sol_desde", { p0: dayChoiceLabel(startOfZoneDay(s.next.start), now).toLowerCase(), p1: formatClock(s.next.start) });
  return tr("savedPlaces.sin_sol_directo_hoy_ni");
}

function OptionRow({
  o,
  index,
  now,
  onOpen,
  action,
}: {
  o: GroupOption;
  index: number;
  now: number;
  onOpen(o: GroupOption): void;
  action?: ReactNode;
}) {
  const [sum, setSum] = useState<PlaceSunSummary | "loading" | "error">("loading");
  useEffect(() => {
    let alive = true;
    getPlaceSunSummaryCached(optionToPlace(o)).then(
      (s) => alive && setSum(s),
      () => alive && setSum("error")
    );
    return () => {
      alive = false;
    };
  }, [o]);
  return (
    <li className="flex items-center gap-2 rounded-[18px] border border-line bg-paper/60 pr-1">
      <button
        type="button"
        onClick={() => onOpen(o)}
        className="flex min-h-[64px] min-w-0 flex-1 items-start gap-3 rounded-[18px] px-3.5 py-3 text-left outline-none focus-visible:ring-2 focus-visible:ring-sun/60"
      >
        <span className="mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-ink/10 text-[13px] font-bold text-ink">{index + 1}</span>
        <span className="min-w-0">
          <span className="block truncate text-[15px] font-semibold text-ink">{o.name}</span>
          <span className="mt-0.5 block text-[12.5px] text-ink-soft">
            {PLACE_TYPE_LABEL[o.type]?.singular}
            {o.time ? ` · ${dayChoiceLabel(startOfZoneDay(o.time), now)} ${formatClock(o.time)}` : ""}
          </span>
          <span className="mt-0.5 block text-[13px] font-medium text-ink">{sunLine(sum, now)}</span>
        </span>
      </button>
      {action}
    </li>
  );
}

/**
 * Plan en grupo: 2–5 opciones (se añaden desde las fichas con «Al plan») y un enlace para votar
 * por WhatsApp. Sin cuentas ni servidor: las opciones viajan en el enlace y se abren igual en
 * cualquier móvil.
 */
export default function GroupPlanPanel({
  now,
  draft,
  sharedCode,
  selectedTime,
  isNow,
  onOpen,
  onRemove,
  onTitle,
  onSetTimes,
  onAdoptShared,
  onCloseShared,
  onToast,
}: {
  now: number;
  draft: GroupPlan;
  /** Plan recibido por enlace (`?g=`), si se abrió uno. */
  sharedCode: string | null;
  selectedTime: number;
  isNow: boolean;
  onOpen(o: GroupOption): void;
  onRemove(id: string): void;
  onTitle(t: string): void;
  /** Proponer la hora elegida en la línea de tiempo (o ninguna: el mejor momento de cada sitio). */
  onSetTimes(time: number | null): void;
  onAdoptShared(plan: GroupPlan): void;
  onCloseShared(): void;
  onToast(text: string): void;
}) {
  const shared = sharedCode ? decodeGroupPlan(sharedCode) : null;

  const shareText = async (text: string, url: string) => {
    try {
      if (typeof navigator.share === "function") {
        await navigator.share({ title: tr("group.plan_en_grupo"), text, url });
        return;
      }
    } catch (e) {
      if (e instanceof DOMException && e.name === "AbortError") return;
    }
    const wa = `https://wa.me/?text=${encodeURIComponent(`${text}\n${url}`)}`;
    const w = window.open(wa, "_blank", "noopener,noreferrer");
    if (!w) {
      try {
        await navigator.clipboard.writeText(`${text}\n${url}`);
        onToast(tr("app.copiado_al_portapapeles"));
      } catch {
        /* sin portapapeles */
      }
    }
  };

  if (sharedCode) {
    if (!shared) {
      return (
        <div className="rounded-[20px] border border-dashed border-line px-4 py-5">
          <p className="text-[14px] text-ink-soft">{tr("group.enlace_roto")}</p>
          <button type="button" onClick={onCloseShared} className="mt-2 min-h-[44px] text-[14px] font-semibold text-sun-deep hover:underline">
            {tr("group.hacer_mi_plan")}
          </button>
        </div>
      );
    }
    const url = groupPlanLink(shared);
    return (
      <div>
        <Caps>{tr("group.te_han_invitado")}</Caps>
        <p className="mt-1.5 font-serif text-[22px] leading-tight text-ink">{shared.title || tr("group.plan_sin_titulo")}</p>
        <p className="mt-1 text-[13.5px] leading-snug text-ink-soft">{tr("group.elige_y_vota")}</p>
        <ul className="mt-3 space-y-2">
          {shared.options.map((o, i) => (
            <OptionRow
              key={o.id}
              o={o}
              index={i}
              now={now}
              onOpen={onOpen}
              action={
                <button
                  type="button"
                  onClick={() => void shareText(tr("group.voto_por", { p0: o.name, p1: shared.title || tr("group.plan_en_grupo") }), url)}
                  className="h-11 shrink-0 rounded-full bg-sun px-3.5 text-[13px] font-semibold text-ink outline-none focus-visible:ring-2 focus-visible:ring-sun-deep/60"
                >
                  {tr("group.votar")}
                </button>
              }
            />
          ))}
        </ul>
        <div className="mt-4 flex flex-wrap gap-2">
          <button
            type="button"
            onClick={() => onAdoptShared(shared)}
            className="min-h-[44px] rounded-full border border-line px-4 text-[13.5px] font-semibold text-ink hover:bg-ink/[0.05]"
          >
            {tr("group.copiar_a_mi_plan")}
          </button>
          <button type="button" onClick={onCloseShared} className="min-h-[44px] px-2 text-[13.5px] font-semibold text-ink-soft hover:text-ink">
            {tr("group.hacer_mi_plan")}
          </button>
        </div>
      </div>
    );
  }

  const n = draft.options.length;
  const allTimed = n > 0 && draft.options.every((o) => o.time !== null);
  return (
    <div>
      <p className="text-[14px] leading-relaxed text-ink-soft">{tr("group.intro", { p0: GROUP_MIN, p1: GROUP_MAX })}</p>
      <label className="mt-4 block">
        <Caps>{tr("group.titulo")}</Caps>
        <input
          type="text"
          value={draft.title}
          maxLength={80}
          onChange={(e) => onTitle(e.target.value)}
          placeholder={tr("group.titulo_placeholder")}
          className="mt-2 h-12 w-full rounded-full border border-line bg-paper/70 px-4 text-[15px] text-ink outline-none placeholder:text-ink-faint focus:border-sun"
        />
      </label>

      {n === 0 ? (
        <div className="mt-4 rounded-[20px] border border-dashed border-line px-4 py-5 text-center">
          <p className="font-serif text-[18px] leading-tight text-ink">{tr("group.vacio")}</p>
          <p className="mt-1.5 text-[13.5px] leading-relaxed text-ink-soft">{tr("group.vacio_hint")}</p>
        </div>
      ) : (
        <ul className="mt-4 space-y-2">
          {draft.options.map((o, i) => (
            <OptionRow
              key={o.id}
              o={o}
              index={i}
              now={now}
              onOpen={onOpen}
              action={
                <button
                  type="button"
                  onClick={() => onRemove(o.id)}
                  aria-label={tr("group.quitar", { p0: o.name })}
                  className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full text-ink-soft hover:bg-ink/5 hover:text-ink"
                >
                  <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" aria-hidden>
                    <path d="M6 6l12 12M18 6L6 18" />
                  </svg>
                </button>
              }
            />
          ))}
        </ul>
      )}

      {n > 0 && (
        <div className="mt-3 flex flex-wrap gap-1.5">
          <button
            type="button"
            aria-pressed={!allTimed}
            onClick={() => onSetTimes(null)}
            className={cn("h-11 rounded-full px-3.5 text-[13px] font-semibold", !allTimed ? "bg-ink text-paper" : "border border-line text-ink")}
          >
            {tr("group.mejor_momento_de_cada_uno")}
          </button>
          <button
            type="button"
            aria-pressed={allTimed}
            onClick={() => onSetTimes(selectedTime)}
            className={cn("h-11 rounded-full px-3.5 text-[13px] font-semibold", allTimed ? "bg-ink text-paper" : "border border-line text-ink")}
          >
            {isNow ? tr("group.ahora_mismo") : tr("group.a_las", { p0: `${dayChoiceLabel(startOfZoneDay(selectedTime), now)} ${formatClock(selectedTime)}` })}
          </button>
        </div>
      )}

      <PrimaryButton
        disabled={n < GROUP_MIN}
        onClick={() => void shareText(tr("group.mensaje", { p0: draft.title || tr("group.plan_en_grupo") }), groupPlanLink(draft))}
        className="mt-4 w-full justify-center"
      >
        {tr("group.compartir_para_votar")}
      </PrimaryButton>
      {n < GROUP_MIN && <p className="mt-2 text-[12.5px] text-ink-soft">{tr("group.faltan", { p0: GROUP_MIN - n })}</p>}
      <p className="mt-3 text-[12.5px] leading-snug text-ink-faint">{tr("group.nota")}</p>
    </div>
  );
}
