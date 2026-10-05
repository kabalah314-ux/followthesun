import { formatClock } from "../services/timeService";
import { SettingsIcon } from "./Navigation/NavIcons";
import { LogoMark, Wordmark } from "./Logo";

export default function Header({
  now,
  desktopSidebar = false,
  brandOffset = 0,
  onSettings,
}: {
  now: number;
  desktopSidebar?: boolean;
  /** Espacio de la rail compacta en desktop/tablet; la marca siempre sigue visible. */
  brandOffset?: number;
  onSettings?(): void;
}) {
  return (
    <header className="pointer-events-none absolute inset-x-0 top-0 z-20">
      <div className="fts-fade-top absolute inset-x-0 top-0 h-32 sm:h-44" />
      <div className="relative flex items-start justify-between px-4 pt-4 sm:px-9 sm:pt-7">
        <div
          className={`fts-rise flex items-center gap-3 sm:gap-4 ${desktopSidebar ? "md:hidden" : ""}`}
          style={{ animationDelay: "250ms", marginLeft: brandOffset ? `${brandOffset}px` : undefined }}
        >
          <LogoMark size={36} animate className="shrink-0 text-ink sm:h-[46px] sm:w-[46px]" />
          <div className="leading-none">
            <h1 className="text-[13px] font-semibold tracking-[0.27em] text-ink sm:text-[22px] sm:tracking-[0.38em]">
              <Wordmark />
            </h1>
            <p className="mt-1.5 font-serif text-[12px] italic text-ink-soft sm:mt-2.5 sm:text-[15px]">
              Barcelona
            </p>
          </div>
        </div>

        <div
          className="fts-rise pointer-events-auto flex items-center gap-2 pt-1 sm:gap-2.5 sm:pt-2.5"
          style={{ animationDelay: "420ms" }}
        >
          <span className="fts-live-dot" aria-hidden />
          <span className="fts-caps">Ahora</span>
          <span className="text-ink-faint">·</span>
          <span className="font-serif text-[22px] leading-none tabular-nums text-ink sm:text-[28px]">
            {formatClock(now)}
          </span>
          {!desktopSidebar && (
            <button
              type="button"
              onClick={onSettings}
              aria-label="Ajustes"
              className="ml-1 flex h-9 w-9 items-center justify-center rounded-full text-ink-soft transition-colors hover:bg-ink/5 hover:text-ink md:hidden"
            >
              <SettingsIcon className="h-[17px] w-[17px]" />
            </button>
          )}
        </div>
      </div>
    </header>
  );
}
