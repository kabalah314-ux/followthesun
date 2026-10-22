import type { SunPlaceType } from "../../types";

/**
 * Icono de trazo fino (1,5 px, mismo estilo que LineIcons) para cada tipo de lugar. Siempre va
 * acompañado del nombre del tipo: el icono ayuda a reconocer, no sustituye al texto.
 */
const PATHS: Record<SunPlaceType, string[]> = {
  beach: ["M3 18c2 0 2-1.5 4.5-1.5S9 18 11.5 18 14 16.5 16.5 16.5 19 18 21 18", "M12 15V6", "M12 6c-3 0-5.5 1.6-6 4h12c-.5-2.4-3-4-6-4z"],
  park: ["M12 21v-5", "M12 16c-3.3 0-6-2.4-6-5.4C6 7.5 8.7 4 12 4s6 3.5 6 6.6c0 3-2.7 5.4-6 5.4z", "M4 21h16"],
  square: ["M4 20V9l8-5 8 5v11", "M4 20h16", "M9 20v-5h6v5"],
  terrace: ["M5 10h14", "M12 10V5", "M7 5h10", "M8 10l-2 10", "M16 10l2 10", "M9 15h6"],
  viewpoint: ["M3 19l6-8 4 5 3-4 5 7z", "M17 7a2 2 0 1 0 0-.01"],
  open_space: ["M3 17c3-4 6-6 9-6s6 2 9 6", "M3 20h18", "M7 8a2 2 0 1 0 0-.01"],
  playground: ["M5 21V8l7-4 7 4v13", "M5 12h14", "M12 12v9", "M8 21l2-5", "M16 21l-2-5"],
  climate_shelter: ["M4 11l8-6 8 6", "M6 10v10h12V10", "M12 13v4", "M10 15h4"],
  fountain: ["M12 21v-6", "M8 21h8", "M12 15c-2.2 0-4-1.6-4-3.5 0-2 4-6.5 4-6.5s4 4.5 4 6.5c0 1.9-1.8 3.5-4 3.5z"],
  toilet: ["M8 6a1.5 1.5 0 1 0 0-.01", "M16 6a1.5 1.5 0 1 0 0-.01", "M6 21v-6H5l1.5-6h3L11 15h-1v6", "M14 9h4v6h-1v6h-2v-6h-1z"],
  bench: ["M4 13h16", "M5 9h14", "M6 9V6.5M18 9V6.5", "M6 13v5M18 13v5", "M5 9v4M19 9v4"],
};

export default function PlaceTypeIcon({
  type,
  size = 16,
  className,
}: {
  type: SunPlaceType;
  size?: number;
  className?: string;
}) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.5}
      strokeLinecap="round"
      strokeLinejoin="round"
      className={className}
      aria-hidden
    >
      {PATHS[type].map((d, i) => (
        <path key={i} d={d} />
      ))}
    </svg>
  );
}
