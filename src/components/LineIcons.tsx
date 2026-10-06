import type { ReactNode } from "react";

/**
 * Iconos lineales de Follow the Sun: trazo fino (1,5), geométricos, viewBox 24×24, misma API en
 * todos. Propios (en lugar de una librería) para no cargar miles de módulos en el empaquetado.
 */

export interface LineIconProps {
  size?: number;
  className?: string;
  /** Relleno (p. ej. corazón de «guardado»). */
  fill?: string;
  strokeWidth?: number;
  /** Compatibilidad con la API de librerías de iconos; el trazo ya es absoluto. */
  absoluteStrokeWidth?: boolean;
}

function Svg({ size = 20, className, fill = "none", strokeWidth = 1.5, children }: LineIconProps & { children: ReactNode }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill={fill}
      stroke="currentColor"
      strokeWidth={(strokeWidth * 24) / size}
      strokeLinecap="round"
      strokeLinejoin="round"
      className={className}
      aria-hidden="true"
    >
      {children}
    </svg>
  );
}

export const Compass = (p: LineIconProps) => (
  <Svg {...p}>
    <circle cx="12" cy="12" r="9.5" />
    <path d="M15.8 8.2l-2 5.6-5.6 2 2-5.6 5.6-2z" />
  </Svg>
);

export const CalendarClock = (p: LineIconProps) => (
  <Svg {...p}>
    <path d="M20.5 9V6.5a2 2 0 0 0-2-2h-13a2 2 0 0 0-2 2v13a2 2 0 0 0 2 2H9" />
    <path d="M8 2.5v4M16 2.5v4M3.5 10h6" />
    <circle cx="16.5" cy="16.5" r="5" />
    <path d="M16.5 14.4v2.3l1.5 1" />
  </Svg>
);

export const Heart = (p: LineIconProps) => (
  <Svg {...p}>
    <path d="M12 20.5s-8.5-5-8.5-11.2A4.8 4.8 0 0 1 12 6.4a4.8 4.8 0 0 1 8.5 2.9c0 6.2-8.5 11.2-8.5 11.2z" />
  </Svg>
);

export const Info = (p: LineIconProps) => (
  <Svg {...p}>
    <circle cx="12" cy="12" r="9.5" />
    <path d="M12 16.5v-5M12 8h.01" />
  </Svg>
);

export const MapPin = (p: LineIconProps) => (
  <Svg {...p}>
    <path d="M19.5 10c0 5.5-7.5 11.5-7.5 11.5S4.5 15.5 4.5 10a7.5 7.5 0 0 1 15 0z" />
    <circle cx="12" cy="10" r="2.7" />
  </Svg>
);

export const Settings = (p: LineIconProps) => (
  <Svg {...p}>
    <path d="M20.5 7H11M13 17H3.5" />
    <circle cx="7.5" cy="7" r="3" />
    <circle cx="16.5" cy="17" r="3" />
  </Svg>
);

export const PanelLeftClose = (p: LineIconProps) => (
  <Svg {...p}>
    <rect x="3.5" y="3.5" width="17" height="17" rx="2.5" />
    <path d="M9 3.5v17M16 9l-3 3 3 3" />
  </Svg>
);

export const PanelLeftOpen = (p: LineIconProps) => (
  <Svg {...p}>
    <rect x="3.5" y="3.5" width="17" height="17" rx="2.5" />
    <path d="M9 3.5v17M13.5 9l3 3-3 3" />
  </Svg>
);

export const Ellipsis = (p: LineIconProps) => (
  <Svg {...p}>
    <circle cx="5.5" cy="12" r="0.9" fill="currentColor" />
    <circle cx="12" cy="12" r="0.9" fill="currentColor" />
    <circle cx="18.5" cy="12" r="0.9" fill="currentColor" />
  </Svg>
);

export const Layers = (p: LineIconProps) => (
  <Svg {...p}>
    <path d="M12 3.2l8.8 4.3L12 11.8 3.2 7.5 12 3.2z" />
    <path d="M3.2 12L12 16.3 20.8 12" />
    <path d="M3.2 16.5L12 20.8l8.8-4.3" />
  </Svg>
);

export const LocateFixed = (p: LineIconProps) => (
  <Svg {...p}>
    <circle cx="12" cy="12" r="6.5" />
    <circle cx="12" cy="12" r="2.4" />
    <path d="M12 2.5v3M12 18.5v3M2.5 12h3M18.5 12h3" />
  </Svg>
);

export const Plus = (p: LineIconProps) => (
  <Svg {...p}>
    <path d="M12 5v14M5 12h14" />
  </Svg>
);

export const Minus = (p: LineIconProps) => (
  <Svg {...p}>
    <path d="M5 12h14" />
  </Svg>
);

export const Star = (p: LineIconProps) => (
  <Svg {...p}>
    <path d="M12 3.4l2.6 5.6 6 .8-4.4 4.2 1.1 6-5.3-3-5.3 3 1.1-6L3.4 9.8l6-.8L12 3.4z" />
  </Svg>
);

export const Shuffle = (p: LineIconProps) => (
  <Svg {...p}>
    <path d="M16.5 3.5h4v4M20.5 3.5l-6.4 6.4M3.5 20.5h4v-4M3.5 20.5l6.4-6.4" />
    <path d="M16.5 20.5h4v-4M16.5 3.5l-4 4M3.5 3.5l6.4 6.4M3.5 20.5l4-4" />
  </Svg>
);
