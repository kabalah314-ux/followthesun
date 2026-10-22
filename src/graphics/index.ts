/**
 * Motor gráfico («Mapa nítido», Fase A de la guía 2) — API pública.
 *
 *  · Calidad:   `qualityApi` (Alta / Media / Ahorro / Auto), `useQuality()` para React.
 *  · Día:       `useDayAnimation({ getRange, scrub })` (botón ▶ listo) o `createDayAnimation`
 *               + `sunriseSunsetRange` («el día en 12 segundos»).
 *  · Vídeo:     `MapController.recordDayVideo(…)` o `recordDayVideo(map, …)` → Blob MP4/WebM;
 *               `canRecordVideo()` y `videoFileExtension()` para el nombre del archivo.
 *  · Cámara:    `MapController.flyToCinematic` / `setPadding` (lógica en `cinematicCamera`).
 *
 * La capa solar en la GPU (`SolarGLLayer`) la monta el motor solo: no hace falta tocarla.
 */
export {
  QUALITY_SETTINGS,
  qualityApi,
  type QualityLevel,
  type QualityPreference,
  type QualityReason,
  type QualitySettings,
  type QualityState,
} from "./quality";
export { useQuality } from "./useQuality";
export { useDayAnimation, type DayAnimationControls, type UseDayAnimationOptions } from "./useDayAnimation";
export {
  createDayAnimation,
  dayTimeAt,
  easeInOutSine,
  sunriseSunsetRange,
  type DayAnimation,
  type DayAnimationOptions,
  type DayRange,
} from "./dayAnimation";
export {
  canRecordVideo,
  pickVideoMimeType,
  recordDayVideo,
  videoFileExtension,
  type RecordDayVideoOptions,
} from "./recordDayVideo";
export { cinematicCamera, normalizeBearing, type CinematicOptions } from "./cinematic";
