/**
 * Preferencias de la persona (solo en este dispositivo, localStorage).
 * Sin dependencias de servicios: cualquier módulo puede leerlas.
 */

export type TimeFormat = "24h" | "12h";
export type DistanceUnit = "km" | "mi";
export type TemperatureUnit = "c" | "f";
export type MapThemePreference = "auto" | "light" | "dark";

export interface Preferences {
  timeFormat: TimeFormat;
  distanceUnit: DistanceUnit;
  temperatureUnit: TemperatureUnit;
  /** Automático: claro de día, oscuro de noche (según el sol del instante elegido). */
  mapTheme: MapThemePreference;
  /** Capas del mapa (las mismas que el panel «Capas»): se recuerdan. */
  showBuildings: boolean;
  showShadows: boolean;
  showClouds: boolean;
  showSunPath: boolean;
  /** Edificios en 3D (altura real, iluminados por el sol) al acercarse. */
  buildings3D: boolean;
  /** Inclinar el mapa automáticamente al acercarse para ver el relieve. */
  autoTilt: boolean;
  sidebarCollapsed: boolean;
  /** Ver la ciudad con imagen de satélite en lugar del mapa dibujado. */
  satelliteView: boolean;
  /** Línea de tiempo oculta: solo queda el acceso compacto con la hora. */
  timelineHidden: boolean;
}

export const DEFAULT_PREFERENCES: Preferences = {
  timeFormat: "24h",
  distanceUnit: "km",
  temperatureUnit: "c",
  mapTheme: "auto",
  showBuildings: true,
  showShadows: true,
  showClouds: true,
  showSunPath: false,
  buildings3D: true,
  autoTilt: true,
  sidebarCollapsed: false,
  satelliteView: true,
  timelineHidden: false,
};

const KEY = "fts:prefs:v1";

function load(): Preferences {
  try {
    const raw = window.localStorage.getItem(KEY);
    if (!raw) return DEFAULT_PREFERENCES;
    const parsed = JSON.parse(raw) as Partial<Preferences> | null;
    return { ...DEFAULT_PREFERENCES, ...(parsed && typeof parsed === "object" ? parsed : {}) };
  } catch {
    return DEFAULT_PREFERENCES;
  }
}

let current: Preferences = typeof window === "undefined" ? DEFAULT_PREFERENCES : load();
const listeners = new Set<() => void>();

export const preferences = {
  get: (): Preferences => current,
  subscribe(listener: () => void) {
    listeners.add(listener);
    return () => {
      listeners.delete(listener);
    };
  },
  set(patch: Partial<Preferences>) {
    current = { ...current, ...patch };
    try {
      window.localStorage.setItem(KEY, JSON.stringify(current));
    } catch {
      /* sin almacenamiento: sigue funcionando en memoria */
    }
    listeners.forEach((l) => l());
  },
};

export const getPreferences = (): Preferences => current;
