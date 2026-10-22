import { useState, type ReactNode, type RefObject } from "react";
import { useComfort } from "../../hooks/useComfort";
import type { SunShadeMode } from "../../lib/answer";
import { comfortSentence, uvLine } from "../../lib/comfort";
import { placeFlags } from "../../lib/explore";
import { confidenceWord, fmtMin } from "../../lib/formatSun";
import { openStateAt } from "../../lib/openingHours";
import { describeResult } from "../../lib/placeAnswer";
import { PLACE_TYPE_LABEL } from "../../lib/placeTypes";
import { hhmm } from "../../lib/planningTime";
import type { NormalizedSunRequest, SunPlace, SunSearchResult } from "../../types";
import { cn } from "../../utils/cn";
import { CloseIcon, SunGlyph } from "../Icons";
import WindowStrip from "../FindSun/WindowStrip";
import AffiliateSlot from "./AffiliateSlot";
import HowWeKnow from "./HowWeKnow";
import TerraceBlock from "./TerraceBlock";
import { tr, trPlural } from "../../i18n";

/**
 * Ficha de un lugar (guía maestra 2): primero el sitio y luego los datos.
 *
 *   cabecera   tipo · nombre · frase-respuesta («Sol hasta las 17:40 · quedan 52 min»)
 *   imagen     3D · Foto · 360° (`PlaceMedia`, la coloca quien monta la ficha)
 *   datos      abierto ahora, minutos a pie, mesas autorizadas, wifi, perros, accesible
 *   acciones   Cómo llegar (principal) · Guardar · Compartir · Al plan · Avisarme
 *   barra      la luz del sitio en la franja, con la mejor ventana marcada
 *   confort    sensación al sol y a la sombra, viento y UV con consejo
 *   terraza    licencia municipal y confirmaciones
 *   afiliación hueco marcado (vacío sin programas)
 *   «Cómo lo sabemos», plegado
 */

export interface CardData {
  place: SunPlace;
  result: SunSearchResult | null;
  request: NormalizedSunRequest | null;
  status: "loading" | "ready" | "error";
}

const RELIABILITY: Record<ReturnType<typeof confidenceWord>, "sunDetails.seguro" | "sunDetails.bastante_seguro" | "sunDetails.depende_de_las_nubes"> = {
  very_high: "sunDetails.seguro",
  high: "sunDetails.seguro",
  medium: "sunDetails.bastante_seguro",
  low: "sunDetails.depende_de_las_nubes",
};

function IconButton({ label, onClick, children }: { label: string; onClick(): void; children: ReactNode }) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-label={label}
      className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full text-ink-soft outline-none transition-colors hover:bg-ink/5 hover:text-ink focus-visible:ring-2 focus-visible:ring-sun/60"
    >
      {children}
    </button>
  );
}

/** Cabecera: parte del asa de la hoja; con la hoja asomada es lo único que se ve. */
export function PlaceCardHeader({
  data,
  mode,
  now,
  onClose,
  onBack,
  titleRef,
}: {
  data: CardData;
  mode: SunShadeMode;
  now: number;
  onClose(): void;
  /** Volver a la lista de la que se vino. */
  onBack?(): void;
  titleRef?: RefObject<HTMLHeadingElement | null>;
}) {
  const { place, result } = data;
  const answer = result ? describeResult(result, now, mode) : null;
  const type = PLACE_TYPE_LABEL[place.type]?.singular ?? tr("nearbyCard.lugar");
  return (
    <div>
      <div className="flex items-start gap-1">
        {onBack && (
          <IconButton label={tr("contextPanel.atras")} onClick={onBack}>
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
              <path d="M15 18l-6-6 6-6" />
            </svg>
          </IconButton>
        )}
        <div className={cn("min-w-0 flex-1", !onBack && "pl-0.5")}>
          <p className="fts-caps truncate !text-[11.5px]">
            {type}
            {result?.walking ? tr("sunResultCard.min_a_pie", { p0: result.walking.durationMinutes }) : ""}
          </p>
          <h2 ref={titleRef} tabIndex={-1} className="mt-1 truncate font-serif text-[24px] leading-[1.08] text-ink outline-none">
            {place.name}
          </h2>
        </div>
        <IconButton label={tr("sunDetails.cerrar")} onClick={onClose}>
          <CloseIcon />
        </IconButton>
      </div>
      <div className="mt-1.5 flex min-h-[24px] items-center gap-2" aria-live="polite">
        {answer ? (
          <>
            <SunGlyph state={answer.state} size={22} className="shrink-0" />
            <p className="min-w-0 truncate text-[14.5px] font-semibold text-ink">
              {answer.headline}
              {answer.detail && <span className="font-normal text-ink-soft"> · {answer.detail.toLowerCase()}</span>}
            </p>
          </>
        ) : data.status === "error" ? (
          <p className="text-[14px] text-ink-soft">{tr("placeCard.no_hemos_podido_calcular")}</p>
        ) : (
          <p className="text-[14px] text-ink-soft">{tr("placeCard.calculando_su_sol")}</p>
        )}
      </div>
    </div>
  );
}

function Fact({ children, tone }: { children: ReactNode; tone?: "ok" | "warn" }) {
  return (
    <li
      className={cn(
        "rounded-full border px-3 py-1.5 text-[13px] font-medium",
        tone === "ok" ? "border-sun/40 bg-sun-soft text-ink" : tone === "warn" ? "border-line bg-ink/[0.05] text-ink-soft" : "border-line text-ink"
      )}
    >
      {children}
    </li>
  );
}

function ActionButton({ children, onClick, active, label }: { children: ReactNode; onClick(): void; active?: boolean; label: string }) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={active}
      className={cn(
        "flex min-h-[44px] flex-1 flex-col items-center justify-center gap-0.5 rounded-[16px] px-1 py-1.5 text-[12.5px] font-semibold outline-none transition-colors focus-visible:ring-2 focus-visible:ring-sun/60",
        active ? "bg-sun-soft text-sun-deep" : "text-ink-soft hover:bg-ink/[0.05] hover:text-ink"
      )}
    >
      {children}
      <span>{label}</span>
    </button>
  );
}

export interface PlaceCardBodyProps {
  data: CardData;
  mode: SunShadeMode;
  now: number;
  /** La imagen (pestañas 3D · Foto · 360°) o nada si va en la ventana de la hoja. */
  media?: ReactNode;
  saved: boolean;
  onToggleSave(): void;
  onShare(): void;
  inPlan: boolean;
  onAddToPlan(): void;
  onAlerts(): void;
  onTerraceFeedback?(hasTerrace: boolean): void;
  onRetry?(): void;
}

export function PlaceCardBody(p: PlaceCardBodyProps) {
  const { place, result, request } = p.data;
  const [openedAt] = useState(() => Date.now());
  const ref = p.now ?? openedAt;
  const inWindow = result ? ref >= result.searchWindow.start && ref < result.searchWindow.end : false;
  const comfort = useComfort(result ? (inWindow ? ref : (result.bestWindow ?? result.searchWindow).start) : null);
  const fl = placeFlags(place);
  const open = openStateAt(fl.hours, ref);
  const lat = result?.spot.latitude ?? place.latitude;
  const lng = result?.spot.longitude ?? place.longitude;

  const facts: Array<{ key: string; text: string; tone?: "ok" | "warn" }> = [];
  if (open) {
    facts.push(
      open.open
        ? { key: "open", tone: "ok", text: open.closesAt === null ? tr("placeCard.abierto") : tr("placeCard.abierto_hasta", { p0: hhmm(open.closesAt) }) }
        : {
            key: "open",
            tone: "warn",
            text: open.opensAt && open.opensAt.dayOffset === 0 ? tr("placeCard.cerrado_abre_a_las", { p0: hhmm(open.opensAt.minutes) }) : tr("placeCard.cerrado_ahora"),
          }
    );
  }
  if (result?.walking) facts.push({ key: "walk", text: tr("why.min_a_pie", { p0: result.walking.durationMinutes }) });
  if (fl.licensed?.tables && fl.licensed.tables > 0) {
    const n = Math.round(fl.licensed.tables);
    facts.push({ key: "tables", text: trPlural(n, { one: "placeCard.mesa_autorizada_one", other: "placeCard.mesas_autorizadas_other" }) });
  }
  if (fl.wifi) facts.push({ key: "wifi", text: tr("placeCard.wifi") });
  if (fl.dog) facts.push({ key: "dog", text: tr("placeCard.admite_perros") });
  if (fl.accessible) facts.push({ key: "a11y", text: tr("placeCard.accesible") });
  if (result) facts.push({ key: "conf", text: tr(RELIABILITY[confidenceWord(result.confidence)]) });

  const directions = `https://www.google.com/maps/dir/?api=1&destination=${lat.toFixed(5)},${lng.toFixed(5)}&travelmode=walking`;
  const D = result?.requestedMinutes ?? 60;

  return (
    <div className="pb-2">
      {p.media && <div className="mt-1">{p.media}</div>}

      {p.data.status === "loading" && !result && (
        <div className="mt-4 space-y-2" aria-busy="true">
          <div className="fts-shimmer h-10 rounded-full" />
          <div className="fts-shimmer h-12 rounded-[18px]" style={{ animationDelay: "120ms" }} />
          <div className="fts-shimmer h-8 rounded-[14px]" style={{ animationDelay: "240ms" }} />
        </div>
      )}
      {p.data.status === "error" && !result && (
        <div className="mt-4 rounded-[18px] border border-dashed border-line px-4 py-3.5">
          <p className="text-[14px] text-ink-soft">{tr("placeCard.no_hemos_podido_calcular_detalle")}</p>
          {p.onRetry && (
            <button type="button" onClick={p.onRetry} className="mt-1 min-h-[44px] text-[13.5px] font-semibold text-sun-deep underline-offset-4 hover:underline">
              {tr("forYou.reintentar")}
            </button>
          )}
        </div>
      )}

      {facts.length > 0 && (
        <ul aria-label={tr("placeCard.datos_rapidos")} className="mt-3.5 flex flex-wrap gap-1.5">
          {facts.map((f) => (
            <Fact key={f.key} tone={f.tone}>
              {f.text}
            </Fact>
          ))}
        </ul>
      )}

      <div className="mt-3.5 flex items-stretch gap-2">
        <a
          href={directions}
          target="_blank"
          rel="noopener noreferrer"
          className="fts-cta flex min-h-[48px] flex-[1.6] items-center justify-center gap-2 rounded-full bg-ink px-4 text-[14.5px] font-semibold text-paper outline-none transition-transform active:scale-[0.98] focus-visible:ring-2 focus-visible:ring-sun/60"
        >
          <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
            <circle cx="6" cy="18" r="2" />
            <circle cx="18" cy="6" r="2" />
            <path d="M8 18h6a3 3 0 0 0 0-6h-4a3 3 0 0 1 0-6h6" />
          </svg>
          {tr("sunDetails.como_llegar")}
        </a>
      </div>
      <div className="mt-1.5 flex gap-1">
        <ActionButton onClick={p.onToggleSave} active={p.saved} label={p.saved ? tr("sunDetails.guardado") : tr("sunDetails.guardar")}>
          <svg width="18" height="18" viewBox="0 0 24 24" fill={p.saved ? "currentColor" : "none"} stroke="currentColor" strokeWidth="1.5" strokeLinejoin="round" aria-hidden>
            <path d="M12 20s-7-4.4-7-10a4 4 0 0 1 7-2.6A4 4 0 0 1 19 10c0 5.6-7 10-7 10z" />
          </svg>
        </ActionButton>
        <ActionButton onClick={p.onShare} label={tr("sunDetails.compartir")}>
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
            <path d="M12 15V4M8 8l4-4 4 4M5 13v6h14v-6" />
          </svg>
        </ActionButton>
        <ActionButton onClick={p.onAddToPlan} active={p.inPlan} label={p.inPlan ? tr("placeCard.en_el_plan") : tr("placeCard.al_plan")}>
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" aria-hidden>
            <circle cx="9" cy="8" r="3" />
            <circle cx="16.5" cy="9.5" r="2.3" />
            <path d="M3.5 19c.8-3 3-4.6 5.5-4.6s4.7 1.6 5.5 4.6M14.5 14.6c2.6-.4 4.8 1 5.6 3.9" />
          </svg>
        </ActionButton>
        <ActionButton onClick={p.onAlerts} label={tr("placeCard.avisarme")}>
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
            <path d="M6 16V11a6 6 0 1 1 12 0v5l1.5 2h-15z" />
            <path d="M10 20.5a2 2 0 0 0 4 0" />
          </svg>
        </ActionButton>
      </div>

      {result && request && (
        <div className="mt-4">
          <p className="fts-caps !text-[11.5px]">{tr("placeCard.su_luz")}</p>
          <div className="mt-2">
            <WindowStrip windows={result.windows} start={request.startTime} end={request.endTime} highlight={result.searchWindow} />
          </div>
          <p className="mt-2 text-[12.5px] leading-snug text-ink-faint">{tr("sunDetails.el_contorno_marca_la_mejor", { p0: fmtMin(D) })}</p>
        </div>
      )}

      {comfort && (
        <div className="mt-4 rounded-[18px] bg-ink/[0.035] px-3.5 py-3">
          <p className="fts-caps !text-[11.5px]">{tr("placeCard.confort")}</p>
          <p className="mt-1.5 text-[14px] leading-snug text-ink">{comfortSentence(comfort)}</p>
          {uvLine(comfort) && <p className="mt-1 text-[13px] leading-snug text-ink-soft">{uvLine(comfort)}</p>}
        </div>
      )}

      {result && <TerraceBlock result={result} onFeedback={p.onTerraceFeedback} />}

      <AffiliateSlot place={place} context="card" />

      {result && <HowWeKnow result={result} />}
    </div>
  );
}
