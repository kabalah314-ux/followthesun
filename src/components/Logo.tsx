/**
 * Marca de Follow the Sun: un sol que recorre su trayectoria sobre el horizonte.
 * Círculo solar + arco + línea de horizonte, sin iconografía genérica.
 */
export function LogoMark({
  size = 30,
  animate = false,
  className = "",
}: {
  size?: number;
  animate?: boolean;
  className?: string;
}) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 48 48"
      fill="none"
      className={className}
      aria-hidden="true"
    >
      <defs>
        <radialGradient id="fts-sun-fill" cx="38%" cy="34%" r="75%">
          <stop offset="0" stopColor="#ffd98a" />
          <stop offset="1" stopColor="#e8923a" />
        </radialGradient>
        <radialGradient id="fts-sun-glow" cx="50%" cy="50%" r="50%">
          <stop offset="0" stopColor="#ffc15e" stopOpacity="0.55" />
          <stop offset="1" stopColor="#ffc15e" stopOpacity="0" />
        </radialGradient>
      </defs>
      <path
        d="M5 35 A19 19 0 0 1 43 35"
        stroke="currentColor"
        strokeWidth="1.4"
        strokeLinecap="round"
        strokeDasharray="1.5 3.6"
        opacity="0.55"
      />
      <line
        x1="3"
        y1="35"
        x2="45"
        y2="35"
        stroke="currentColor"
        strokeWidth="1.4"
        strokeLinecap="round"
        opacity="0.9"
      />
      <g
        style={{
          transformOrigin: "24px 35px",
          animation: animate ? "fts-orbit 2.4s cubic-bezier(0.22,1,0.36,1) both" : undefined,
        }}
      >
        <circle cx="12.4" cy="20.6" r="9.5" fill="url(#fts-sun-glow)" />
        <circle cx="12.4" cy="20.6" r="5.2" fill="url(#fts-sun-fill)" />
      </g>
    </svg>
  );
}

export function Wordmark({ className = "" }: { className?: string }) {
  return (
    <span className={className}>
      FOLLOW THE <span className="text-sun-deep">SUN</span>
    </span>
  );
}
