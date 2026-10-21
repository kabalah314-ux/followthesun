/**
 * Open Data BCN — configuración de los conjuntos de datos abiertos del Ajuntament de Barcelona.
 *
 * Todos son CC BY 4.0: se pueden guardar, cachear y mostrar sobre cualquier mapa citando la fuente
 * («Ajuntament de Barcelona · Open Data BCN»). Se descargan desde el navegador (la API CKAN del
 * portal responde con CORS) y se guardan una semana, con respaldo de hasta dos meses.
 */
export const OPEN_DATA_CONFIG = {
  apiBase: "https://opendata-ajuntament.barcelona.cat/data/api/3/action/",
  timeoutMs: 25_000,
  /** Los conjuntos cambian como mucho cada semestre (terrazas) o cada año (fuentes). */
  ttlMs: 7 * 24 * 3_600_000,
  maxStaleMs: 60 * 24 * 3_600_000,
  /** Tras un fallo sin respaldo no se vuelve a insistir antes de este tiempo. */
  retryAfterMs: 5 * 60_000,
  attribution: "Ajuntament de Barcelona · Open Data BCN (CC BY 4.0)",
  datasets: {
    /** Licencias de terrazas vigentes (CSV semestral, «;»). Sin nombre del local. */
    terraces: "terrasses-comercos-vigents",
    /** Fuentes de agua de boca (CSV anual, «,»). */
    fountains: "fonts",
    /** Red de refugios climáticos (formato NP-NASIA: se lee del datastore). */
    shelters: "xarxa-refugis-climatics",
    /** Lavabos públicos (NP-NASIA, datastore). */
    toilets: "lavabos-publics",
    /** Miradores (NP-NASIA, datastore). */
    viewpoints: "np-nasia-miradors",
    /** Áreas de juego infantil: un registro por elemento de juego; se agrupan por espacio. */
    playgrounds: "culturailleure-espaisinfantils",
  },
  /** Una terraza con licencia y un local de OpenStreetMap a esta distancia son el mismo negocio. */
  terraceMatchRadiusM: 15,
  /** Licencias a menos de esta distancia entre sí son la misma terraza (acera + calzada…). */
  terraceMergeRadiusM: 3,
  /** Elementos de juego del mismo espacio a menos de esta distancia forman un área. */
  playgroundMergeM: 90,
  /** Un mirador del Ajuntament a menos de esta distancia de uno de OSM es el mismo. */
  viewpointDedupeM: 80,
} as const;
