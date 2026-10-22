import { getLang } from "../../i18n";
import { registerAffiliateProvider, type AffiliateContext } from "../../lib/affiliate";
import { affiliate, type AffiliateSlot } from "./affiliateService";

/**
 * Conecta los programas de afiliación configurados con los huecos de la interfaz (`lib/affiliate`).
 * Sin ningún programa en las variables de entorno no se registra nada y los huecos no se pintan.
 */

const SLOT_FOR: Record<AffiliateContext, AffiliateSlot> = {
  // En la ficha, solo entradas de monumentos con entrada (el servicio decide si el sitio lo es).
  card: "tickets",
  collection: "activity",
  route: "activity",
  // El hueco «uv» solo se pinta con UV muy alto o con aviso de calor.
  uv: "sun_protection",
};

export function registerAffiliates(): void {
  if (!affiliate.isConfigured()) return;
  registerAffiliateProvider((place, context) => {
    const [offer] = affiliate.offers({
      slot: SLOT_FOR[context],
      locale: getLang(),
      place: place ? { name: place.name, type: place.type } : undefined,
      uvIndex: context === "uv" ? 10 : undefined,
    });
    if (!offer) return null;
    return { label: offer.label, partner: offer.sponsor, url: offer.url, kind: "affiliate", detail: offer.disclosure };
  });

  // Analítica sin cookies de los clics en enlaces patrocinados (solo el dominio de destino).
  document.addEventListener(
    "click",
    (e) => {
      const a = (e.target as Element | null)?.closest?.('a[rel~="sponsored"]') as HTMLAnchorElement | null;
      if (!a) return;
      try {
        const va = (window as unknown as { va?: (kind: string, payload: unknown) => void }).va;
        va?.("event", { name: "affiliate_click", data: { host: new URL(a.href).hostname } });
      } catch {
        /* sin analítica */
      }
    },
    { capture: true }
  );
}
