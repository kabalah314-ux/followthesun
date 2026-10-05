import { calculateClearSkyValues, dniIndex, ghiIndex } from "../lib/radiationCalculations";
import type { ClearSkyRadiation } from "../types";
import { satelliteService } from "./satelliteService";

/**
 * radiationService — radiación de cielo despejado y transmisión del haz directo.
 *
 * Qué es OBSERVADO y qué es CALCULADO:
 *  · CALCULADO  la referencia de cielo despejado (Meinel para DNI, Haurwitz para GHI) de
 *               `lib/radiationCalculations`. No es un dato: ±10-15 % según turbidez.
 *  · OBSERVADO  el GHI de cielo despejado que publica el satélite. Si existe, se calcula un factor
 *               de calibración (mediana de satélite / calculado en las horas de sol alto, limitado
 *               a ±15 %) y la referencia calculada se escala con él ("satellite-calibrated").
 *
 * Validado contra la API real: pico de GHI de cielo despejado el 2 de octubre en Barcelona,
 * 709 W/m² (satélite) frente a 712 W/m² (Haurwitz).
 *
 * Nada de esto inventa datos: sin GHI de cielo despejado del satélite, el factor es 1 y la
 * referencia queda marcada como "calculated".
 */

export const radiationService = {
  /** Factor con el que se calibra el cielo despejado calculado (1 si el satélite no lo aporta). */
  getClearSkyCalibration: () => satelliteService.getCalibration(),

  /**
   * Cielo despejado esperable (W/m²) en un punto e instante. DNI/GHI calculados y, si el satélite
   * lo permite, calibrados con su cielo despejado.
   */
  getClearSkyRadiation(latitude: number, longitude: number, timestamp: Date | number): ClearSkyRadiation {
    const t = typeof timestamp === "number" ? timestamp : timestamp.getTime();
    const cs = calculateClearSkyValues(latitude, longitude, t);
    const cal = satelliteService.getCalibration();
    const k = cal.factor;
    return {
      latitude,
      longitude,
      timestamp: new Date(t),
      ghi: cs.ghi * k,
      dni: cs.dni * k,
      dhi: cs.dhi * k,
      source: cal.source === "satellite" ? "satellite-calibrated" : "calculated",
      calibrationFactor: k,
    };
  },

  /** DNI / DNI de cielo despejado → 0-1 (NaN con el sol bajo). */
  directTransmission: (dni: number, clearDni: number) => dniIndex(dni, clearDni),

  /** GHI / GHI de cielo despejado. */
  clearSkyIndex: (ghi: number, clearGhi: number) => ghiIndex(ghi, clearGhi),
};
