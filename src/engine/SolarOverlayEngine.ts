import { BARCELONA, BUILDINGS_3D, MAP_CONFIG, SOLAR_FIELD } from "../config";
import { clamp, myToLat, smoothstep } from "../lib/coordinates";
import { SUN_UP_RAD } from "../lib/solarCalculations";
import { SolarGrid, type SolarSample } from "../lib/solarGrid";
import {
  BUILDINGS_QUERY_LAYER,
  buildingService,
  buildingsCover,
  type BuildingSet,
} from "../services/buildingService";
import { lightFusionService } from "../services/lightFusionService";
import type { MapLike } from "../services/map/types";
import { createWeatherSolarSource, type SolarFieldSource } from "../services/solarFieldService";
import { solarService, type SunPosition } from "../services/solarService";
import { sunlightService, type PointEvaluator } from "../services/sunlightService";
import { startOfZoneDay } from "../services/timeService";
import type {
  CityDirection,
  CityStats,
  Highlight,
  LightSourceMode,
  LngLat,
  PointTimeline,
  SolarPoint,
  SunlightResult,
  View,
} from "../types";
import { SolarHeatmap } from "./layers/SolarHeatmap";
import { ShadowLayer } from "./layers/ShadowLayer";
import { SunPositionLayer } from "./layers/SunPosition";
import { computeView, projectLngLat } from "./view";

/**
 * SolarOverlayEngine — orquesta la capa solar sobre el mapa.
 *
 * Un canvas 2D sincronizado con la cámara compone, de abajo arriba, capas independientes:
 *   1. SolarHeatmap (luz)     calidez del sol directo + sombra neutra del relieve
 *   2. ShadowLayer            sombras de edificios con los tejados iluminados
 *   3. SolarHeatmap (nubes)   velo suave proporcional a lo que las nubes bloquean
 *   4. zonas destacadas (Find the Sun) y SunPosition (trayectoria y sol)
 *
 * Separación de trabajo (mover el selector de tiempo NO recalcula todo):
 *   · sol          posición astronómica por fotograma (barato)
 *   · nubes        datos en memoria (`cloudService`); la rejilla solo se recalcula si cambia el
 *                  instante o llegan datos nuevos — nunca hay peticiones de red al arrastrar
 *   · edificios    geometría extraída de las teselas al terminar de mover el mapa
 *   · dibujo       canvas; solo se redibuja si cambió la cámara, el tiempo o una capa
 *   · interfaz     resultados enviados a React con límite de frecuencia
 *
 * Solo depende de la interfaz `MapLike`: funciona igual con Mapbox GL JS y MapLibre GL JS.
 */

export interface EngineOptions {
  /** Id de la fuente vectorial del estilo (para refrescar los edificios al cargar teselas). */
  sourceId: string;
  getAreaName(lng: number, lat: number, zoom: number): string;
  onStats(stats: CityStats): void;
  onPointTimeline(timeline: PointTimeline | null): void;
  onPointSunlight(result: SunlightResult | null): void;
}

/** Opacidad de la sombra de edificios (se refuerza un poco más al acercarse). */
const SHADOW_ALPHA = 0.46;
const MAX_GROUND_M = 16_000;
const EXTRUDE_FROM_ZOOM = BUILDINGS_3D.fromZoom;
const EXTRUDE_FULL_ZOOM = BUILDINGS_3D.fullZoom;
/** Intervalo mínimo entre resultados enviados a la interfaz mientras se mueve el tiempo. */
const POINT_EMIT_MS = 90;

const DIRECTIONS: CityDirection[] = [
  "north",
  "northeast",
  "east",
  "southeast",
  "south",
  "southwest",
  "west",
  "northwest",
];

const approach = (a: number, b: number, step: number) =>
  a < b ? Math.min(b, a + step) : Math.max(b, a - step);

interface ExtractInfo {
  cx: number;
  cy: number;
  zoom: number;
  bearing: number;
  pitch: number;
  half: number;
}

export class SolarOverlayEngine {
  private map: MapLike;
  private opts: EngineOptions;

  private canvas: HTMLCanvasElement;
  private ctx: CanvasRenderingContext2D;
  private statCv = document.createElement("canvas");
  private statCtx: CanvasRenderingContext2D;

  private heatmap = new SolarHeatmap();
  private shadows = new ShadowLayer();
  private sunPath = new SunPositionLayer();

  private width = 0;
  private height = 0;
  private dpr = 1;

  private targetTime = Date.now();
  private displayTime = Date.now();
  private dayStart: number;

  private grid = new SolarGrid(SOLAR_FIELD.bounds, SOLAR_FIELD.cols, SOLAR_FIELD.rows);
  private source: SolarFieldSource = createWeatherSolarSource();
  private externalPoints = false;
  private weatherAvailable = false;
  private fieldKey = "";
  private fieldVersion = 0;
  private sample: SolarSample = { sunlight: 0, shadow: 0, cloudCoverage: 0 };
  private unsubWeather: () => void;

  private buildings: BuildingSet | null = null;
  private extractInfo: ExtractInfo | null = null;
  private sourceDirty = true;

  private showShadows = true;
  private showClouds = true;
  /** Edificios en 3D al acercarse (siluetas recortadas y luz del mapa según el sol). */
  private buildings3D = true;
  private lightKey = "";
  private lightMode: LightSourceMode = "fused";
  private showSunPath = false;
  private shadowsFade = 1;
  private cloudsFade = 1;
  private pathFade = 0;
  private highlightFade = 0;
  private highlights: Highlight[] = [];
  private selection: LngLat | null = null;
  private pointEvaluator: PointEvaluator | null = null;
  private pointEmitTimer = 0;

  private dirty = true;
  private statsDirty = true;
  private lastStatsAt = 0;
  private maskActive = false;
  private lastBFade = 0;
  private lastView: View | null = null;
  private lastSun: SunPosition | null = null;
  private viewKey = "";
  private raf = 0;
  private lastTs = 0;
  private destroyed = false;
  private refreshTimer = 0;
  private refreshPending = false;
  private timelineTimer = 0;
  private lastAreaKey = "";
  private lastArea = "Barcelona";

  constructor(map: MapLike, opts: EngineOptions) {
    this.map = map;
    this.opts = opts;

    this.canvas = document.createElement("canvas");
    this.canvas.className = "fts-sun-canvas";
    const gl = map.getCanvas();
    gl.parentElement?.insertBefore(this.canvas, gl.nextSibling);
    this.ctx = this.canvas.getContext("2d")!;
    this.statCtx = this.statCv.getContext("2d", { willReadFrequently: true })!;

    this.dayStart = startOfZoneDay(Date.now());

    map.on("render", this.onRender);
    map.on("resize", this.markDirty);
    map.on("moveend", this.onMoveEnd);
    map.on("idle", this.onIdle);
    map.on("sourcedata", this.onSourceData);

    // Cuando llegan o se refrescan los datos meteorológicos, se rehace la capa y el punto.
    this.unsubWeather = lightFusionService.subscribe(this.onWeatherChange);

    this.raf = requestAnimationFrame(this.loop);
  }

  /* ------------------------------ API pública ------------------------------ */

  setTarget(timeMs: number, immediate = false) {
    this.targetTime = timeMs;
    if (immediate) this.displayTime = timeMs;
    this.dirty = true;
    if (this.pointEvaluator) this.schedulePointEmit();
  }

  setDay(dayStart: number) {
    if (dayStart === this.dayStart) return;
    this.dayStart = dayStart;
    this.invalidateField();
    this.recomputeTimeline();
  }

  /**
   * Entrega datos solares externos. Mientras haya puntos, sustituyen a la fuente de terreno + nubes.
   * Con `null` se vuelve a la fuente por defecto.
   */
  setSolarPoints(points: SolarPoint[] | null) {
    if (points && points.length > 0) {
      this.grid.setPoints(points);
      this.externalPoints = true;
    } else {
      this.externalPoints = false;
    }
    this.invalidateField();
  }

  setShowShadows(v: boolean) {
    this.showShadows = v;
    this.dirty = true;
  }

  setShowClouds(v: boolean) {
    this.showClouds = v;
    this.dirty = true;
  }

  /** Relieve 3D: al acercarse, los edificios se levantan con su altura real y el sol los ilumina. */
  setBuildings3D(v: boolean) {
    this.buildings3D = v;
    this.lightKey = "";
    this.dirty = true;
  }

  /** Qué fuente alimenta la capa de nubes: fusión (por defecto), solo modelo o solo satélite. */
  setLightSource(mode: LightSourceMode) {
    if (mode === this.lightMode) return;
    this.lightMode = mode;
    this.invalidateField();
  }

  setShowSunPath(v: boolean) {
    this.showSunPath = v;
    this.dirty = true;
  }

  setHighlights(list: Highlight[]) {
    this.highlights = list;
    this.dirty = true;
  }

  selectPoint(p: LngLat | null) {
    this.selection = p;
    this.dirty = true;
    window.clearTimeout(this.timelineTimer);
    window.clearTimeout(this.pointEmitTimer);
    this.pointEmitTimer = 0;
    if (!p) {
      this.pointEvaluator = null;
      this.opts.onPointTimeline(null);
      this.opts.onPointSunlight(null);
      return;
    }
    this.recomputeTimeline();
  }

  reveal() {
    this.canvas.style.opacity = "1";
    this.scheduleRefresh(80);
  }

  getBuildings() {
    return this.buildings;
  }

  getDayStart() {
    return this.dayStart;
  }

  destroy() {
    this.destroyed = true;
    cancelAnimationFrame(this.raf);
    window.clearTimeout(this.refreshTimer);
    window.clearTimeout(this.timelineTimer);
    window.clearTimeout(this.pointEmitTimer);
    this.unsubWeather();
    this.map.off("render", this.onRender);
    this.map.off("resize", this.markDirty);
    this.map.off("moveend", this.onMoveEnd);
    this.map.off("idle", this.onIdle);
    this.map.off("sourcedata", this.onSourceData);
    this.canvas.remove();
  }

  private invalidateField() {
    this.fieldVersion++;
    this.dirty = true;
  }

  private onWeatherChange = () => {
    if (this.destroyed) return;
    this.invalidateField();
    this.recomputeTimeline();
  };

  /* ------------------------------ eventos del mapa ------------------------------ */

  private markDirty = () => {
    this.dirty = true;
  };

  private cameraKey() {
    const m = this.map;
    const c = m.getCenter();
    const el = m.getContainer();
    return `${c.lng}|${c.lat}|${m.getZoom()}|${m.getBearing()}|${m.getPitch()}|${el.clientWidth}|${el.clientHeight}`;
  }

  private onRender = () => {
    if (this.destroyed) return;
    if (this.cameraKey() !== this.viewKey) this.dirty = true;
    // Durante la animación de entrada (zoom) los edificios aparecen al cruzar el zoom mínimo.
    if (
      (!this.buildings || this.buildings.count === 0) &&
      this.map.getZoom() >= MAP_CONFIG.buildingMinZoom + 0.1 &&
      !this.refreshPending
    ) {
      this.scheduleRefresh(260);
    }
    if (this.dirty) this.draw();
  };

  private onMoveEnd = () => this.scheduleRefresh(140);
  private onIdle = () => this.scheduleRefresh(60);

  private onSourceData = (e: any) => {
    if (e?.sourceId === this.opts.sourceId) {
      this.sourceDirty = true;
      this.scheduleRefresh(260);
    }
  };

  private scheduleRefresh(delay: number) {
    window.clearTimeout(this.refreshTimer);
    this.refreshPending = true;
    this.refreshTimer = window.setTimeout(() => {
      this.refreshPending = false;
      this.refreshBuildings();
    }, delay);
  }

  private refreshBuildings() {
    if (this.destroyed) return;
    try {
      if (this.map.getZoom() < MAP_CONFIG.buildingMinZoom - 0.01) return;
      if (!this.map.getLayer(BUILDINGS_QUERY_LAYER)) return;

      // Evita reprocesar miles de edificios si la vista sigue dentro de la zona ya extraída.
      const info = this.extractInfo;
      const view = this.lastView;
      if (info && view && this.buildings && this.buildings.count > 0 && !this.sourceDirty) {
        const near =
          Math.abs(view.cx - info.cx) < info.half * 0.12 && Math.abs(view.cy - info.cy) < info.half * 0.12;
        if (
          near &&
          Math.abs(this.map.getZoom() - info.zoom) < 0.25 &&
          Math.abs(this.map.getBearing() - info.bearing) < 4 &&
          Math.abs(this.map.getPitch() - info.pitch) < 4
        ) {
          return;
        }
      }

      const set = buildingService.extract(this.map);
      if (!set) return;
      const cov = set.coverage;
      this.extractInfo = {
        cx: (cov.minX + cov.maxX) / 2,
        cy: (cov.minY + cov.maxY) / 2,
        zoom: this.map.getZoom(),
        bearing: this.map.getBearing(),
        pitch: this.map.getPitch(),
        half: (cov.maxX - cov.minX) / 2,
      };
      this.sourceDirty = false;
      this.buildings = set;
      this.dirty = true;
      if (this.selection) {
        window.clearTimeout(this.timelineTimer);
        this.timelineTimer = window.setTimeout(() => this.recomputeTimeline(), 280);
      }
    } catch {
      /* el estilo aún no está listo */
    }
  }

  /** Línea de tiempo del día y luz efectiva del punto seleccionado (con edificios y nubes actuales). */
  private recomputeTimeline() {
    const sel = this.selection;
    if (!sel || this.destroyed) return;
    const covered = buildingsCover(this.buildings, sel.lng, sel.lat, 300);
    const buildings = covered ? this.buildings : null;

    this.pointEvaluator = sunlightService.createPointEvaluator({
      latitude: sel.lat,
      longitude: sel.lng,
      buildings,
    });
    this.opts.onPointTimeline(
      sunlightService.computeTimeline({
        lng: sel.lng,
        lat: sel.lat,
        dayStart: this.dayStart,
        buildings,
      })
    );
    this.emitPointSunlight();
  }

  private emitPointSunlight() {
    if (!this.pointEvaluator || this.destroyed) return;
    this.opts.onPointSunlight(this.pointEvaluator.evaluate(this.targetTime));
  }

  /** Límite de frecuencia: mientras se arrastra el tiempo, un resultado cada ~90 ms. */
  private schedulePointEmit() {
    if (this.pointEmitTimer) return;
    this.pointEmitTimer = window.setTimeout(() => {
      this.pointEmitTimer = 0;
      this.emitPointSunlight();
    }, POINT_EMIT_MS);
  }

  /* ------------------------------ bucle ------------------------------ */

  private loop = (ts: number) => {
    if (this.destroyed) return;
    this.raf = requestAnimationFrame(this.loop);
    const dt = Math.min(0.1, Math.max(0.001, (ts - this.lastTs) / 1000));
    this.lastTs = ts;

    const diff = this.targetTime - this.displayTime;
    if (diff !== 0) {
      if (Math.abs(diff) < 20_000) this.displayTime = this.targetTime;
      else this.displayTime += diff * (1 - Math.exp(-dt / 0.16));
      this.dirty = true;
    }

    const sT = this.showShadows ? 1 : 0;
    if (this.shadowsFade !== sT) {
      this.shadowsFade = approach(this.shadowsFade, sT, dt / 0.45);
      this.dirty = true;
    }
    const cT = this.showClouds ? 1 : 0;
    if (this.cloudsFade !== cT) {
      this.cloudsFade = approach(this.cloudsFade, cT, dt / 0.5);
      this.dirty = true;
    }
    const pT = this.showSunPath ? 1 : 0;
    if (this.pathFade !== pT) {
      this.pathFade = approach(this.pathFade, pT, dt / 0.5);
      this.dirty = true;
    }
    const hT = this.highlights.length > 0 ? 1 : 0;
    if (this.highlightFade !== hT) {
      this.highlightFade = approach(this.highlightFade, hT, dt / 0.6);
      this.dirty = true;
    }

    if (this.dirty) this.draw();

    if (this.statsDirty && ts - this.lastStatsAt > 240) {
      this.statsDirty = false;
      this.lastStatsAt = ts;
      this.computeStats();
    }
  };

  /* ------------------------------ dibujo ------------------------------ */

  private ensureSize(v: View) {
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    if (v.w === this.width && v.h === this.height && dpr === this.dpr) return;
    this.width = v.w;
    this.height = v.h;
    this.dpr = dpr;
    this.canvas.width = Math.max(1, Math.round(v.w * dpr));
    this.canvas.height = Math.max(1, Math.round(v.h * dpr));
  }

  /**
   * La luz de los edificios en 3D sigue al sol real: llega desde su azimut, con la inclinación de su
   * elevación y un color más cálido cuando está bajo. Así las fachadas al sol se ven iluminadas y las
   * de espaldas, en sombra. Solo se actualiza cuando el sol se mueve de forma apreciable.
   */
  private updateMapLight(pos: SunPosition) {
    if (!this.buildings3D || typeof this.map.setLight !== "function") return;
    const up = pos.altitudeDeg > -1;
    const az = Math.round((((pos.azimuthDeg % 360) + 360) % 360) / 2) * 2;
    const alt = Math.round(pos.altitudeDeg / 2) * 2;
    const key = up ? `${az}|${alt}` : "night";
    if (key === this.lightKey) return;
    this.lightKey = key;

    const t = smoothstep(2, 35, pos.altitudeDeg);
    const light = up
      ? {
          anchor: "map",
          // [distancia, azimut desde el norte (horario), ángulo polar desde la vertical]
          position: [1.2, az, clamp(90 - pos.altitudeDeg, 12, 86)],
          color: t < 0.5 ? "#ffd9a8" : "#fff4e2",
          intensity: 0.32 + 0.26 * t,
        }
      : { anchor: "map", position: [1.2, 210, 40], color: "#aab6e0", intensity: 0.18 };
    try {
      this.map.setLight(light);
    } catch {
      /* estilo aún no listo: se reintentará en el siguiente cambio */
      this.lightKey = "";
    }
  }

  /** Recalcula los datos solares solo cuando cambia el instante o los datos (no al desplazar el mapa). */
  private updateField(time: number) {
    if (this.externalPoints) {
      this.weatherAvailable = true;
      return;
    }
    // El campo depende del instante, de los datos y (por las edades) del minuto actual: no se
    // recalcula al desplazar el mapa ni en cada fotograma.
    const key = `${Math.round(time / 1000)}|${this.fieldVersion}|${this.lightMode}|${Math.floor(Date.now() / 60_000)}`;
    if (key === this.fieldKey) return;
    this.fieldKey = key;
    this.weatherAvailable = this.source.compute(time, this.grid, this.lightMode).weatherAvailable;
  }

  private draw() {
    this.dirty = false;
    const key = this.cameraKey();
    const v = computeView(this.map);
    if (v.w < 2 || v.h < 2) return;
    this.viewKey = key;
    this.lastView = v;
    this.ensureSize(v);

    const time = this.displayTime;
    const pos = solarService.getPosition(time, BARCELONA.lat, BARCELONA.lng);
    this.lastSun = pos;
    const altDeg = pos.altitudeDeg;
    const shadeK = smoothstep(0, 4, altDeg);
    const night = altDeg < -2;

    const ctx = this.ctx;
    ctx.setTransform(this.dpr, 0, 0, this.dpr, 0, 0);
    ctx.clearRect(0, 0, v.w, v.h);
    ctx.globalAlpha = 1;
    ctx.globalCompositeOperation = "source-over";

    // 1 · Luz: calidez del sol directo efectivo + relieve + ambiente.
    this.updateField(time);
    this.heatmap.prepare(v, this.grid, altDeg, {
      cloudK: this.cloudsFade,
      weatherAvailable: this.weatherAvailable,
    });
    this.heatmap.drawLight(ctx);

    // 2 · Sombras de edificios (geometría; independientes de las nubes) y relieve 3D.
    const zoomFade = smoothstep(12.9, 13.5, v.zoom);
    const bFade = this.shadowsFade * zoomFade * shadeK;
    // Misma transición que la capa 3D del mapa (altura interpolada linealmente con el zoom).
    const extrudeK = this.buildings3D ? clamp((v.zoom - EXTRUDE_FROM_ZOOM) / (EXTRUDE_FULL_ZOOM - EXTRUDE_FROM_ZOOM), 0, 1) : 0;
    this.lastBFade = bFade;
    this.maskActive = false;
    this.updateMapLight(pos);

    const wantShadows = bFade > 0.01;
    if (this.buildings && (wantShadows || extrudeK > 0.01)) {
      this.shadows.render(v, this.buildings, pos.azimuth, pos.altitude, {
        shadows: wantShadows,
        extrudeK,
      });
      this.maskActive = wantShadows;

      if (wantShadows) {
        // Quita el color del sol bajo la sombra…
        ctx.globalCompositeOperation = "destination-out";
        ctx.globalAlpha = 0.95 * bFade;
        ctx.drawImage(this.shadows.canvas, 0, 0, v.w, v.h);
      }
      if (this.shadows.silhouettesActive) {
        // …y de los edificios en 3D: el mapa los ilumina con la luz del sol (fachadas incluidas).
        ctx.globalCompositeOperation = "destination-out";
        ctx.globalAlpha = Math.min(1, extrudeK * 1.6);
        ctx.drawImage(this.shadows.silhouettes, 0, 0, v.w, v.h);
      }
      if (wantShadows) {
        // Tono de la sombra, más marcado al acercarse (donde se lee calle a calle).
        ctx.globalCompositeOperation = "source-over";
        ctx.globalAlpha = (SHADOW_ALPHA + 0.12 * smoothstep(14, 16, v.zoom)) * bFade;
        ctx.drawImage(this.shadows.canvas, 0, 0, v.w, v.h);
      }
      ctx.globalCompositeOperation = "source-over";
      ctx.globalAlpha = 1;
    }

    // 3 · Nubes.
    if (this.cloudsFade > 0.01) this.heatmap.drawClouds(ctx);

    // 4 · Zonas destacadas y trayectoria.
    if (this.highlightFade > 0.01) this.drawHighlights(v, this.highlightFade);
    if (this.pathFade > 0.01) {
      let anchor: [number, number] = [v.w / 2, v.h / 2];
      if (this.selection) {
        anchor = projectLngLat(v, this.selection.lng, this.selection.lat) ?? anchor;
      }
      this.sunPath.draw(ctx, v, {
        pos,
        time,
        dayStart: this.dayStart,
        fade: this.pathFade,
        night,
        anchor,
      });
    }

    this.statsDirty = true;
  }

  private drawHighlights(v: View, fade: number) {
    const ctx = this.ctx;
    const M_PER_DEG = 111_320;
    for (const h of this.highlights) {
      const p = projectLngLat(v, h.lng, h.lat);
      if (!p) continue;
      // Radio de 300 m tal como se ve (con inclinación se aplana en vertical).
      const dLng = 300 / (M_PER_DEG * Math.cos((h.lat * Math.PI) / 180));
      const dLat = 300 / M_PER_DEG;
      const pe = projectLngLat(v, h.lng + dLng, h.lat);
      const pn = projectLngLat(v, h.lng, h.lat + dLat);
      if (!pe || !pn) continue;
      const ex = pe[0] - p[0];
      const ey = pe[1] - p[1];
      const rx = clamp(Math.hypot(ex, ey), 36, 320);
      const ry = clamp(Math.hypot(pn[0] - p[0], pn[1] - p[1]), 36 * 0.5, 320);
      if (p[0] < -rx || p[1] < -rx || p[0] > v.w + rx || p[1] > v.h + rx) continue;

      const a = fade * (0.32 + 0.4 * h.score);
      ctx.save();
      ctx.translate(p[0], p[1]);
      ctx.rotate(Math.atan2(ey, ex));
      ctx.scale(1, ry / rx);
      const g = ctx.createRadialGradient(0, 0, 0, 0, 0, rx);
      g.addColorStop(0, `rgba(255, 228, 156, ${a})`);
      g.addColorStop(0.45, `rgba(255, 206, 112, ${a * 0.45})`);
      g.addColorStop(1, "rgba(255, 200, 100, 0)");
      ctx.fillStyle = g;
      ctx.beginPath();
      ctx.arc(0, 0, rx, 0, Math.PI * 2);
      ctx.fill();
      ctx.restore();
    }
  }

  /* ------------------------------ estadísticas ------------------------------ */

  private computeStats() {
    const v = this.lastView;
    const pos = this.lastSun;
    if (!v || !pos || this.destroyed) return;

    const gc = 48;
    const gr = Math.max(16, Math.round((gc * v.h) / v.w));
    if (this.statCv.width !== gc || this.statCv.height !== gr) {
      this.statCv.width = gc;
      this.statCv.height = gr;
    }

    let maskPx: Uint8ClampedArray | null = null;
    if (this.maskActive) {
      const sctx = this.statCtx;
      sctx.clearRect(0, 0, gc, gr);
      sctx.imageSmoothingEnabled = true;
      sctx.imageSmoothingQuality = "high";
      const mask = this.shadows.canvas;
      sctx.drawImage(mask, 0, 0, mask.width, mask.height, 0, 0, gc, gr);
      maskPx = sctx.getImageData(0, 0, gc, gr).data;
    }

    const up = pos.altitude >= SUN_UP_RAD;
    const bScale = this.lastBFade;
    const Hi = v.Hi;
    const maxD2 = MAX_GROUND_M * v.ppm * (MAX_GROUND_M * v.ppm);
    const half = Math.max(v.w, v.h) / 2;
    const s = this.sample;
    let n = 0;
    let sumSun = 0;
    let sumShade = 0;
    let sumCloud = 0;
    let wx = 0;
    let wy = 0;

    for (let j = 0; j < gr; j++) {
      const py = ((j + 0.5) / gr) * v.h;
      for (let i = 0; i < gc; i++) {
        const px = ((i + 0.5) / gc) * v.w;
        const W = Hi[6] * px + Hi[7] * py + Hi[8];
        if (W <= 1e-6) continue;
        const u = (Hi[0] * px + Hi[1] * py + Hi[2]) / W;
        const vv = (Hi[3] * px + Hi[4] * py + Hi[5]) / W;
        if (u * u + vv * vv > maxD2) continue;

        const lng = (v.cx + u / v.ws) * 360 - 180;
        const lat = myToLat(v.cy + vv / v.ws);
        this.grid.sample(lng, lat, s);
        const m = maskPx ? (maskPx[(j * gc + i) * 4 + 3] / 255) * bScale : 0;
        const lit = (1 - m) * Math.min(s.sunlight, 1 - s.shadow);
        // Luz efectiva: geometría × (1 − lo que bloquean las nubes). Independiente de qué capas se vean.
        const sun = up ? lit * (1 - s.cloudCoverage) : 0;
        n++;
        sumSun += sun;
        sumShade += up ? 1 - lit : 1;
        sumCloud += s.cloudCoverage;
        // Este = +u · Norte = −v (independiente de la rotación del mapa).
        wx += sun * (u / half);
        wy += sun * (-vv / half);
      }
    }
    if (n === 0) return;

    const mean = sumSun / n;
    let direction: CityDirection;
    if (!up || mean < 0.06) direction = "none";
    else if (mean > 0.86) direction = "everywhere";
    else {
      const ex = wx / sumSun;
      const ey = wy / sumSun;
      if (Math.hypot(ex, ey) < 0.12) direction = "scattered";
      else {
        const ang = (Math.atan2(ex, ey) * 180) / Math.PI;
        direction = DIRECTIONS[Math.round(((ang + 360) % 360) / 45) % 8];
      }
    }

    const c = this.map.getCenter();
    const areaKey = `${v.zoom >= 14.4}|${c.lng.toFixed(3)}|${c.lat.toFixed(3)}`;
    if (areaKey !== this.lastAreaKey) {
      this.lastAreaKey = areaKey;
      this.lastArea = this.opts.getAreaName(c.lng, c.lat, v.zoom);
    }

    this.opts.onStats({
      sunPercent: Math.round(clamp(mean, 0, 1) * 100),
      shadePercent: Math.round((sumShade / n) * 100),
      cloudPercent: Math.round((sumCloud / n) * 100),
      direction,
      altitudeDeg: pos.altitudeDeg,
      azimuthDeg: pos.azimuthDeg,
      area: this.lastArea,
      zoom: v.zoom,
    });
  }
}
