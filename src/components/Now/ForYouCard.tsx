import { useState } from "react";
import { useComfort } from "../../hooks/useComfort";
import { comfortShort } from "../../lib/comfort";
import { whyParts } from "../../lib/explore";
import { nearbyLine } from "../../lib/placeAnswer";
import { PLACE_TYPE_LABEL } from "../../lib/placeTypes";
import type { SunShadeMode } from "../../lib/answer";
import type { SunSearchResult } from "../../types";
import { cn } from "../../utils/cn";
import { tr } from "../../i18n";

/**
 * Tarjeta de «Para ti»: el número del pin en el mapa, el nombre y el porqué en una línea
 * («Sol hasta las 17:40 · 6 min a pie · 21 °C al sol · terraza con 8 mesas»).
 */
export default function ForYouCard({
  result,
  rank,
  mode,
  now,
  sunset,
  showWalk,
  active,
  extra,
  onPick,
  onHover,
}: {
  result: SunSearchResult;
  rank: number;
  mode: SunShadeMode;
  now: number;
  sunset?: number;
  showWalk: boolean;
  active: boolean;
  /** Un dato más de la zona («lavabo a 120 m»). */
  extra?: string | null;
  onPick(r: SunSearchResult): void;
  onHover?(id: string | null): void;
}) {
  const [openedAt] = useState(() => Date.now());
  const ref = Math.max(openedAt, result.searchWindow.start);
  const comfort = useComfort(ref);
  const tone = nearbyLine(result, now, mode, { sunset }).tone;
  const parts = whyParts(result, { now, mode, sunset, showWalk, comfort: comfort ? comfortShort(comfort, mode) : null });
  if (extra) parts.push(extra);
  const type = PLACE_TYPE_LABEL[result.locationType]?.singular ?? tr("nearbyCard.lugar");
  return (
    <button
      type="button"
      onClick={() => onPick(result)}
      onMouseEnter={() => onHover?.(result.placeId)}
      onMouseLeave={() => onHover?.(null)}
      onFocus={() => onHover?.(result.placeId)}
      onBlur={() => onHover?.(null)}
      aria-current={active ? "true" : undefined}
      aria-label={`${rank}. ${result.place.name}, ${type}. ${parts.join(", ")}`}
      className={cn(
        "flex min-h-[76px] w-full items-start gap-3 rounded-[18px] border px-3.5 py-3 text-left outline-none transition-colors duration-200 focus-visible:ring-2 focus-visible:ring-sun/60",
        active ? "border-sun/60 bg-sun-soft" : "border-line bg-paper/60 hover:bg-ink/[0.04]"
      )}
    >
      <span
        aria-hidden
        className={cn(
          "mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-[13px] font-bold",
          tone === "sun" ? "bg-sun text-ink" : tone === "shade" ? "bg-shade text-white" : "bg-ink/15 text-ink"
        )}
      >
        {rank}
      </span>
      <span className="min-w-0 flex-1">
        <span className="flex items-baseline justify-between gap-2">
          <span className="truncate text-[15.5px] font-semibold leading-snug text-ink">{result.place.name}</span>
          <span className="shrink-0 text-[12px] text-ink-faint">{type}</span>
        </span>
        <span className="mt-1 block text-[13.5px] leading-snug">
          <span className="font-semibold text-ink">{parts[0]}</span>
          {parts.length > 1 && <span className="text-ink-soft"> · {parts.slice(1).join(" · ")}</span>}
        </span>
      </span>
    </button>
  );
}
