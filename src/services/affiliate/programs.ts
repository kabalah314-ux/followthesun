/**
 * Programas de afiliación (fase E de la guía maestra 2). Cada uno se activa solo si su identificador
 * está en las variables de entorno; sin ninguno, la app no enseña ningún enlace de afiliado.
 *
 * Regla de oro: esto NUNCA toca el orden por sol y sombra. Los enlaces van en huecos propios,
 * siempre marcados («Enlace de afiliado») y con rel="sponsored". Ver el test de dependencias.
 */

export type AffiliateProgramId = "civitatis" | "getyourguide" | "viator" | "tiqets" | "amazon" | "booking";

/** Huecos de la interfaz donde puede aparecer un enlace (ver «Dónde aparece» en la guía). */
export type AffiliateSlot = "activity" | "tickets" | "sun_protection" | "stay";

export type AffiliateLocale = "es" | "ca" | "en";

/** Identificadores de afiliado. Plantillas con {q} (búsqueda) y {lang} para las redes con enlaces propios. */
export interface AffiliateConfig {
  civitatisAid?: string;
  getYourGuidePartnerId?: string;
  amazonTag?: string;
  viatorUrlTemplate?: string;
  tiqetsUrlTemplate?: string;
  bookingUrlTemplate?: string;
}

export interface ProgramDef {
  id: AffiliateProgramId;
  /** Nombre visible de quien paga (obligatorio al lado del enlace). */
  sponsor: string;
  slots: readonly AffiliateSlot[];
  /** Enlace para una búsqueda, o `null` si el programa no está configurado. */
  link: (config: AffiliateConfig, query: string, locale: AffiliateLocale) => string | null;
  /** Frase legal propia del programa, si la exige. */
  disclosure?: Record<AffiliateLocale, string>;
}

const enc = encodeURIComponent;

function fromTemplate(template: string | undefined, query: string, locale: AffiliateLocale): string | null {
  const t = template?.trim();
  if (!t || !/^https:\/\//.test(t)) return null;
  return t.replace(/\{q\}/g, enc(query)).replace(/\{lang\}/g, locale === "en" ? "en" : "es");
}

export const PROGRAMS: readonly ProgramDef[] = [
  {
    id: "civitatis",
    sponsor: "Civitatis",
    slots: ["activity"],
    // Civitatis identifica al afiliado con ?aid= en cualquier URL de su web.
    link: (c, _q, locale) =>
      c.civitatisAid ? `https://www.civitatis.com/${locale === "en" ? "en" : "es"}/barcelona/?aid=${enc(c.civitatisAid)}` : null,
  },
  {
    id: "getyourguide",
    sponsor: "GetYourGuide",
    slots: ["activity", "tickets"],
    link: (c, q, locale) =>
      c.getYourGuidePartnerId
        ? `https://www.getyourguide.${locale === "en" ? "com" : "es"}/s/?q=${enc(q)}&partner_id=${enc(c.getYourGuidePartnerId)}`
        : null,
  },
  {
    id: "viator",
    sponsor: "Viator",
    slots: ["activity"],
    link: (c, q, locale) => fromTemplate(c.viatorUrlTemplate, q, locale),
  },
  {
    id: "tiqets",
    sponsor: "Tiqets",
    slots: ["tickets"],
    link: (c, q, locale) => fromTemplate(c.tiqetsUrlTemplate, q, locale),
  },
  {
    id: "amazon",
    sponsor: "Amazon",
    slots: ["sun_protection"],
    link: (c, q) => (c.amazonTag ? `https://www.amazon.es/s?k=${enc(q)}&tag=${enc(c.amazonTag)}` : null),
    // Cláusula 5 del acuerdo operativo de Amazon Afiliados España (o una frase sustancialmente igual).
    disclosure: {
      es: "En calidad de Afiliado de Amazon, obtengo ingresos por las compras adscritas que cumplen los requisitos aplicables.",
      ca: "Com a afiliat d'Amazon, obtinc ingressos per les compres adscrites que compleixen els requisits aplicables.",
      en: "As an Amazon Associate I earn from qualifying purchases.",
    },
  },
  {
    id: "booking",
    sponsor: "Booking.com",
    slots: ["stay"],
    link: (c, q, locale) => fromTemplate(c.bookingUrlTemplate, q, locale),
  },
];

/** Configuración desde las variables de entorno públicas del build (todas opcionales). */
export function configFromEnv(): AffiliateConfig {
  const env = import.meta.env;
  const v = (x: string | undefined) => (x ?? "").trim() || undefined;
  return {
    civitatisAid: v(env.VITE_AFF_CIVITATIS_AID),
    getYourGuidePartnerId: v(env.VITE_AFF_GYG_PARTNER_ID),
    amazonTag: v(env.VITE_AFF_AMAZON_TAG),
    viatorUrlTemplate: v(env.VITE_AFF_VIATOR_URL),
    tiqetsUrlTemplate: v(env.VITE_AFF_TIQETS_URL),
    bookingUrlTemplate: v(env.VITE_AFF_BOOKING_URL),
  };
}
