import type { SVGProps } from "react";

type P = SVGProps<SVGSVGElement>;

const svg = (props: P, children: React.ReactNode) => (
  <svg
    width="20"
    height="20"
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    strokeWidth="1.55"
    strokeLinecap="round"
    strokeLinejoin="round"
    aria-hidden="true"
    {...props}
  >
    {children}
  </svg>
);

export const ExploreIcon = (p: P) =>
  svg(p, <><circle cx="12" cy="12" r="8.5" /><path d="m15.7 8.3-2.2 5.2-5.2 2.2 2.2-5.2 5.2-2.2Z" /></>);

export const FindIcon = (p: P) =>
  svg(p, <><circle cx="11" cy="11" r="6.6" /><path d="m16 16 4.2 4.2" /><path d="M11 7.8v6.4M7.8 11h6.4" /></>);

export const PlanIcon = (p: P) =>
  svg(p, <><rect x="4" y="5.5" width="16" height="15" rx="2.5" /><path d="M8 3.8v3.4M16 3.8v3.4M4 9.5h16" /><path d="M8 13h2M14 13h2M8 16.5h2" /></>);

export const PlacesIcon = (p: P) =>
  svg(p, <><path d="M19 10.1c0 5.1-7 10.4-7 10.4S5 15.2 5 10.1a7 7 0 1 1 14 0Z" /><circle cx="12" cy="10" r="2.2" /></>);

export const StarIcon = (p: P) =>
  svg(p, <path d="m12 4.4 2.35 4.76 5.25.76-3.8 3.7.9 5.23L12 16.36l-4.7 2.49.9-5.23-3.8-3.7 5.25-.76L12 4.4Z" />);

export const ShuffleIcon = (p: P) =>
  svg(
    p,
    <>
      <path d="M3.5 7.5h3.2c1.4 0 2.7.7 3.5 1.8l3.6 5.4c.8 1.1 2.1 1.8 3.5 1.8h2.2" />
      <path d="M3.5 16.5h3.2c1.4 0 2.7-.7 3.5-1.8l.9-1.3" />
      <path d="M14 5.6h2.9c1 0 1.9.4 2.6 1.1" />
      <path d="m17.4 4.3 2.7 2.4-2.7 2.4" />
      <path d="m17.4 14.4 2.7 2.4-2.7 2.4" />
    </>
  );

export const SavedIcon = (p: P) =>
  svg(p, <><path d="M6 4.8A1.8 1.8 0 0 1 7.8 3h8.4A1.8 1.8 0 0 1 18 4.8V21l-6-3.8L6 21V4.8Z" /><path d="M9 7h6" /></>);

export const SettingsIcon = (p: P) =>
  svg(p, <><circle cx="12" cy="12" r="3" /><path d="m19.4 15 .1.1a1.8 1.8 0 1 1-2.5 2.5l-.1-.1a1.8 1.8 0 0 0-3 .9v.2a1.8 1.8 0 1 1-3.6 0v-.2a1.8 1.8 0 0 0-3-.9l-.1.1a1.8 1.8 0 1 1-2.5-2.5l.1-.1a1.8 1.8 0 0 0-.9-3h-.2a1.8 1.8 0 1 1 0-3.6h.2a1.8 1.8 0 0 0 .9-3l-.1-.1a1.8 1.8 0 1 1 2.5-2.5l.1.1a1.8 1.8 0 0 0 3-.9v-.2a1.8 1.8 0 1 1 3.6 0v.2a1.8 1.8 0 0 0 3 .9l.1-.1a1.8 1.8 0 1 1 2.5 2.5l-.1.1a1.8 1.8 0 0 0 .9 3h.2a1.8 1.8 0 1 1 0 3.6h-.2a1.8 1.8 0 0 0-.9 3Z" transform="translate(1 1) scale(.92)" /></>);

export const AboutIcon = (p: P) =>
  svg(p, <><circle cx="12" cy="12" r="9" /><path d="M12 11v5M12 8h.01" /></>);

export const CollapseIcon = ({ expanded, ...p }: P & { expanded: boolean }) =>
  svg(p, <path d={expanded ? "m14.5 6-6 6 6 6" : "m9.5 6 6 6-6 6"} />);

export const CloseIcon = (p: P) => svg(p, <path d="m6 6 12 12M18 6 6 18" />);

export const ArrowRightIcon = (p: P) => svg(p, <path d="M4.5 12h14M12.5 6l6 6-6 6" />);