/** Secciones principales de Follow the Sun. El mapa permanece montado al cambiar de vista. */
export type AppView = "explore" | "find" | "plan" | "places" | "saved" | "settings" | "about";

export const isSearchView = (view: AppView): view is "find" | "plan" =>
  view === "find" || view === "plan";