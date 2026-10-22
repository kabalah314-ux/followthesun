import { affiliateOffer, type AffiliateContext } from "../../lib/affiliate";
import type { SunPlace } from "../../types";
import { tr } from "../../i18n";

/**
 * Hueco de afiliación, siempre marcado y separado de lo que se ordena por sol. Sin programas
 * configurados no ocupa nada (es lo normal hasta la fase E).
 */
export default function AffiliateSlot({ place, context }: { place: SunPlace | null; context: AffiliateContext }) {
  const offer = affiliateOffer(place, context);
  if (!offer) return null;
  return (
    <aside aria-label={tr("affiliate.enlace_de_afiliado")} className="mt-4 rounded-[18px] border border-line bg-ink/[0.025] p-3.5">
      <p className="text-[12px] font-semibold uppercase tracking-[0.14em] text-ink-faint">
        {offer.kind === "sponsored" ? tr("affiliate.patrocinado_por", { p0: offer.partner }) : tr("affiliate.enlace_de_afiliado_de", { p0: offer.partner })}
      </p>
      <a
        href={offer.url}
        target="_blank"
        rel="sponsored noopener noreferrer"
        className="mt-1.5 flex min-h-[44px] items-center justify-between gap-3 text-[14.5px] font-semibold text-ink underline-offset-4 hover:underline"
      >
        <span>{offer.label}</span>
        <span aria-hidden>↗</span>
      </a>
      {offer.detail && <p className="text-[12.5px] text-ink-soft">{offer.detail}</p>}
      <p className="mt-1 text-[12px] leading-snug text-ink-faint">{tr("affiliate.no_cambia_el_orden")}</p>
    </aside>
  );
}
