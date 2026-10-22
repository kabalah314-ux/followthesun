/// <reference types="vite/client" />

interface ImportMetaEnv {
  /** Token público de Mapbox (pk.…). Ver `.env.example`. */
  readonly VITE_MAPBOX_TOKEN?: string;
  /** Clave de Open-Meteo para uso comercial (opcional). */
  readonly VITE_OPEN_METEO_API_KEY?: string;
  /** URL base de Open-Meteo o de un proxy propio (opcional). */
  readonly VITE_OPEN_METEO_BASE_URL?: string;
  /** URL base de la API de radiación satelital o de un proxy propio (opcional). */
  readonly VITE_OPEN_METEO_SATELLITE_BASE_URL?: string;
  /** Servidor Overpass propio para el inventario de lugares (opcional). */
  readonly VITE_OVERPASS_URL?: string;
  /** "hash" para servidores estáticos sin redirección de rutas a index.html (opcional). */
  readonly VITE_ROUTER_MODE?: string;
  /** Token de cliente de Mapillary para fotos de calle y 360° en la ficha (opcional). */
  readonly VITE_MAPILLARY_TOKEN?: string;
  /** Afiliación (opcional; sin estos valores no aparece ningún enlace de afiliado). */
  readonly VITE_AFF_CIVITATIS_AID?: string;
  readonly VITE_AFF_GYG_PARTNER_ID?: string;
  readonly VITE_AFF_AMAZON_TAG?: string;
  /** Plantillas https con {q} (búsqueda) y {lang} para redes con enlaces propios. */
  readonly VITE_AFF_VIATOR_URL?: string;
  readonly VITE_AFF_TIQETS_URL?: string;
  readonly VITE_AFF_BOOKING_URL?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
