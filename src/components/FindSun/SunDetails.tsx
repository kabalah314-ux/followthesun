import { useState, type ReactNode } from "react";
import {
  CONFIDENCE_ES,
  confidenceWord,
  fmtMeters,
  fmtMin,
  influenceWord,
} from "../../lib/formatSun";
import { useComfort } from "../../hooks/useComfort";
import { comfortSentence } from "../../lib/comfort";
import { describeResult } from "../../lib/placeAnswer";
import { PLACE_TYPE_LABEL } from "../../lib/placeTypes";
import { formatClock } from "../../services/timeService";
import { venueFeedbackService } from "../../services/venueFeedbackService";
import type {
  NormalizedSunRequest,
  SunSearchResult,
  SunlightOrigin,
  SunWindowKind,
  TerraceCertainty,
  VenueCategory,
} from "../../types";
import { licenseSummary, type TerraceLicenseInfo } from "../../services/openData/terraceMatching";
import { cn } from "../../utils/cn";
import { CloseIcon } from "../Icons";
import { Caps, ConfidenceBars } from "./ui";
import WindowStrip from "./WindowStrip";
import { tr } from "../../i18n";

const ORIGIN_ES: Record<SunlightOrigin, string> = {
  observed: tr("sunDetails.basado_en_observacion_satelital"),
  forecast: tr("sunDetails.basado_en_prevision"),
  estimated: tr("sunDetails.estimacion"),
};

const DOT: Record<SunWindowKind | "best", string> = {
  sun: "bg-sun",
  partial: "bg-sun/45",
  shadow: "bg-shade/60",
  cloud: "bg-ink/30",
  uncertain: "bg-ink/20",
  night: "bg-ink/10",
  best: "bg-sun-deep",
};

const RELIABILITY: Record<ReturnType<typeof confidenceWord>, string> = {
  very_high: tr("sunDetails.seguro"),
  high: tr("sunDetails.seguro"),
  medium: tr("sunDetails.bastante_seguro"),
  low: tr("sunDetails.depende_de_las_nubes"),
};

const windowText = (r: SunSearchResult) =>
  r.bestWindow ? `${formatClock(r.bestWindow.start)}–${formatClock(r.bestWindow.end)}` : "—";

const walkText = (r: SunSearchResult) =>
  r.walking ? `≈ ${r.walking.durationMinutes} min · ${fmtMeters(r.walking.distanceMeters)}` : "—";

function Row({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="min-w-0">
      <dt className="text-[11.5px] font-semibold uppercase tracking-[0.18em] text-ink-faint">{label}</dt>
      <dd className="mt-1 text-[13.5px] font-medium leading-snug text-ink">{children}</dd>
    </div>
  );
}

function ConfRow({
  label,
  sub,
  value,
  missing,
  strong,
}: {
  label: string;
  sub?: string;
  value: number;
  missing?: boolean;
  strong?: boolean;
}) {
  return (
    <div className="flex items-center justify-between gap-3 text-[13px]">
      <div className="min-w-0">
        <span className={cn("font-medium", strong ? "text-ink" : "text-ink-soft")}>{label}</span>
        {sub && <span className="ml-1.5 text-[12px] text-ink-faint">{sub}</span>}
      </div>
      <span className="shrink-0 text-ink">
        {missing ? <span className="text-ink-faint">{tr("sunDetails.sin_datos")}</span> : <ConfidenceBars value={value} />}
      </span>
    </div>
  );
}

const HeartIcon = ({ filled }: { filled: boolean }) => (
  <svg width="16" height="16" viewBox="0 0 24 24" fill={filled ? "currentColor" : "none"} stroke="currentColor" strokeWidth="1.5" strokeLinejoin="round" aria-hidden>
    <path d="M12 20s-7-4.4-7-10a4 4 0 0 1 7-2.6A4 4 0 0 1 19 10c0 5.6-7 10-7 10z" />
  </svg>
);
const ShareIcon = () => (
  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
    <path d="M12 15V4M8 8l4-4 4 4M5 13v6h14v-6" />
  </svg>
);
const RouteIcon = () => (
  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
    <circle cx="6" cy="18" r="2" />
    <circle cx="18" cy="6" r="2" />
    <path d="M8 18h6a3 3 0 0 0 0-6h-4a3 3 0 0 1 0-6h6" />
  </svg>
);

function ActionButton({
  children,
  onClick,
  href,
  active,
}: {
  children: ReactNode;
  onClick?(): void;
  href?: string;
  active?: boolean;
}) {
  const cls = cn(
    "flex items-center gap-1.5 rounded-full border px-3 py-2 text-[12.5px] font-medium transition-colors duration-300",
    active ? "border-sun/60 bg-sun-soft text-sun-deep" : "border-line text-ink-soft hover:bg-ink/[0.05] hover:text-ink"
  );
  if (href) {
    return (
      <a href={href} target="_blank" rel="noopener noreferrer" className={cls}>
        {children}
      </a>
    );
  }
  return (
    <button type="button" onClick={onClick} className={cls}>
      {children}
    </button>
  );
}

/** Comparación en dos columnas con otro resultado. */
function Compare({ a, b }: { a: SunSearchResult; b: SunSearchResult }) {
  const rows: Array<[string, string, string]> = [
    ["Sun Score", String(a.score), String(b.score)],
    [tr("sunDetails.sol_directo"), fmtMin(a.sunlightMinutes), fmtMin(b.sunlightMinutes)],
    [tr("sunDetails.mejor_ventana"), windowText(a), windowText(b)],
    [tr("sunDetails.nubes"), influenceWord(a.cloudInfluence), influenceWord(b.cloudInfluence)],
    [
      tr("sunDetails.sombra_urbana"),
      a.buildingsKnown ? fmtMin(a.urbanShadowMinutes) : "—",
      b.buildingsKnown ? fmtMin(b.urbanShadowMinutes) : "—",
    ],
    [
      tr("sunDetails.confianza"),
      CONFIDENCE_ES[confidenceWord(a.confidence)],
      CONFIDENCE_ES[confidenceWord(b.confidence)],
    ],
    [tr("sunDetails.a_pie"), walkText(a), walkText(b)],
  ];
  return (
    <div className="fts-fade-in mt-2.5 overflow-hidden rounded-2xl border border-line text-[12.5px]">
      <div className="grid grid-cols-[92px_1fr_1fr] gap-x-2 bg-ink/[0.04] px-3 py-2 font-semibold text-ink">
        <span />
        <span className="truncate">{a.place.name}</span>
        <span className="truncate">{b.place.name}</span>
      </div>
      {rows.map(([k, x, y]) => (
        <div key={k} className="grid grid-cols-[92px_1fr_1fr] gap-x-2 border-t border-line px-3 py-1.5">
          <span className="text-ink-faint">{k}</span>
          <span className="tabular-nums text-ink">{x}</span>
          <span className="tabular-nums text-ink">{y}</span>
        </div>
      ))}
    </div>
  );
}

interface Props {
  result: SunSearchResult;
  peers: SunSearchResult[];
  request: NormalizedSunRequest;
  saved: boolean;
  onToggleSave(): void;
  onShare(): void;
  onClose(): void;
  className?: string;
  /** Dentro de un panel contextual: sin cristal ni anchura propios. */
  embedded?: boolean;
  /** Confirmación de si el negocio tiene terraza (solo para resultados de tipo negocio). */
  onTerraceFeedback?(hasTerrace: boolean): void;
  /** Instante de referencia de la frase-respuesta (por defecto, cuando se abre la ficha). */
  now?: number;
}

/**
 * Detalle de un resultado: cuánto sol, cuándo, por qué gana y con qué confianza. Explica el
 * resultado en lugar de limitarse a dar una puntuación.
 */
export default function SunDetails({
  result,
  peers,
  request,
  saved,
  onToggleSave,
  onShare,
  onClose,
  className,
  embedded,
  onTerraceFeedback,
  now,
}: Props) {
  const [howOpen, setHowOpen] = useState(false);
  const [openedAt] = useState(() => Date.now());
  const answer = describeResult(result, now ?? openedAt, request.intent === "shade" ? "shade" : "sun");
  // Confort del momento que importa: ahora si cae dentro de la franja; si no, el mejor momento.
  const ref = now ?? openedAt;
  const inWindow = ref >= result.searchWindow.start && ref < result.searchWindow.end;
  const comfort = useComfort(inWindow ? ref : (result.bestWindow ?? result.searchWindow).start);
  const [feedback, setFeedback] = useState(() => venueFeedbackService.get(result.placeId));
  const meta = result.place.metadata ?? {};
  const openingHours = typeof meta.openingHours === "string" ? meta.openingHours : null;
  const [compareId, setCompareId] = useState<string | null>(null);
  const other = peers.find((p) => p.placeId === compareId && p.placeId !== result.placeId) ?? null;
  const others = peers.filter((p) => p.placeId !== result.placeId);
  const d = result.confidenceDetail;
  const R = result.rankingDetail;
  const D = result.requestedMinutes;

  /* Negocios: certeza de terraza + feedback de la persona. */
  const isVenue = meta.venue === true;
  const terrace = meta.terrace as TerraceCertainty | undefined;
  const license = (meta.licensed ?? null) as TerraceLicenseInfo | null;
  const terraceNote = license
    ? tr("sunDetails.se_calcula_el_sol_del", { p0: licenseSummary(license) })
    : terrace === "confirmed"
      ? tr("sunDetails.terraza_confirmada_en_openstreetmap_se")
      : terrace === "likely"
        ? tr("sunDetails.candidato_el_local_esta_en")
        : terrace === "none"
          ? tr("sunDetails.segun_los_datos_este_local")
          : tr("sunDetails.no_sabemos_si_este_local");

  const handleTerraceFeedback = (hasTerrace: boolean) => {
    venueFeedbackService.record({
      venue: {
        id: result.placeId,
        name: result.place.name,
        category: (meta.category as VenueCategory) ?? "cafe",
        latitude: result.place.latitude,
        longitude: result.place.longitude,
        terrace: "unknown",
        terraceSource: "",
      },
      hasTerrace,
      sunAtMoment: result.score >= 50,
    });
    setFeedback(venueFeedbackService.get(result.placeId));
    onTerraceFeedback?.(hasTerrace);
  };

  return (
    <section
      className={cn(
        !embedded &&
          "fts-glass fts-slide-in fts-scroll-y w-[min(calc(100vw-1.5rem),340px)] overflow-y-auto rounded-[26px] p-4 sm:p-5",
        className
      )}
    >
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <Caps>
            {PLACE_TYPE_LABEL[result.locationType].singular}
            {result.walking ? tr("sunResultCard.min_a_pie", { p0: result.walking.durationMinutes }) : ""}
          </Caps>
          <h2 className="mt-1.5 font-serif text-[24px] leading-[1.08] text-ink">{result.place.name}</h2>
        </div>
        <button
          type="button"
          onClick={onClose}
          aria-label={tr("sunDetails.cerrar")}
          className="-mr-1 -mt-1 flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-ink-soft transition-colors hover:bg-ink/5 hover:text-ink"
        >
          <CloseIcon />
        </button>
      </div>

      <div
        className={cn(
          "mt-3 rounded-2xl px-3.5 py-3",
          answer.state === "sun" || answer.state === "partial" ? "bg-sun-soft" : "bg-ink/[0.045]"
        )}
      >
        <p className="text-[18px] font-semibold leading-snug text-ink">{answer.headline}</p>
        {answer.detail && <p className="mt-1 text-[14px] leading-snug text-ink-soft">{answer.detail}</p>}
        {comfort && <p className="mt-1.5 text-[14px] leading-snug text-ink">{comfortSentence(comfort)}</p>}
      </div>

      <div className="mt-3 flex flex-wrap items-center gap-2">
        <ActionButton
          href={`https://www.google.com/maps/dir/?api=1&destination=${result.spot.latitude},${result.spot.longitude}&travelmode=walking`}
        >
          <RouteIcon />
          {tr("sunDetails.como_llegar")}
        </ActionButton>
        <ActionButton onClick={onToggleSave} active={saved}>
          <HeartIcon filled={saved} />
          {saved ? tr("sunDetails.guardado") : tr("sunDetails.guardar")}
        </ActionButton>
        <ActionButton onClick={onShare}>
          <ShareIcon />
          {tr("sunDetails.compartir")}
        </ActionButton>
      </div>

      <div className="mt-4">
        <WindowStrip
          windows={result.windows}
          start={request.startTime}
          end={request.endTime}
          highlight={result.searchWindow}
        />
        <p className="mt-2 text-[12px] leading-snug text-ink-faint">
          {tr("sunDetails.el_contorno_marca_la_mejor", { p0: fmtMin(D) })}
        </p>
      </div>

      <dl className="mt-3.5 grid grid-cols-2 gap-x-4 gap-y-3 rounded-2xl bg-ink/[0.035] px-3.5 py-3">
        <Row label={result.weatherAvailable ? tr("sunDetails.sol_directo") : tr("sunDetails.sol_posible")}>
          {fmtMin(result.sunlightMinutes)}
          <span className="font-normal text-ink-faint"> {tr("sunDetails.de", { p0: fmtMin(D) })}</span>
        </Row>
        <Row label={tr("sunDetails.mejor_ventana")}>{windowText(result)}</Row>
        <Row label={tr("searchProgress.edificios")}>
          {result.buildingsKnown
            ? result.urbanShadowMinutes <= 0.05 * D
              ? tr("sunDetails.casi_no_tapan")
              : fmtMin(result.urbanShadowMinutes)
            : tr("sunDetails.sin_verificar")}
        </Row>
        <Row label={tr("sunDetails.nubes")}>
          {result.weatherAvailable ? influenceWord(result.cloudInfluence) : tr("sunDetails.sin_datos")}
        </Row>
        <Row label={tr("sunDetails.fiabilidad")}>{RELIABILITY[confidenceWord(result.confidence)]}</Row>
        <Row label={tr("sunDetails.distancia")}>{walkText(result)}</Row>
        {openingHours && (
          <div className="col-span-2">
            <Row label={tr("sunDetails.horario_openstreetmap")}>{openingHours}</Row>
          </div>
        )}
      </dl>

      <div className="mt-4 border-t border-line pt-3.5">
        <Caps>{tr("sunDetails.por_que_este_lugar")}</Caps>
        <ul className="mt-2.5 space-y-1.5">
          {result.reasons.map((reason, i) => (
            <li key={i} className="flex gap-2.5 text-[13px] leading-snug text-ink-soft">
              <span
                aria-hidden
                className={cn(
                  "mt-px w-3 shrink-0 text-center font-semibold",
                  reason.tone === "plus" && "text-sun-deep",
                  reason.tone === "minus" && "text-ink-faint",
                  reason.tone === "neutral" && "text-ink-faint"
                )}
              >
                {reason.tone === "plus" ? "+" : reason.tone === "minus" ? "−" : "·"}
              </span>
              <span className={reason.tone === "plus" ? "text-ink" : undefined}>{reason.text}</span>
            </li>
          ))}
        </ul>
      </div>

      {result.narrative.length >= 3 && (
        <div className="mt-4 border-t border-line pt-3.5">
          <Caps>{tr("sunDetails.tu_franja")}</Caps>
          <ol className="mt-2.5 space-y-2">
            {result.narrative.map((e, i) => (
              <li key={i} className="flex items-center gap-3 text-[13px]">
                <span className="w-11 shrink-0 tabular-nums text-ink-faint">{formatClock(e.time)}</span>
                <i className={cn("block h-[8px] w-[8px] shrink-0 rounded-full", DOT[e.kind])} />
                <span className={cn("text-ink-soft", e.kind === "best" && "font-medium text-ink")}>{e.label}</span>
              </li>
            ))}
          </ol>
        </div>
      )}

      {/* Negocios: la gente confirma si de verdad hay mesas al sol. */}
      {isVenue && (
        <div className="mt-3.5 border-t border-line pt-3.5">
          <Caps>{tr("sunDetails.hay_mesas_al_sol_aqui")}</Caps>
          <p className="mt-2 text-[12.5px] leading-snug text-ink-soft">{terraceNote}</p>
          <div className="mt-2.5 flex flex-wrap gap-2">
            <button
              type="button"
              onClick={() => handleTerraceFeedback(true)}
              className={cn(
                "rounded-full border px-3 py-2 text-[12.5px] font-medium transition-colors duration-300",
                feedback?.hasTerrace
                  ? "border-sun/60 bg-sun-soft text-sun-deep"
                  : "border-line text-ink-soft hover:bg-ink/[0.05] hover:text-ink"
              )}
            >
              {tr("sunDetails.si_hay_terraza")}
            </button>
            <button
              type="button"
              onClick={() => handleTerraceFeedback(false)}
              className={cn(
                "rounded-full border px-3 py-2 text-[12.5px] font-medium transition-colors duration-300",
                feedback && !feedback.hasTerrace
                  ? "border-ink/40 bg-ink/[0.06] text-ink"
                  : "border-line text-ink-soft hover:bg-ink/[0.05] hover:text-ink"
              )}
            >
              {tr("sunDetails.no_hay_terraza")}
            </button>
          </div>
          {feedback && (
            <p className="mt-2 text-[12px] text-ink-faint">
              {tr("sunDetails.gracias_lo_tendremos_en_cuenta")}
            </p>
          )}
        </div>
      )}

      {others.length > 0 && (
        <div className="mt-3.5 border-t border-line pt-3.5">
          <Caps>{tr("sunDetails.comparar_con")}</Caps>
          <div className="mt-2 flex flex-wrap gap-1.5">
            {others.map((p) => (
              <button
                key={p.placeId}
                type="button"
                onClick={() => setCompareId(compareId === p.placeId ? null : p.placeId)}
                className={cn(
                  "max-w-[160px] truncate rounded-full px-3 py-1.5 text-[12.5px] font-medium transition-colors",
                  compareId === p.placeId ? "bg-ink text-paper" : "bg-ink/[0.05] text-ink-soft hover:text-ink"
                )}
              >
                {p.place.name}
              </button>
            ))}
          </div>
          {other && <Compare a={result} b={other} />}
        </div>
      )}

      <div className="mt-4 border-t border-line pt-1.5">
        <button
          type="button"
          onClick={() => setHowOpen((v) => !v)}
          aria-expanded={howOpen}
          className="flex min-h-[44px] w-full items-center justify-between gap-3 text-left text-[14px] font-semibold text-ink-soft outline-none transition-colors hover:text-ink focus-visible:ring-2 focus-visible:ring-sun/60"
        >
          <span>{tr("sunDetails.como_lo_sabemos")}</span>
          <span aria-hidden className="text-[18px] leading-none">{howOpen ? "−" : "+"}</span>
        </button>
        {howOpen && (
          <div className="fts-fade-in mt-2 space-y-4 pb-1">
      <div className="flex items-end justify-between gap-3">
        <div>
          <p className="font-serif text-[54px] leading-[0.82] tracking-tight text-ink">{result.score}</p>
          <Caps className="mt-2">Sun Score</Caps>
        </div>
        <div className="text-right">
          <p className="text-[13px] font-medium text-ink">
            {result.rank === 1 ? tr("sunResultCard.mejor_opcion") : tr("sunResultCard.opcion", { p0: result.rank })}
          </p>
          <p className="mt-1 max-w-[150px] text-[12px] leading-snug text-ink-soft">
            {result.weatherAvailable ? ORIGIN_ES[result.origin] : tr("sunResultCard.sin_datos_de_nubes")}
          </p>
        </div>
      </div>

      <div className="space-y-2 border-t border-line pt-3.5">
        <Caps>{tr("sunDetails.confianza")}</Caps>
        <ConfRow label={tr("sunDetails.geometria")} sub={tr("sunDetails.sol_y_edificios")} value={d.geometry} />
        <ConfRow label={tr("sunDetails.meteorologia")} sub={tr("sunDetails.escala_de_barrio")} value={d.weather} missing={!result.weatherAvailable} />
        <ConfRow label={tr("sunDetails.global")} value={d.overall} strong />
        <p className="pt-1 text-[12px] leading-snug text-ink-faint">
          {tr("sunDetails.la_sombra_de_los_edificios")}
        </p>
      </div>

          <div className="fts-fade-in mt-3 space-y-2">
            {result.scoreDetail.components.map((c) => (
              <div key={c.key} className="flex items-center gap-2.5 text-[12.5px] text-ink-soft">
                <span className="w-[116px] shrink-0">{c.label}</span>
                <span className="h-[3px] flex-1 overflow-hidden rounded-full bg-ink/10">
                  <i className="block h-full rounded-full bg-sun/80" style={{ width: `${Math.round(c.value * 100)}%` }} />
                </span>
                <span className="w-[60px] shrink-0 text-right tabular-nums text-ink-faint">
                  {Math.round(c.weight * 100)} % · +{c.contribution.toFixed(0)}
                </span>
              </div>
            ))}
            {result.scoreDetail.adjustments.map((a) => (
              <div key={a.key} className="flex justify-between text-[12.5px] text-ink-soft">
                <span>{a.label}</span>
                <span className="tabular-nums text-ink-faint">
                  {a.delta > 0 ? "+" : "−"}
                  {Math.abs(a.delta).toFixed(1)}
                </span>
              </div>
            ))}
            <p className="border-t border-line pt-2 text-[12px] leading-snug text-ink-faint">
              {tr("sunDetails.orden_de_los_resultados_sun")} {R.score}
              {R.confidenceAdjustment !== 0 && tr("sunDetails.confianza_2", { p0: R.confidenceAdjustment.toFixed(1) })}
              {R.distanceAdjustment !== 0 && tr("sunDetails.distancia_2", { p0: R.distanceAdjustment.toFixed(1) })}
              {!!R.placeAdjustment && tr("sunDetails.terraza_sin_confirmar", { p0: R.placeAdjustment.toFixed(1) })} ={" "}
              {R.value.toFixed(1)}{tr("sunDetails.un_resultado_de_confianza_baja")}
            </p>
          </div>
          </div>
        )}
      </div>
    </section>
  );
}
