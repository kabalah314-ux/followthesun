import { PROGRAMS, configFromEnv, type AffiliateConfig, type AffiliateLocale, type AffiliateProgramId, type AffiliateSlot } from "./programs";

export type { AffiliateConfig, AffiliateLocale, AffiliateProgramId, AffiliateSlot } from "./programs";

/**
 * Enlaces de afiliación para los huecos marcados de la interfaz (ficha, colecciones, avisos de UV).
 *
 *  · Sin identificadores configurados, `offers()` devuelve siempre [] y no aparece nada.
 *  · La persona puede ocultarlos en Ajustes (se guarda en su dispositivo).
 *  · Cada oferta lleva la etiqueta obligatoria, quién paga y rel="sponsored": LSSI art. 20.
 *  · Nada de aquí entra en el orden por sol (art. 26 de la Ley de Competencia Desleal): lo comprueba
 *    el test de dependencias de este módulo.
 */

export interface AffiliateOffer {
  /** «programa:hueco». */
  id: string;
  program: AffiliateProgramId;
  /** Quién paga, visible junto al enlace. */
  sponsor: string;
  slot: AffiliateSlot;
  url: string;
  rel: "sponsored noopener noreferrer";
  /** Etiqueta visible obligatoria. */
  badge: string;
  /** Texto del enlace. */
  label: string;
  /** Frase legal propia del programa, si la tiene. */
  disclosure?: string;
}

export interface AffiliateContext {
  slot: AffiliateSlot;
  locale: AffiliateLocale;
  /** Lugar de la ficha (para entradas y búsquedas con su nombre). */
  place?: { name?: string; type?: string };
  /** Índice UV del momento: la protección solar solo aparece con UV muy alto (≥ 8) o con aviso de calor. */
  uvIndex?: number;
  heatAlert?: boolean;
}

const BADGE: Record<AffiliateLocale, string> = {
  es: "Enlace de afiliado",
  ca: "Enllaç d'afiliat",
  en: "Affiliate link",
};

const LABELS: Record<AffiliateSlot, Record<AffiliateLocale, string>> = {
  activity: {
    es: "Planes al aire libre en {sponsor}",
    ca: "Plans a l'aire lliure a {sponsor}",
    en: "Outdoor plans on {sponsor}",
  },
  tickets: {
    es: "Entradas para {place} en {sponsor}",
    ca: "Entrades per a {place} a {sponsor}",
    en: "Tickets for {place} on {sponsor}",
  },
  sun_protection: {
    es: "Protección solar en {sponsor}",
    ca: "Protecció solar a {sponsor}",
    en: "Sun protection on {sponsor}",
  },
  stay: {
    es: "Alojamientos en {sponsor}",
    ca: "Allotjaments a {sponsor}",
    en: "Places to stay on {sponsor}",
  },
};

/** Búsqueda que se manda al programa en cada hueco. */
function queryFor(ctx: AffiliateContext): string | null {
  switch (ctx.slot) {
    case "activity":
      return ctx.locale === "en" ? "Barcelona sunset boat trip" : "Barcelona paseo en barco atardecer";
    case "tickets":
      return ctx.place?.name ? `${ctx.place.name} Barcelona` : null;
    case "sun_protection":
      return ctx.locale === "en" ? "sunscreen SPF 50" : "protector solar SPF 50";
    case "stay":
      return "Barcelona";
  }
}

/** Monumentos y miradores con entrada de pago (las entradas solo tienen sentido ahí). */
const TICKETED = /(park g[uü]ell|sagrada fam|bunkers|turo de la rovira|casa batll|pedrera|casa mil|tibidabo|castell de montju|castillo de montju|torre gl[oò]ries|mirador de colom|telef[eè]ric|hospital de sant pau|palau g[uü]ell)/i;

export function wantsTickets(place?: { name?: string; type?: string }): boolean {
  return Boolean(place?.name && TICKETED.test(place.name.normalize("NFD").replace(/[̀-ͯ]/g, "")));
}

const MAX_PER_SLOT = 2;
const HIDDEN_KEY = "fts:aff:hidden";

function safeStorage(): Storage | null {
  try {
    return typeof window !== "undefined" ? window.localStorage : null;
  } catch {
    return null;
  }
}

export function createAffiliateService(config: AffiliateConfig, storage: Storage | null = safeStorage()) {
  const active = PROGRAMS.filter((p) => p.link(config, "x", "es") !== null);
  let hidden = false;
  try {
    hidden = storage?.getItem(HIDDEN_KEY) === "1";
  } catch {
    hidden = false;
  }

  return {
    /** ¿Hay algún programa configurado en este build? */
    isConfigured: () => active.length > 0,
    programs: () => active.map((p) => p.id),
    isHidden: () => hidden,
    setHidden(value: boolean) {
      hidden = value;
      try {
        if (value) storage?.setItem(HIDDEN_KEY, "1");
        else storage?.removeItem(HIDDEN_KEY);
      } catch {
        /* sin almacenamiento: vale para esta sesión */
      }
    },
    offers(ctx: AffiliateContext): AffiliateOffer[] {
      if (hidden || active.length === 0) return [];
      if (ctx.slot === "sun_protection" && !((ctx.uvIndex ?? 0) >= 8 || ctx.heatAlert)) return [];
      if (ctx.slot === "tickets" && !wantsTickets(ctx.place)) return [];
      const q = queryFor(ctx);
      if (!q) return [];
      const out: AffiliateOffer[] = [];
      for (const p of active) {
        if (!p.slots.includes(ctx.slot)) continue;
        const url = p.link(config, q, ctx.locale);
        if (!url) continue;
        out.push({
          id: `${p.id}:${ctx.slot}`,
          program: p.id,
          sponsor: p.sponsor,
          slot: ctx.slot,
          url,
          rel: "sponsored noopener noreferrer",
          badge: BADGE[ctx.locale],
          label: LABELS[ctx.slot][ctx.locale].replace("{sponsor}", p.sponsor).replace("{place}", ctx.place?.name ?? ""),
          disclosure: p.disclosure?.[ctx.locale],
        });
        if (out.length >= MAX_PER_SLOT) break;
      }
      return out;
    },
  };
}

export type AffiliateService = ReturnType<typeof createAffiliateService>;

/** Servicio de la app, configurado con las variables de entorno del build. */
export const affiliate: AffiliateService = createAffiliateService(configFromEnv());

/** Analítica sin cookies (Vercel Web Analytics, si está cargada): un clic en un enlace de afiliado. */
export function trackAffiliateClick(offer: Pick<AffiliateOffer, "program" | "slot">) {
  try {
    const va = (window as unknown as { va?: (kind: string, payload: unknown) => void }).va;
    va?.("event", { name: "affiliate_click", data: { program: offer.program, slot: offer.slot } });
  } catch {
    /* sin analítica */
  }
}
