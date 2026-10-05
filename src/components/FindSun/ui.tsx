import type { ReactNode } from "react";
import { CONFIDENCE_ES, confidenceWord } from "../../lib/formatSun";
import { cn } from "../../utils/cn";

/** Piezas mínimas de Find the Sun: pequeñas, translúcidas, con el mismo lenguaje que el resto. */

export function Chip({
  active,
  disabled,
  onClick,
  children,
  title,
  className,
}: {
  active?: boolean;
  disabled?: boolean;
  onClick(): void;
  children: ReactNode;
  title?: string;
  className?: string;
}) {
  return (
    <button
      type="button"
      title={title}
      disabled={disabled}
      aria-pressed={active}
      onClick={onClick}
      className={cn(
        "rounded-full border px-3.5 py-2 text-[12px] font-medium leading-none transition-all duration-300 active:scale-[0.97]",
        active
          ? "border-ink bg-ink text-paper"
          : "border-line bg-ink/[0.03] text-ink hover:bg-ink/[0.07]",
        disabled && "pointer-events-none opacity-35",
        className
      )}
    >
      {children}
    </button>
  );
}

export function Caps({ children, className }: { children: ReactNode; className?: string }) {
  return <p className={cn("fts-caps !text-[9px]", className)}>{children}</p>;
}

export function PrimaryButton({
  onClick,
  children,
  disabled,
  className,
}: {
  onClick(): void;
  children: ReactNode;
  disabled?: boolean;
  className?: string;
}) {
  return (
    <button
      type="button"
      disabled={disabled}
      onClick={onClick}
      className={cn(
        "fts-cta pointer-events-auto inline-flex items-center gap-2.5 rounded-full bg-ink px-5 py-3 text-[11px] font-semibold uppercase tracking-[0.26em] text-paper transition-all duration-500 hover:-translate-y-0.5 active:scale-[0.98] disabled:opacity-40",
        className
      )}
    >
      <span className="h-[7px] w-[7px] rounded-full bg-[#ffc45e]" />
      <span>{children}</span>
    </button>
  );
}

export function GhostButton({
  onClick,
  children,
  className,
}: {
  onClick(): void;
  children: ReactNode;
  className?: string;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        "text-[10.5px] font-semibold uppercase tracking-[0.18em] text-ink-soft transition-colors hover:text-ink",
        className
      )}
    >
      {children}
    </button>
  );
}

/** Tres barras + palabra: la confianza de un vistazo. */
export function ConfidenceBars({ value, showWord = true }: { value: number; showWord?: boolean }) {
  const word = confidenceWord(value);
  const bars = word === "very_high" || word === "high" ? 3 : word === "medium" ? 2 : 1;
  return (
    <span className="inline-flex items-center gap-1.5">
      <span className="inline-flex items-end gap-[2px]" aria-hidden>
        {[0, 1, 2].map((i) => (
          <i
            key={i}
            className={cn("block w-[3px] rounded-full", i < bars ? "bg-sun" : "bg-ink/15")}
            style={{ height: 5 + i * 2.5 }}
          />
        ))}
      </span>
      {showWord && CONFIDENCE_ES[word]}
    </span>
  );
}
