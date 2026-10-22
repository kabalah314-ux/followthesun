import { useEffect, useRef, useState } from "react";
import type { AppView } from "../../lib/routing";
import { cn } from "../../utils/cn";
import { Info, Settings } from "../LineIcons";
import { tr, useLang } from "../../i18n";

/**
 * Icono de perfil del buscador: Ajustes, idioma y «Cómo lo sabemos» (fuera de la navegación
 * principal, que se queda con los tres destinos).
 */
export default function ProfileMenu({ onNavigate }: { onNavigate(view: AppView): void }) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  const { lang, setLang, langs } = useLang();

  useEffect(() => {
    if (!open) return;
    const onDown = (e: PointerEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(false);
    };
    window.addEventListener("pointerdown", onDown);
    window.addEventListener("keydown", onKey);
    return () => {
      window.removeEventListener("pointerdown", onDown);
      window.removeEventListener("keydown", onKey);
    };
  }, [open]);

  const go = (v: AppView) => {
    setOpen(false);
    onNavigate(v);
  };

  const item =
    "flex min-h-[48px] w-full items-center gap-3 rounded-[14px] px-3 text-left text-[14.5px] font-medium text-ink outline-none transition-colors hover:bg-ink/[0.05] focus-visible:ring-2 focus-visible:ring-sun/60";

  return (
    <div ref={ref} className="relative shrink-0">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-label={tr("profile.tu_menu")}
        aria-haspopup="menu"
        aria-expanded={open}
        className={cn(
          "flex h-10 w-10 items-center justify-center rounded-full outline-none transition-colors focus-visible:ring-2 focus-visible:ring-sun/60",
          open ? "bg-ink text-paper" : "bg-ink/[0.07] text-ink hover:bg-ink/[0.11]"
        )}
      >
        <svg width="19" height="19" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" aria-hidden>
          <circle cx="12" cy="8.5" r="3.6" />
          <path d="M4.8 19.6c1.4-3.2 4-4.8 7.2-4.8s5.8 1.6 7.2 4.8" />
        </svg>
      </button>
      {open && (
        <div role="menu" aria-label={tr("profile.tu_menu")} className="fts-glass fts-pop-in absolute right-0 top-full z-50 mt-2 w-[min(18rem,calc(100vw-1.5rem))] rounded-[22px] p-1.5">
          <button type="button" role="menuitem" onClick={() => go("settings")} className={item}>
            <Settings size={18} strokeWidth={1.5} absoluteStrokeWidth className="shrink-0 text-ink-soft" />
            {tr("navItems.ajustes")}
          </button>
          <button type="button" role="menuitem" onClick={() => go("about")} className={item}>
            <Info size={18} strokeWidth={1.5} absoluteStrokeWidth className="shrink-0 text-ink-soft" />
            {tr("sunDetails.como_lo_sabemos")}
          </button>
          <div className="mx-2 my-1.5 h-px bg-line" />
          <div className="px-3 pb-2 pt-1.5">
            <p className="fts-caps !text-[11.5px]">{tr("profile.idioma")}</p>
            <div role="radiogroup" aria-label={tr("profile.idioma")} className="mt-2 flex gap-1 rounded-full bg-ink/[0.05] p-1">
              {langs.map((l) => (
                <button
                  key={l.id}
                  type="button"
                  role="radio"
                  aria-checked={lang === l.id}
                  lang={l.id}
                  onClick={() => setLang(l.id)}
                  className={cn(
                    "h-11 flex-1 rounded-full text-[13px] font-semibold outline-none transition-colors focus-visible:ring-2 focus-visible:ring-sun/60",
                    lang === l.id ? "bg-paper text-ink shadow-sm" : "text-ink-soft hover:text-ink"
                  )}
                >
                  {l.label}
                </button>
              ))}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
