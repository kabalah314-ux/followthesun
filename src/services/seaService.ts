import { getLang, tr } from "../i18n";
import { fetchJson } from "./weatherService";

/**
 * seaService — temperatura del agua y altura de las olas frente a Barcelona (guía maestra 2,
 * utilidad 6 «Playa»). Open-Meteo Marine (CC BY 4.0, sin clave): una serie horaria por sesión,
 * cacheada 3 h. Es un dato de escala de ciudad, igual para todas las playas.
 */

const MARINE_URL = "https://marine-api.open-meteo.com/v1/marine";
// Mar abierto frente a la Barceloneta y el Bogatell.
const POINT = { lat: 41.39, lng: 2.21 } as const;
const TTL_MS = 3 * 3_600_000;
const HOUR = 3_600_000;

interface SeaData {
  t0: number;
  water: number[];
  wave: number[] | null;
  fetchedAt: number;
}

export interface SeaSample {
  /** Temperatura del agua en superficie (°C). */
  waterC: number;
  /** Altura significativa de las olas (m). */
  waveM: number | null;
}

const asNumbers = (v: unknown): number[] | null =>
  Array.isArray(v) && v.every((x) => typeof x === "number" || x === null)
    ? (v as Array<number | null>).map((x) => (x === null ? NaN : x))
    : null;

/** Valor horario interpolado en `t` (NaN fuera de la serie o sin dato). */
export function sampleSeries(t0: number, arr: readonly number[], t: number): number {
  const idx = (t - t0) / HOUR;
  if (!(idx >= 0) || idx > arr.length - 1) return NaN;
  const i = Math.floor(idx);
  const f = idx - i;
  const a = arr[i];
  const b = arr[Math.min(i + 1, arr.length - 1)];
  if (Number.isNaN(a)) return NaN;
  return Number.isNaN(b) ? a : a + (b - a) * f;
}

class SeaService {
  private data: SeaData | null = null;
  private promise: Promise<boolean> | null = null;

  load(): Promise<boolean> {
    if (this.data && Date.now() - this.data.fetchedAt < TTL_MS) return Promise.resolve(true);
    if (this.promise) return this.promise;
    this.promise = (async () => {
      try {
        const url =
          `${MARINE_URL}?latitude=${POINT.lat}&longitude=${POINT.lng}` +
          `&hourly=sea_surface_temperature,wave_height&timeformat=unixtime&forecast_days=8&cell_selection=sea`;
        const json = (await fetchJson(url, 12_000)) as { hourly?: Record<string, unknown> };
        const times = asNumbers(json.hourly?.time);
        const water = asNumbers(json.hourly?.sea_surface_temperature);
        if (!times || !water || times.length < 3) throw new Error("respuesta");
        this.data = { t0: times[0] * 1000, water, wave: asNumbers(json.hourly?.wave_height), fetchedAt: Date.now() };
        return true;
      } catch {
        return this.data !== null;
      } finally {
        this.promise = null;
      }
    })();
    return this.promise;
  }

  hasData(): boolean {
    return this.data !== null;
  }

  sampleAt(t: number): SeaSample | null {
    const d = this.data;
    if (!d) return null;
    const water = sampleSeries(d.t0, d.water, t);
    if (Number.isNaN(water)) return null;
    const wave = d.wave ? sampleSeries(d.t0, d.wave, t) : NaN;
    return { waterC: water, waveM: Number.isNaN(wave) ? null : Math.max(0, wave) };
  }
}

export const seaService = new SeaService();

const decimal = (v: number) => new Intl.NumberFormat(getLang() === "en" ? "en-GB" : getLang(), { maximumFractionDigits: 1, minimumFractionDigits: 1 }).format(v);

/** «Agua a 22 °C · olas de 0,4 m» o «Agua a 22 °C · mar en calma». */
export function seaLine(s: SeaSample): string {
  const parts = [tr("sea.agua", { p0: Math.round(s.waterC) })];
  if (s.waveM !== null) parts.push(s.waveM < 0.25 ? tr("sea.calma") : tr("sea.olas", { p0: decimal(Math.round(s.waveM * 10) / 10) }));
  return parts.join(" · ");
}
