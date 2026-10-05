import type { SunState } from "../types";

interface IconProps {
  size?: number;
  className?: string;
}

const base = (size: number) => ({
  width: size,
  height: size,
  viewBox: "0 0 24 24",
  fill: "none",
  stroke: "currentColor",
  strokeWidth: 1.5,
  strokeLinecap: "round" as const,
  strokeLinejoin: "round" as const,
  "aria-hidden": true,
});

export const PlusIcon = ({ size = 18, className }: IconProps) => (
  <svg {...base(size)} className={className}>
    <path d="M12 5v14M5 12h14" />
  </svg>
);

export const MinusIcon = ({ size = 18, className }: IconProps) => (
  <svg {...base(size)} className={className}>
    <path d="M5 12h14" />
  </svg>
);

export const LocateIcon = ({ size = 18, className }: IconProps) => (
  <svg {...base(size)} className={className}>
    <circle cx="12" cy="12" r="3.2" />
    <path d="M12 3v3M12 18v3M3 12h3M18 12h3" />
    <circle cx="12" cy="12" r="7.5" opacity="0.45" />
  </svg>
);

export const BuildingsIcon = ({ size = 18, className }: IconProps) => (
  <svg {...base(size)} className={className}>
    <path d="M4 20V9l5-2.5V20" />
    <path d="M9 20V5l6 2.5V20" />
    <path d="M15 20v-9l5 2v7" />
    <path d="M3 20h18" />
  </svg>
);

export const SunPathIcon = ({ size = 18, className }: IconProps) => (
  <svg {...base(size)} className={className}>
    <path d="M3 18h18" />
    <path d="M5 18a7 7 0 0 1 14 0" strokeDasharray="1.2 2.6" opacity="0.7" />
    <circle cx="8.2" cy="12.6" r="2.3" fill="currentColor" stroke="none" />
  </svg>
);

export const CloseIcon = ({ size = 16, className }: IconProps) => (
  <svg {...base(size)} className={className}>
    <path d="M6 6l12 12M18 6L6 18" />
  </svg>
);

export const PlayIcon = ({ size = 14, className }: IconProps) => (
  <svg width={size} height={size} viewBox="0 0 24 24" className={className} aria-hidden>
    <path d="M8 5.5v13a.8.8 0 0 0 1.2.7l10.2-6.5a.8.8 0 0 0 0-1.4L9.2 4.8A.8.8 0 0 0 8 5.5z" fill="currentColor" />
  </svg>
);

export const PauseIcon = ({ size = 14, className }: IconProps) => (
  <svg width={size} height={size} viewBox="0 0 24 24" className={className} aria-hidden>
    <rect x="6.5" y="5" width="3.8" height="14" rx="1.2" fill="currentColor" />
    <rect x="13.7" y="5" width="3.8" height="14" rx="1.2" fill="currentColor" />
  </svg>
);

export const ArrowIcon = ({ size = 14, className }: IconProps) => (
  <svg {...base(size)} className={className}>
    <path d="M5 12h14M13 6l6 6-6 6" />
  </svg>
);

/** Brújula: la aguja apunta al norte real aunque el mapa esté rotado. */
export const CompassIcon = ({
  size = 20,
  className,
  bearing = 0,
}: IconProps & { bearing?: number }) => (
  <svg
    width={size}
    height={size}
    viewBox="0 0 24 24"
    className={className}
    aria-hidden="true"
    style={{ transform: `rotate(${-bearing}deg)`, transition: "transform 140ms linear" }}
  >
    <circle cx="12" cy="12" r="9" fill="none" stroke="currentColor" strokeWidth="1.3" opacity="0.35" />
    <path d="M12 4.2 L14.9 12 H9.1 Z" fill="var(--sun-deep)" />
    <path d="M12 19.8 L9.1 12 H14.9 Z" fill="currentColor" opacity="0.4" />
  </svg>
);

/**
 * Glifo de estado de luz. Discos y anillos en lugar de iconos meteorológicos:
 *  sun = disco lleno · partial = disco a medias · cloud = disco velado · shade = disco apagado · night = creciente.
 */
export function SunGlyph({
  state,
  size = 28,
  className,
}: {
  state: SunState | "night";
  size?: number;
  className?: string;
}) {
  const ring = <circle cx="16" cy="16" r="12" strokeWidth="1.2" fill="none" opacity="0.4" />;
  const color =
    state === "sun" || state === "partial"
      ? "var(--sun)"
      : state === "shade"
        ? "var(--shade)"
        : "var(--ink-soft)";

  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 32 32"
      className={className}
      style={{ color }}
      aria-hidden
    >
      {state === "sun" && (
        <>
          <circle cx="16" cy="16" r="12" fill="currentColor" opacity="0.14" />
          <circle cx="16" cy="16" r="12" stroke="currentColor" strokeWidth="1.2" fill="none" opacity="0.45" />
          <circle cx="16" cy="16" r="6.2" fill="currentColor" />
        </>
      )}
      {state === "partial" && (
        <>
          {ring}
          <circle cx="16" cy="16" r="6.2" stroke="currentColor" strokeWidth="1.4" fill="none" />
          <path d="M16 9.8a6.2 6.2 0 0 0 0 12.4z" fill="currentColor" />
        </>
      )}
      {state === "cloud" && (
        <>
          {ring}
          <circle cx="16" cy="16" r="6.2" fill="currentColor" opacity="0.3" />
          <path
            d="M10.2 17.6h11.6M11.6 20.4h8.8"
            stroke="currentColor"
            strokeWidth="1.3"
            strokeLinecap="round"
            opacity="0.8"
          />
        </>
      )}
      {state === "shade" && (
        <>
          {ring}
          <circle cx="16" cy="16" r="6.2" fill="currentColor" opacity="0.85" />
        </>
      )}
      {state === "night" && (
        <>
          {ring}
          <path
            d="M19.6 9.4a7 7 0 1 0 3 11.6 6 6 0 0 1-3-11.6z"
            fill="currentColor"
            opacity="0.9"
          />
        </>
      )}
    </svg>
  );
}
