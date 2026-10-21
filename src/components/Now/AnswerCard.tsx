import type { SunAnswer, SunShadeMode } from "../../lib/answer";
import { cn } from "../../utils/cn";
import { CloseIcon, SunGlyph } from "../Icons";

interface Props {
  /** Frase-respuesta de lo que se ve (describeCity). */
  answer: SunAnswer;
  /** «Ahora · 18:46» o «Hoy · 17:30» cuando se explora otra hora. */
  timeLabel: string;
  /** Modo efectivo: decide la acción destacada. */
  mode: SunShadeMode;
  /** La app ha pasado a sombra por el calor (sin elección manual). */
  heatSuggested?: boolean;
  hasLocation: boolean;
  busy?: boolean;
  onNearby(mode: SunShadeMode): void;
  onMyPoint?(): void;
  /** Sin `onHide` no se muestra el botón de ocultar. */
  onHide?(): void;
  /** Móvil: ancho completo. */
  compact?: boolean;
  /** Dentro de otro panel (Ahora en escritorio): sin vidrio propio y a todo el ancho. */
  inline?: boolean;
}

const ACTION: Record<SunShadeMode, { label: string; short: string; glyph: "sun" | "shade" }> = {
  sun: { label: "Sol cerca de mí", short: "Sol cerca", glyph: "sun" },
  shade: { label: "Sombra cerca de mí", short: "Sombra cerca", glyph: "shade" },
};

/**
 * Tarjeta «Ahora»: responde antes de que haya que mirar el mapa. Una frase con hora, el contexto
 * en una línea y las dos acciones que más se usan (sol o sombra cerca). La destacada sigue el modo
 * de la app (sombra cuando hace calor).
 */
export default function AnswerCard({
  answer,
  timeLabel,
  mode,
  heatSuggested,
  hasLocation,
  busy,
  onNearby,
  onMyPoint,
  onHide,
  compact,
  inline,
}: Props) {
  const order: SunShadeMode[] = mode === "shade" ? ["shade", "sun"] : ["sun", "shade"];
  const night = answer.state === "night";

  return (
    <section
      aria-label="Ahora"
      className={cn(
        "pointer-events-auto rounded-[22px]",
        inline
          ? "w-full bg-ink/[0.035] p-4"
          : cn(
              "fts-glass fts-pop-in p-4",
              // En móvil deja libre la columna de controles del mapa (derecha).
              compact ? "w-[calc(100vw-5rem)] max-w-[420px]" : "w-[336px]"
            )
      )}
    >
      <div className={cn("flex items-start justify-between gap-2", !onHide && "mb-2")}>
        <p className="fts-caps !text-[12px]">{timeLabel}</p>
        {onHide && (
          <button
            type="button"
            onClick={onHide}
            aria-label="Ocultar la tarjeta"
            className="-mr-2.5 -mt-2.5 flex h-11 w-11 shrink-0 items-center justify-center rounded-full text-ink-soft transition-colors hover:bg-ink/5 hover:text-ink"
          >
            <CloseIcon />
          </button>
        )}
      </div>

      <div className="-mt-1 flex items-start gap-3">
        <SunGlyph state={answer.state} size={30} className="mt-0.5 shrink-0" />
        <div className="min-w-0">
          <p className="text-[17px] font-semibold leading-snug text-ink">{answer.headline}</p>
          {answer.detail && <p className="mt-1 text-[14px] leading-snug text-ink-soft">{answer.detail}</p>}
          {heatSuggested && !night && (
            <p className="mt-1 text-[13px] leading-snug text-shade">Hace calor: te proponemos sombra.</p>
          )}
        </div>
      </div>

      {!night && (
        <div className="mt-3.5 flex flex-wrap gap-2">
          {order.map((m, i) => (
            <button
              key={m}
              type="button"
              disabled={busy}
              onClick={() => onNearby(m)}
              className={cn(
                "flex h-11 items-center gap-2 rounded-full px-4 text-[14px] font-semibold outline-none transition-colors duration-200 focus-visible:ring-2 focus-visible:ring-sun/60 disabled:opacity-60",
                i === 0
                  ? m === "shade"
                    ? "bg-shade text-white hover:brightness-110"
                    : "bg-sun text-ink hover:brightness-105"
                  : "border border-line bg-paper/50 text-ink hover:bg-ink/[0.05]"
              )}
            >
              <SunGlyph state={ACTION[m].glyph} size={18} className="shrink-0" />
              {compact ? ACTION[m].short : ACTION[m].label}
            </button>
          ))}
        </div>
      )}

      {hasLocation && onMyPoint && (
        <button
          type="button"
          onClick={onMyPoint}
          className="mt-2 -ml-1 rounded-full px-1 py-2 text-[13px] font-semibold text-sun-deep underline-offset-4 outline-none hover:underline focus-visible:ring-2 focus-visible:ring-sun/60"
        >
          Ver el sol en mi ubicación
        </button>
      )}
    </section>
  );
}
