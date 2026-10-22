import { useState } from "react";
import { placeSlug } from "../../lib/deepLinks";
import type { SunPlace } from "../../types";
import { tr } from "../../i18n";

/**
 * «¿Es tu local?» (guía maestra 2, E4): el código del widget «Sol de hoy» para la web del local,
 * listo para copiar. Gratis, sin registro y sin publicidad dentro del widget.
 */
export default function OwnerBlock({ place }: { place: SunPlace }) {
  const [open, setOpen] = useState(false);
  const [copied, setCopied] = useState(false);
  const slug = placeSlug(place);
  const isVenue = place.metadata?.venue === true || place.type === "terrace";
  if (!slug || !isVenue) return null;
  const src = `${window.location.origin}/widget/${slug}`;
  const title = `${tr("widget.hoy")} · ${place.name}`.replace(/"/g, "&quot;");
  const code = `<iframe src="${src}" width="340" height="170" style="border:0;border-radius:18px" loading="lazy" title="${title}"></iframe>`;

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(code);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 2500);
    } catch {
      setCopied(false);
    }
  };

  return (
    <div className="mt-4 border-t border-line pt-1.5">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        className="flex min-h-[48px] w-full items-center justify-between gap-3 text-left text-[14.5px] font-semibold text-ink-soft outline-none transition-colors hover:text-ink focus-visible:ring-2 focus-visible:ring-sun/60"
      >
        <span>{tr("owner.titulo")}</span>
        <span aria-hidden className="text-[18px] leading-none">{open ? "−" : "+"}</span>
      </button>
      {open && (
        <div className="fts-fade-in space-y-2.5 pb-2 pt-1">
          <p className="text-[13.5px] leading-snug text-ink-soft">{tr("owner.texto")}</p>
          <textarea
            readOnly
            value={code}
            rows={3}
            onFocus={(e) => e.currentTarget.select()}
            aria-label={tr("owner.codigo")}
            className="w-full resize-none rounded-[12px] border border-line bg-ink/[0.03] p-2.5 font-mono text-[11.5px] leading-snug text-ink outline-none focus-visible:ring-2 focus-visible:ring-sun/60"
          />
          <div className="flex flex-wrap items-center gap-x-4 gap-y-1">
            <button
              type="button"
              onClick={() => void copy()}
              className="min-h-[44px] rounded-full bg-ink px-4 text-[13px] font-semibold text-paper outline-none focus-visible:ring-2 focus-visible:ring-sun/60"
            >
              {copied ? tr("owner.copiado") : tr("owner.copiar")}
            </button>
            <a href={src} target="_blank" rel="noopener" className="min-h-[44px] content-center text-[13px] font-semibold text-sun-deep underline-offset-4 hover:underline">
              {tr("owner.ver")} ↗
            </a>
          </div>
          <p className="text-[12.5px] leading-snug text-ink-faint">{tr("owner.gratis")}</p>
        </div>
      )}
    </div>
  );
}
