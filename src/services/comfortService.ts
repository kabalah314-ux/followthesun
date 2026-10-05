import { BARCELONA, WEATHER_API } from "../config";
import type { ComfortSummary } from "../types";
import { fetchJson } from "./weatherService";

/**
 * comfortService — temperatura, sensación térmica y viento, solo para el modo «equilibrado».
 *
 * No es un modelo fisiológico: aporta tres números horarios del modelo meteorológico (Open-Meteo)
 * que `sunScoreService` usa con reglas simples y visibles (calor y viento restan puntos). Se pide
 * una sola vez por sesión (caché de 60 min) y solo si la persona elige el modo equilibrado.
 */

const TTL_MS = 60 * 60_000;
const HOUR = 3_600_000;

interface ComfortData {
  t0: number;
  temp: number[];
  apparent: number[];
  wind: number[];
  fetchedAt: number;
}

const asNumbers = (v: unknown): number[] | null =>
  Array.isArray(v) && v.every((x) => typeof x === "number" || x === null)
    ? (v as Array<number | null>).map((x) => (x === null ? NaN : x))
    : null;

class ComfortService {
  private data: ComfortData | null = null;
  private promise: Promise<boolean> | null = null;

  /** Devuelve true si hay datos (frescos o, si la red falla, el último guardado). */
  load(): Promise<boolean> {
    if (this.data && Date.now() - this.data.fetchedAt < TTL_MS) return Promise.resolve(true);
    if (this.promise) return this.promise;

    this.promise = (async () => {
      try {
        let url =
          `${WEATHER_API.baseUrl}/v1/forecast?latitude=${BARCELONA.lat}&longitude=${BARCELONA.lng}` +
          `&hourly=temperature_2m,apparent_temperature,wind_speed_10m&timeformat=unixtime&forecast_days=8`;
        if (WEATHER_API.apiKey) url += `&apikey=${encodeURIComponent(WEATHER_API.apiKey)}`;
        const json = (await fetchJson(url, 12_000)) as { hourly?: Record<string, unknown> };
        const h = json.hourly;
        const times = asNumbers(h?.time);
        const temp = asNumbers(h?.temperature_2m);
        const apparent = asNumbers(h?.apparent_temperature);
        const wind = asNumbers(h?.wind_speed_10m);
        if (!times || !temp || !apparent || !wind || times.length < 3) throw new Error("respuesta");
        this.data = { t0: times[0] * 1000, temp, apparent, wind, fetchedAt: Date.now() };
        return true;
      } catch {
        return this.data !== null;
      } finally {
        this.promise = null;
      }
    })();
    return this.promise;
  }

  private sample(arr: number[], t: number): number {
    const d = this.data;
    if (!d) return NaN;
    const idx = (t - d.t0) / HOUR;
    if (idx < 0 || idx > arr.length - 1) return NaN;
    const i = Math.floor(idx);
    const f = idx - i;
    const a = arr[i];
    const b = arr[Math.min(i + 1, arr.length - 1)];
    if (Number.isNaN(a)) return NaN;
    return Number.isNaN(b) ? a : a + (b - a) * f;
  }

  /** Resumen de confort en [start, end]. null si no hay datos para esa franja. */
  summarize(start: number, end: number): ComfortSummary | null {
    if (!this.data) return null;
    const n = 6;
    let temp = 0;
    let app = 0;
    let count = 0;
    let wind = 0;
    for (let k = 0; k < n; k++) {
      const t = start + ((end - start) * k) / Math.max(1, n - 1);
      const a = this.sample(this.data.apparent, t);
      const tt = this.sample(this.data.temp, t);
      const w = this.sample(this.data.wind, t);
      if (Number.isNaN(a) || Number.isNaN(tt) || Number.isNaN(w)) continue;
      temp += tt;
      app += a;
      wind = Math.max(wind, w);
      count++;
    }
    if (count === 0) return null;
    return {
      meanTemperatureC: temp / count,
      meanApparentC: app / count,
      maxWindKmh: wind,
      source: "Open-Meteo (modelo)",
    };
  }
}

export const comfortService = new ComfortService();
