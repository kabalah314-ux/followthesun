import type { ReactNode } from "react";
import type { ChipId } from "../../lib/explore";

/** Iconos finos de los chips (mismo trazo que el resto). */
const S = ({ children }: { children: ReactNode }) => (
  <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
    {children}
  </svg>
);

export const CHIP_ICON: Record<ChipId, ReactNode> = {
  sun: (
    <S>
      <circle cx="12" cy="12" r="4" fill="currentColor" stroke="none" />
      <path d="M12 3v2M12 19v2M3 12h2M19 12h2M5.6 5.6l1.4 1.4M17 17l1.4 1.4M5.6 18.4L7 17M17 7l1.4-1.4" />
    </S>
  ),
  shade: (
    <S>
      <path d="M3 12a9 9 0 0 1 18 0z" />
      <path d="M12 12v7.5a1.5 1.5 0 0 1-3 0" />
    </S>
  ),
  terraces: (
    <S>
      <path d="M5 9h11v4a5 5 0 0 1-5 5h-1a5 5 0 0 1-5-5z" />
      <path d="M16 10h1.5a2.5 2.5 0 0 1 0 5H16M8 3.5c0 1.5 1.5 1.5 1.5 3M12 3.5c0 1.5 1.5 1.5 1.5 3M4 21h14" />
    </S>
  ),
  parks: (
    <S>
      <path d="M12 21v-6M8 17.5h8" />
      <path d="M12 3c3.2 0 5.5 2.6 5.5 5.6 0 2.8-2.3 5-5.5 5s-5.5-2.2-5.5-5C6.5 5.6 8.8 3 12 3z" />
    </S>
  ),
  beach: (
    <S>
      <path d="M3 18c1.5 0 1.5 1 3 1s1.5-1 3-1 1.5 1 3 1 1.5-1 3-1 1.5 1 3 1 1.5-1 3-1" />
      <path d="M12 15V6M5 10a7 7 0 0 1 14 0z" />
    </S>
  ),
  kids: (
    <S>
      <circle cx="12" cy="5" r="2" />
      <path d="M12 8v6M8.5 10.5l3.5-1.5 3.5 1.5M10 21l2-7 2 7" />
    </S>
  ),
  sunset: (
    <S>
      <path d="M3 18h18M6 21h12M7 18a5 5 0 0 1 10 0" />
      <path d="M12 3v4M4.5 9.5l2 1.5M19.5 9.5l-2 1.5" />
    </S>
  ),
  work: (
    <S>
      <rect x="4" y="5" width="16" height="11" rx="1.5" />
      <path d="M2.5 19h19M10 9.5c1.2-1 2.8-1 4 0M11 11.5c.6-.4 1.4-.4 2 0" />
    </S>
  ),
  dog: (
    <S>
      <circle cx="7" cy="9" r="1.6" />
      <circle cx="10.5" cy="6" r="1.6" />
      <circle cx="14.5" cy="6" r="1.6" />
      <circle cx="18" cy="9" r="1.6" />
      <path d="M12.5 11c-2.5 0-4.5 2.6-4.5 5 0 1.6 1.1 2.5 2.5 2.5 1 0 1.3-.5 2-.5s1 .5 2 .5c1.4 0 2.5-.9 2.5-2.5 0-2.4-2-5-4.5-5z" />
    </S>
  ),
  benches: (
    <S>
      <path d="M4 13h16M5 9h14M6 9V6.5M18 9V6.5M6 13v5M18 13v5M5 9v4M19 9v4" />
    </S>
  ),
};

export const FilterIcon = () => (
  <S>
    <path d="M4 6h16M7 12h10M10 18h4" />
  </S>
);
