import { PLACE_TYPE_LABEL } from "../../lib/placeTypes";
import type { NearbyLine } from "../../lib/placeAnswer";
import type { SunSearchResult } from "../../types";
import { cn } from "../../utils/cn";

/** Un sitio de «Cerca de ti ahora»: nombre, tipo, minutos a pie y hasta cuándo dura su sol (o sombra). */
export default function NearbyCard({
  result,
  line,
  active,
  onPick,
  className,
  showWalk = true,
}: {
  result: SunSearchResult;
  line: NearbyLine;
  active?: boolean;
  onPick(r: SunSearchResult): void;
  className?: string;
  /** Sin la ubicación de la persona, los minutos a pie no significan nada: se ocultan. */
  showWalk?: boolean;
}) {
  const type = PLACE_TYPE_LABEL[result.locationType]?.singular ?? "Lugar";
  const walk = showWalk && result.walking ? ` · ${result.walking.durationMinutes} min a pie` : "";
  return (
    <button
      type="button"
      onClick={() => onPick(result)}
      aria-current={active ? "true" : undefined}
      className={cn(
        "flex min-h-[64px] w-full items-start gap-3 rounded-2xl border px-3.5 py-3 text-left outline-none transition-colors duration-200 focus-visible:ring-2 focus-visible:ring-sun/60",
        active ? "border-sun/60 bg-sun-soft" : "border-line bg-paper/60 hover:bg-ink/[0.04]",
        className
      )}
    >
      <span
        aria-hidden
        className={cn(
          "mt-1.5 block h-2.5 w-2.5 shrink-0 rounded-full",
          line.tone === "sun" ? "bg-sun" : line.tone === "shade" ? "bg-shade" : "bg-ink/25"
        )}
      />
      <span className="min-w-0 flex-1">
        <span className="block truncate text-[15px] font-semibold leading-snug text-ink">{result.place.name}</span>
        <span className="mt-0.5 block truncate text-[13px] text-ink-soft">
          {type}
          {walk}
        </span>
        <span className="mt-1 block text-[13.5px] font-medium text-ink">{line.text}</span>
      </span>
    </button>
  );
}
