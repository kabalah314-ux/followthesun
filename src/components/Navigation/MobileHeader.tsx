import { useEffect, useRef, useState, type ReactNode } from "react";
import type { AppView } from "../../lib/routing";
import { cn } from "../../utils/cn";
import { Ellipsis, Layers, LocateFixed } from "../LineIcons";
import { LogoMark, Wordmark } from "../Logo";
import { MOBILE_MORE, NAV_ITEMS } from "./navItems";

interface Props {
  view: AppView;
  layersOpen: boolean;
  onToggleLayers(): void;
  onLocate(): void;
  onNavigate(view: AppView): void;
  onBrand(): void;
  /** Panel de capas, anclado bajo la cabecera. */
  layerPanel: ReactNode;
}

function IconButton({
  label,
  active,
  onClick,
  children,
  layersToggle,
}: {
  label: string;
  active?: boolean;
  onClick(): void;
  children: ReactNode;
  layersToggle?: boolean;
}) {
  return (
    <button
      type="button"
      data-layers-toggle={layersToggle ? "" : undefined}
      aria-label={label}
      aria-pressed={active}
      onClick={onClick}
      className={cn(
        "flex h-10 w-10 items-center justify-center rounded-full outline-none transition-colors focus-visible:ring-2 focus-visible:ring-sun/60",
        active ? "bg-ink/[0.08] text-ink" : "text-ink-soft"
      )}
    >
      {children}
    </button>
  );
}

/** Cabecera móvil mínima: marca + capas + ubicación + «Más» (Lugares, Ajustes, Acerca de). */
export default function MobileHeader({ view, layersOpen, onToggleLayers, onLocate, onNavigate, onBrand, layerPanel }: Props) {
  const [more, setMore] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!more) return;
    const close = (e: PointerEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setMore(false);
    };
    window.addEventListener("pointerdown", close);
    return () => window.removeEventListener("pointerdown", close);
  }, [more]);

  return (
    <header className="pointer-events-none fixed inset-x-0 top-0 z-40" style={{ paddingTop: "env(safe-area-inset-top)" }}>
      <div className="fts-fade-top absolute inset-x-0 top-0 h-20" />
      <div className="relative flex h-[52px] items-center justify-between pl-3 pr-1.5">
        <button
          type="button"
          onClick={onBrand}
          aria-label="Follow the Sun — volver al mapa"
          className="pointer-events-auto flex items-center gap-2.5 rounded-full outline-none focus-visible:ring-2 focus-visible:ring-sun/60"
        >
          <LogoMark size={26} className="text-ink" />
          <span className="text-[11px] font-semibold tracking-[0.24em] text-ink">
            <Wordmark />
          </span>
        </button>

        <div ref={ref} className="pointer-events-auto relative flex items-center">
          <IconButton label="Capas del mapa" active={layersOpen} onClick={onToggleLayers} layersToggle>
            <Layers size={19} />
          </IconButton>
          <IconButton label="Mi ubicación" onClick={onLocate}>
            <LocateFixed size={19} />
          </IconButton>
          <IconButton label="Más" active={more} onClick={() => setMore((v) => !v)}>
            <Ellipsis size={19} />
          </IconButton>

          {more && (
            <div className="fts-glass fts-pop-in absolute right-1 top-full mt-1.5 w-56 rounded-[20px] p-1.5">
              {MOBILE_MORE.map((v) => (
                <button
                  key={v}
                  type="button"
                  onClick={() => {
                    setMore(false);
                    onNavigate(v);
                  }}
                  aria-current={view === v ? "page" : undefined}
                  className={cn(
                    "flex w-full items-center gap-3 rounded-[14px] px-3 py-2.5 text-left text-[13px] outline-none transition-colors focus-visible:ring-2 focus-visible:ring-sun/60",
                    view === v ? "bg-ink/[0.07] text-ink" : "text-ink-soft hover:bg-ink/[0.04]"
                  )}
                >
                  {NAV_ITEMS[v].icon(18)}
                  <span>
                    <span className="block font-medium text-ink">{NAV_ITEMS[v].label}</span>
                    <span className="block text-[10.5px] text-ink-faint">{NAV_ITEMS[v].hint}</span>
                  </span>
                </button>
              ))}
            </div>
          )}

          {layersOpen && <div className="absolute right-1 top-full mt-1.5">{layerPanel}</div>}
        </div>
      </div>
    </header>
  );
}
