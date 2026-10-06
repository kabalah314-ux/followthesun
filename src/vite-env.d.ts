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
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
