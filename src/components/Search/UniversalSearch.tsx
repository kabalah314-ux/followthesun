import { useEffect, useId, useRef, useState, type KeyboardEvent, type ReactNode } from "react";
import type { SearchSuggestion } from "../../hooks/useUniversalSearch";
import { cn } from "../../utils/cn";
import { Search as SearchIcon } from "../LineIcons";
import { tr } from "../../i18n";

interface Props {
  value: string;
  onChange(v: string): void;
  suggestions: SearchSuggestion[];
  onPick(s: SearchSuggestion): void;
  /** Intro sin elegir sugerencia: se interpreta el texto entero. */
  onSubmit(text: string): void;
  onClear(): void;
  /** Hay una búsqueda aplicada: se ofrece borrarla aunque el campo esté vacío. */
  active?: boolean;
  /** Botón de perfil (Ajustes, idioma y «Cómo lo sabemos»). */
  profile?: ReactNode;
  /** «floating»: sobre el mapa (móvil); «panel»: dentro del panel de escritorio. */
  variant: "floating" | "panel";
}

function SuggestionIcon({ kind }: { kind: SearchSuggestion["kind"] }) {
  if (kind === "intent") {
    return (
      <svg width="18" height="18" viewBox="0 0 24 24" fill="none" aria-hidden className="text-sun-deep">
        <circle cx="12" cy="12" r="4.2" fill="currentColor" />
        <path d="M12 2.5v2.2M12 19.3v2.2M2.5 12h2.2M19.3 12h2.2M5.3 5.3l1.6 1.6M17.1 17.1l1.6 1.6M5.3 18.7l1.6-1.6M17.1 6.9l1.6-1.6" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
      </svg>
    );
  }
  if (kind === "area") {
    return (
      <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinejoin="round" aria-hidden className="text-ink-soft">
        <path d="M3.5 6.5l5.5-2 6 2 5.5-2v13l-5.5 2-6-2-5.5 2z" />
        <path d="M9 4.5v13M15 6.5v13" />
      </svg>
    );
  }
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinejoin="round" aria-hidden className="text-ink-soft">
      <path d="M12 21s-6.5-5.6-6.5-11a6.5 6.5 0 0 1 13 0c0 5.4-6.5 11-6.5 11z" />
      <circle cx="12" cy="10" r="2.3" />
    </svg>
  );
}

/**
 * Buscador universal: una sola caja para sitios, barrios, intenciones («terraza con sol») y horas
 * («mañana a las 11»). Combobox accesible: flechas para moverse, Intro para elegir, Esc para cerrar.
 */
export default function UniversalSearch(p: Props) {
  const [focused, setFocused] = useState(false);
  const [active, setActive] = useState(-1);
  const inputRef = useRef<HTMLInputElement>(null);
  const listId = useId();
  const open = focused && p.suggestions.length > 0;

  useEffect(() => setActive(-1), [p.suggestions]);

  const pick = (s: SearchSuggestion) => {
    p.onPick(s);
    inputRef.current?.blur();
  };

  const onKeyDown = (e: KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "ArrowDown" && p.suggestions.length) {
      e.preventDefault();
      setActive((i) => (i + 1) % p.suggestions.length);
    } else if (e.key === "ArrowUp" && p.suggestions.length) {
      e.preventDefault();
      setActive((i) => (i <= 0 ? p.suggestions.length - 1 : i - 1));
    } else if (e.key === "Enter") {
      e.preventDefault();
      if (active >= 0 && p.suggestions[active]) pick(p.suggestions[active]);
      else if (p.value.trim()) {
        p.onSubmit(p.value.trim());
        inputRef.current?.blur();
      }
    } else if (e.key === "Escape") {
      if (p.value) p.onChange("");
      else inputRef.current?.blur();
    }
  };

  return (
    <div className="relative">
      <div
        className={cn(
          "flex h-12 items-center gap-1 rounded-full pl-4 pr-1 transition-shadow duration-300",
          p.variant === "floating" ? "fts-glass pointer-events-auto" : "border border-line bg-paper/70",
          focused && "ring-2 ring-sun/50"
        )}
      >
        <SearchIcon size={18} strokeWidth={1.5} absoluteStrokeWidth className="shrink-0 text-ink-soft" />
        <input
          ref={inputRef}
          type="text"
          role="combobox"
          aria-label={tr("search.buscar")}
          aria-expanded={open}
          aria-controls={listId}
          aria-autocomplete="list"
          aria-activedescendant={open && active >= 0 ? `${listId}-${active}` : undefined}
          value={p.value}
          placeholder={tr("search.placeholder")}
          enterKeyHint="search"
          autoComplete="off"
          autoCorrect="off"
          spellCheck={false}
          onChange={(e) => p.onChange(e.target.value)}
          onKeyDown={onKeyDown}
          onFocus={() => setFocused(true)}
          onBlur={() => setFocused(false)}
          className="h-full min-w-0 flex-1 bg-transparent px-1.5 text-[15px] text-ink outline-none placeholder:text-ink-faint"
        />
        {(p.value || p.active) && (
          <button
            type="button"
            onClick={() => {
              p.onClear();
              inputRef.current?.focus();
            }}
            aria-label={tr("search.borrar_busqueda")}
            className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full text-ink-soft outline-none transition-colors hover:bg-ink/5 hover:text-ink focus-visible:ring-2 focus-visible:ring-sun/60"
          >
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" aria-hidden>
              <path d="M6 6l12 12M18 6L6 18" />
            </svg>
          </button>
        )}
        {p.profile}
      </div>

      {open && (
        <ul
          id={listId}
          role="listbox"
          aria-label={tr("search.sugerencias")}
          className="fts-glass fts-pop-in pointer-events-auto absolute inset-x-0 top-full z-50 mt-2 max-h-[min(60vh,420px)] overflow-y-auto overscroll-contain rounded-[22px] p-1.5"
        >
          {p.suggestions.map((s, i) => (
            <li
              key={s.key}
              id={`${listId}-${i}`}
              role="option"
              aria-selected={i === active}
              onMouseDown={(e) => e.preventDefault()}
              onClick={() => pick(s)}
              onMouseEnter={() => setActive(i)}
              className={cn(
                "flex min-h-[52px] cursor-pointer items-center gap-3 rounded-[16px] px-3 py-2",
                i === active ? "bg-ink/[0.07]" : "hover:bg-ink/[0.04]"
              )}
            >
              <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-ink/[0.05]">
                <SuggestionIcon kind={s.kind} />
              </span>
              <span className="min-w-0 flex-1">
                <span className={cn("block truncate text-[14.5px] text-ink", s.kind === "intent" ? "font-semibold" : "font-medium")}>{s.label}</span>
                <span className="block truncate text-[12.5px] text-ink-soft">{s.detail}</span>
              </span>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
