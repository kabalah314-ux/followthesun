import type { SunPlace } from "../types";

/**
 * Huecos de afiliación (guía maestra 2, «Negocio por afiliación»). Este módulo solo define el
 * hueco: un proveedor (fase E, con los identificadores en variables de entorno) se registra con
 * `registerAffiliateProvider`. Sin proveedor no aparece nada.
 *
 * Reglas: siempre marcado («Enlace de afiliado» o «Patrocinado» y quién paga), con
 * rel="sponsored noopener", en un hueco aparte y nunca dentro de la lista ordenada por sol: un
 * sitio con afiliación no sube ni un puesto.
 */

export type AffiliateContext = "card" | "collection" | "route" | "uv";

export interface AffiliateOffer {
  /** «Reservar mesa», «Paseo en barco al atardecer». */
  label: string;
  /** Quién paga («Civitatis»). */
  partner: string;
  url: string;
  kind: "affiliate" | "sponsored";
  /** Una línea opcional («Con la mejor luz a las 18:40»). */
  detail?: string;
}

export type AffiliateProvider = (place: SunPlace | null, context: AffiliateContext) => AffiliateOffer | null;

let provider: AffiliateProvider | null = null;

export function registerAffiliateProvider(p: AffiliateProvider | null): void {
  provider = p;
}

/** La oferta para un hueco, o null (lo normal mientras no haya programas configurados). */
export function affiliateOffer(place: SunPlace | null, context: AffiliateContext): AffiliateOffer | null {
  try {
    return provider ? provider(place, context) : null;
  } catch {
    return null;
  }
}
