import { useState, type ReactNode } from "react";
import {
  CONFIDENCE_ES,
  confidenceWord,
  fmtMeters,
  fmtMin,
  influenceWord,
} from "../../lib/formatSun";
import { PLACE_TYPE_LABEL } from "../../lib/placeTypes";
import { formatClock } from "../../services/timeService";
import type { NormalizedSunRequest, SunSearchResult, SunlightOrigin, SunWindowKind } from "../../types";
import { cn } from "../../utils/cn";
import { CloseIcon } from "../Icons";
import { Caps, ConfidenceBars } from "./ui";
import WindowStrip from "./WindowStrip";
import { reliabilityWord, windowPhrase } from "./ResultCards";

const ORIGIN_ES: Record<SunlightOrigin, string> = {
  observed: "Basado en observación satelital",
  forecast: "Basado en previsión",
  estimated: "Estimación",
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

const windowText = (r: SunSearchResult) =>
  r.bestWindow ? `${formatClock(r.bestWindow.start)}–${formatClock(r.bestWindow.end)}` : "—";

const walkText = (r: SunSearchResult) =>
  r.walking ? `≈ ${r.walking.durationMinutes} min · ${fmtMeters(r.walking.distanceMeters)}` : "—";

function Row({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="min-w-0">
      <dt className="text-[9px] font-semibold uppercase tracking-[0.18em] text-ink-faint">{label}</dt>
      <dd className="mt-1 text-[12.5px] font-medium leading-snug text-ink">{children}</dd>
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
    <div className="flex items-center justify-between gap-3 text-[12px]">
      <div className="min-w-0">
        <span className={cn("font-medium", strong ? "text-ink" : "text-ink-soft")}>{label}</span>
        {sub && <span className="ml-1.5 text-[10.5px] text-ink-faint">{sub}</span>}
      </div>
      <span className="shrink-0 text-ink">
        {missing ? <span className="text-ink-faint">Sin datos</span> : <ConfidenceBars value={value} />}
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
    "flex items-center gap-1.5 rounded-full border px-3 py-2 text-[11px] font-medium transition-colors duration-300",
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
    ["Sol directo", fmtMin(a.sunlightMinutes), fmtMin(b.sunlightMinutes)],
    ["Mejor ventana", windowText(a), windowText(b)],
    ["Nubes", influenceWord(a.cloudInfluence), influenceWord(b.cloudInfluence)],
    [
      "Sombra urbana",
      a.buildingsKnown ? fmtMin(a.urbanShadowMinutes) : "—",
      b.buildingsKnown ? fmtMin(b.urbanShadowMinutes) : "—",
    ],
    [
      "Confianza",
      CONFIDENCE_ES[confidenceWord(a.confidence)],
      CONFIDENCE_ES[confidenceWord(b.confidence)],
    ],
    ["A pie", walkText(a), walkText(b)],
  ];
  return (
    <div className="fts-fade-in mt-2.5 overflow-hidden rounded-2xl border border-line text-[11.5px]">
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
}

/** Cifras clave del resultado. */
function MetricsGrid({ result, shade }: { result: SunSearchResult; shade: boolean }) {
  const D = result.requestedMinutes;
  return (
    <>
      <dl className="mt-3.5 grid grid-cols-2 gap-x-4 gap-y-3 rounded-2xl bg-ink/[0.035] px-3.5 py-3">
        <Row label={shade ? "Sombra" : result.weatherAvailable ? "Sol directo" : "Sol posible"}>
          {fmtMin(result.sunlightMinutes)}
          <span className="font-normal text-ink-faint"> de {fmtMin(D)}</span>
        </Row>
        <Row label="Mejor ventana">{windowText(result)}</Row>
        <Row label="Sombra urbana">
          {result.buildingsKnown
            ? result.urbanShadowMinutes <= 0.05 * D
              ? "Mínima"
              : fmtMin(result.urbanShadowMinutes)
            : "Sin verificar"}
        </Row>
        <Row label="Influencia de nubes">
          {result.weatherAvailable ? influenceWord(result.cloudInfluence) : "Sin datos"}
        </Row>
        <Row label="Confianza">
          <ConfidenceBars value={result.confidence} />
        </Row>
        <Row label="Distancia">{walkText(result)}</Row>
      </dl>
    </>
  );
}

/** Confianza por componente (geometría, meteorología, global). */
function ConfidenceSection({ result }: { result: SunSearchResult }) {
  const d = result.confidenceDetail;
  return (
    <>
      <div className="mt-4 space-y-2 border-t border-line pt-3.5">
        <Caps>Confianza</Caps>
        <ConfRow label="Geometría" sub="sol y edificios" value={d.geometry} />
        <ConfRow label="Meteorología" sub="escala de barrio" value={d.weather} missing={!result.weatherAvailable} />
        <ConfRow label="Global" value={d.overall} strong />
        <p className="pt-1 text-[10.5px] leading-snug text-ink-faint">
          La sombra de los edificios es de precisión de calle; las nubes (satélite y previsión) tienen
          una resolución de kilómetros: indican la luz de la zona, no la de este rincón exacto.
        </p>
      </div>
    </>
  );
}

/** Por qué gana este lugar. */
function ReasonsList({ result }: { result: SunSearchResult }) {
  return (
    <>
      <div className="mt-4 border-t border-line pt-3.5">
        <Caps>¿Por qué este lugar?</Caps>
        <ul className="mt-2.5 space-y-1.5">
          {result.reasons.map((reason) => (
            <li key={`${reason.tone}:${reason.text}`} className="flex gap-2.5 text-[12px] leading-snug text-ink-soft">
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
    </>
  );
}

/** La franja contada paso a paso (solo si aporta). */
function Narrative({ result }: { result: SunSearchResult }) {
  return (
    <>
      {result.narrative.length >= 3 && (
        <div className="mt-4 border-t border-line pt-3.5">
          <Caps>Tu franja</Caps>
          <ol className="mt-2.5 space-y-2">
            {result.narrative.map((e) => (
              <li key={`${e.time}:${e.kind}:${e.label}`} className="flex items-center gap-3 text-[12px]">
                <span className="w-11 shrink-0 tabular-nums text-ink-faint">{formatClock(e.time)}</span>
                <i className={cn("block h-[8px] w-[8px] shrink-0 rounded-full", DOT[e.kind])} />
                <span className={cn("text-ink-soft", e.kind === "best" && "font-medium text-ink")}>{e.label}</span>
              </li>
            ))}
          </ol>
        </div>
      )}
    </>
  );
}

/** Desglose de la puntuación, plegado por defecto. */
function HowItsCalculated({ result }: { result: SunSearchResult }) {
  const [howOpen, setHowOpen] = useState(false);
  const R = result.rankingDetail;
  return (
    <>
      <div className="mt-4 border-t border-line pt-3">
        <button
          type="button"
          onClick={() => setHowOpen((v) => !v)}
          aria-expanded={howOpen}
          className="text-[9.5px] font-semibold uppercase tracking-[0.18em] text-ink-faint transition-colors hover:text-ink"
        >
          {howOpen ? "Ocultar cálculo" : "Cómo se calcula"}
        </button>
        {howOpen && (
          <div className="fts-fade-in mt-3 space-y-2">
            {result.scoreDetail.components.map((c) => (
              <div key={c.key} className="flex items-center gap-2.5 text-[11px] text-ink-soft">
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
              <div key={a.key} className="flex justify-between text-[11px] text-ink-soft">
                <span>{a.label}</span>
                <span className="tabular-nums text-ink-faint">
                  {a.delta > 0 ? "+" : "−"}
                  {Math.abs(a.delta).toFixed(1)}
                </span>
              </div>
            ))}
            <p className="border-t border-line pt-2 text-[10.5px] leading-snug text-ink-faint">
              Orden de los resultados: Sun Score {R.score}
              {R.confidenceAdjustment !== 0 && ` · confianza ${R.confidenceAdjustment.toFixed(1)}`}
              {R.distanceAdjustment !== 0 && ` · distancia ${R.distanceAdjustment.toFixed(1)}`} ={" "}
              {R.value.toFixed(1)}. Un resultado de confianza baja no gana a otro casi igual de confianza
              alta.
            </p>
          </div>
        )}
      </div>
    </>
  );
}

/** Comparar con otro resultado de la lista. */
function ComparePicker({ result, peers }: { result: SunSearchResult; peers: SunSearchResult[] }) {
  const [compareId, setCompareId] = useState<string | null>(null);
  const other = peers.find((p) => p.placeId === compareId && p.placeId !== result.placeId) ?? null;
  const others = peers.filter((p) => p.placeId !== result.placeId);
  return (
    <>
      {others.length > 0 && (
        <div className="mt-3.5 border-t border-line pt-3.5">
          <Caps>Comparar con</Caps>
          <div className="mt-2 flex flex-wrap gap-1.5">
            {others.map((p) => (
              <button
                key={p.placeId}
                type="button"
                onClick={() => setCompareId(compareId === p.placeId ? null : p.placeId)}
                className={cn(
                  "max-w-[160px] truncate rounded-full px-3 py-1.5 text-[11px] font-medium transition-colors",
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
    </>
  );
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
}: Props) {
  const D = result.requestedMinutes;
  const shade = request.intent === "shade";
  const tip = result.place.metadata?.tip as string | undefined;
  const barrio = result.place.metadata?.barrio as string | undefined;

  return (
    <section
      className={cn(
        "fts-glass fts-slide-in fts-scroll-y w-[min(calc(100vw-1.5rem),340px)] overflow-y-auto rounded-[26px] p-4 sm:p-5",
        className
      )}
    >
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <Caps>
            {PLACE_TYPE_LABEL[result.locationType].singular}
            {barrio ? ` · ${barrio}` : ""}
            {result.walking ? ` · ≈ ${result.walking.durationMinutes} min a pie` : ""}
          </Caps>
          <h2 className="mt-1.5 font-serif text-[24px] leading-[1.08] text-ink">{result.place.name}</h2>
        </div>
        <button
          type="button"
          onClick={onClose}
          aria-label="Cerrar"
          className="-mr-1 -mt-1 flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-ink-soft transition-colors hover:bg-ink/5 hover:text-ink"
        >
          <CloseIcon />
        </button>
      </div>

      <div className="mt-4 flex items-end justify-between gap-3">
        <div>
          <p className="font-serif text-[26px] leading-[1.05] tracking-tight text-ink" data-testid="details-window">
            {windowPhrase(result, shade)}
          </p>
          <Caps className="mt-2">Fiabilidad {reliabilityWord(result.confidence).toLowerCase()}</Caps>
        </div>
        <div className="text-right">
          <p className="text-[12px] font-medium text-ink">
            {result.rank === 1 ? "Mejor opción" : `Opción ${result.rank}`}
          </p>
          <p className="mt-1 max-w-[150px] text-[10.5px] leading-snug text-ink-soft">
            {result.weatherAvailable ? ORIGIN_ES[result.origin] : "Sin datos de nubes"}
          </p>
        </div>
      </div>

      {tip && <p className="mt-3 text-[12px] italic leading-snug text-ink-soft">{tip}</p>}

      <div className="mt-4">
        <WindowStrip
          windows={result.windows}
          start={request.startTime}
          end={request.endTime}
          highlight={result.searchWindow}
        />
        <p className="mt-2 text-[10.5px] leading-snug text-ink-faint">
          El contorno marca la mejor ventana de {fmtMin(D)} dentro de tu franja.
        </p>
      </div>

      <MetricsGrid result={result} shade={shade} />
      <ConfidenceSection result={result} />
      <ReasonsList result={result} />
      <Narrative result={result} />
      <HowItsCalculated result={result} />
      <ComparePicker result={result} peers={peers} />

      <div className="mt-4 flex flex-wrap items-center gap-2 border-t border-line pt-3.5">
        <ActionButton onClick={onToggleSave} active={saved}>
          <HeartIcon filled={saved} />
          {saved ? "Guardado" : "Guardar"}
        </ActionButton>
        <ActionButton onClick={onShare}>
          <ShareIcon />
          Compartir
        </ActionButton>
        <ActionButton
          href={`https://www.google.com/maps/dir/?api=1&destination=${result.spot.latitude},${result.spot.longitude}&travelmode=walking`}
        >
          <RouteIcon />
          Cómo llegar
        </ActionButton>
      </div>
    </section>
  );
}
