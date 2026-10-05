import {
  getSunPosition,
  getSunTimes,
  getSunTrajectory,
  type SunPosition,
  type SunTimes,
  type TrajectoryPoint,
} from "../lib/solarCalculations";

/**
 * solarService — posición del sol y horas solares.
 *
 * Fachada estable sobre `lib/solarCalculations` (astronomía local, sin red).
 * Para usar una API externa basta con registrar otro `SolarProvider`.
 */

export { SUN_UP_RAD, compassLabel } from "../lib/solarCalculations";
export type { SunPosition, SunTimes, TrajectoryPoint } from "../lib/solarCalculations";

export interface SolarProvider {
  id: string;
  getPosition(timeMs: number, lat: number, lng: number): SunPosition;
  getSunTimes(dayStartMs: number, lat: number, lng: number): SunTimes;
  getTrajectory(dayStartMs: number, lat: number, lng: number, stepMinutes?: number): TrajectoryPoint[];
}

const astronomical: SolarProvider = {
  id: "astronomical",
  getPosition: getSunPosition,
  getSunTimes,
  getTrajectory: getSunTrajectory,
};

let provider: SolarProvider = astronomical;

export const solarService = {
  setProvider(p: SolarProvider) {
    provider = p;
  },
  getPosition: (timeMs: number, lat: number, lng: number) => provider.getPosition(timeMs, lat, lng),
  getSunTimes: (dayStartMs: number, lat: number, lng: number) =>
    provider.getSunTimes(dayStartMs, lat, lng),
  getTrajectory: (dayStartMs: number, lat: number, lng: number, stepMinutes?: number) =>
    provider.getTrajectory(dayStartMs, lat, lng, stepMinutes),
};
