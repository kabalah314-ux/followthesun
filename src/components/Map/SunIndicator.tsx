import { memo, useId } from "react";
import { clamp } from "../../lib/coordinates";
import { compassLabel } from "../../services/solarService";
import { cn } from "../../utils/cn";

/**
 * SunIndicator — pequeño dial solar dibujado con SVG/CSS (sin emojis).
 *
 * Un círculo luminoso se mueve sobre un diagrama polar: el ángulo es el azimut y el radio la
 * elevación (en el centro, el sol está en lo más alto). Bajo el horizonte se apaga y sale del
 * anillo. El dial gira con el mapa, así que su norte siempre coincide con el norte real.
 */

interface Props {
  azimuthDeg: number;
  altitudeDeg: number;
  /** Rotación del mapa en grados. */
  bearing: number;
  /** "capsule": dial + lectura · "dial": solo el dial (móvil). */
  variant?: "capsule" | "dial";
  className?: string;
}

const C = 32;
const R = 22;

function Dial({ azimuthDeg, altitudeDeg, bearing }: Omit<Props, "variant" | "className">) {
  const uid = useId().replace(/[^a-zA-Z0-9]/g, "");
  const up = altitudeDeg >= -0.5;
  const a = ((azimuthDeg - bearing) * Math.PI) / 180;
  const r = up ? R * (1 - clamp(altitudeDeg, 0, 90) / 90) : R + clamp(-altitudeDeg / 3, 3, 7);
  const x = C + r * Math.sin(a);
  const y = C - r * Math.cos(a);

  return (
    <svg viewBox="0 0 64 64" className="h-full w-full" aria-hidden>
      <defs>
        <radialGradient id={`${uid}-glow`} cx="50%" cy="50%" r="50%">
          <stop offset="0" stopColor="#ffc15e" stopOpacity="0.85" />
          <stop offset="1" stopColor="#ffc15e" stopOpacity="0" />
        </radialGradient>
        <radialGradient id={`${uid}-core`} cx="36%" cy="32%" r="75%">
          <stop offset="0" stopColor="#fff1c9" />
          <stop offset="1" stopColor="#e8923a" />
        </radialGradient>
      </defs>

      {/* horizonte y mitad de elevación */}
      <circle cx={C} cy={C} r={R} fill="none" stroke="currentColor" strokeWidth="1" strokeDasharray="1.5 3.2" opacity="0.5" />
      <circle cx={C} cy={C} r={R / 2} fill="none" stroke="currentColor" strokeWidth="0.8" opacity="0.18" />

      {/* norte (rota con el mapa) */}
      <g style={{ transformOrigin: "32px 32px", transform: `rotate(${-bearing}deg)`, transition: "transform 140ms linear" }}>
        <path d="M32 4.6 L34.4 9.4 H29.6 Z" fill="currentColor" opacity="0.75" />
        <line x1={C} y1={C - R + 1} x2={C} y2={C + R - 1} stroke="currentColor" strokeWidth="0.7" opacity="0.14" />
        <line x1={C - R + 1} y1={C} x2={C + R - 1} y2={C} stroke="currentColor" strokeWidth="0.7" opacity="0.14" />
      </g>

      {/* sol */}
      <g
        style={{
          transform: `translate(${x}px, ${y}px)`,
          transition: "transform 420ms cubic-bezier(0.22, 1, 0.36, 1), opacity 700ms ease",
          opacity: up ? 1 : 0.55,
        }}
      >
        {up && <circle r="13" fill={`url(#${uid}-glow)`} className="fts-breathe" />}
        <circle r="4.8" fill={up ? `url(#${uid}-core)` : "currentColor"} opacity={up ? 1 : 0.6} />
        {up && <circle r="4.8" fill="none" stroke="rgba(255,255,255,0.9)" strokeWidth="1.2" />}
      </g>
    </svg>
  );
}

function SunIndicatorBase({ azimuthDeg, altitudeDeg, bearing, variant = "capsule", className }: Props) {
  const up = altitudeDeg >= -0.5;

  if (variant === "dial") {
    return (
      <div
        className={cn("fts-glass fts-rise h-[54px] w-[54px] rounded-full p-1 text-ink-soft", className)}
        style={{ animationDelay: "1000ms" }}
        role="img"
        aria-label={`Sol a ${Math.round(altitudeDeg)} grados, ${compassLabel(azimuthDeg)}`}
      >
        <Dial azimuthDeg={azimuthDeg} altitudeDeg={altitudeDeg} bearing={bearing} />
      </div>
    );
  }

  return (
    <div
      className={cn("fts-glass fts-rise inline-flex items-center gap-3 rounded-full py-1.5 pl-1.5 pr-5 text-ink-soft", className)}
      style={{ animationDelay: "1000ms" }}
      role="img"
      aria-label={up ? `Sol a ${Math.round(altitudeDeg)} grados, ${compassLabel(azimuthDeg)}` : "Sol bajo el horizonte"}
    >
      <div className="h-[56px] w-[56px] shrink-0">
        <Dial azimuthDeg={azimuthDeg} altitudeDeg={altitudeDeg} bearing={bearing} />
      </div>
      <div className="leading-none">
        <p className="fts-caps">Posición solar</p>
        <p className="mt-2 font-serif text-[20px] tabular-nums text-ink">
          {up ? (
            <>
              {Math.round(altitudeDeg)}°<span className="text-ink-soft"> · {compassLabel(azimuthDeg)}</span>
            </>
          ) : (
            <span className="text-[16px] text-ink-soft">Bajo el horizonte</span>
          )}
        </p>
      </div>
    </div>
  );
}

export default memo(SunIndicatorBase);
