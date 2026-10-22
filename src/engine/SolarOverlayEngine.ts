import { BARCELONA, BUILDINGS_3D, GRAPHICS, MAP_CONFIG, SOLAR_FIELD } from "../config";
import {
  FACADE_SHADOWS_LAYER_ID,
  PHASE_C,
  ROOF_EDGES_LAYER_ID,
  SOLAR_GL_LAYER_ID,
  SolarGLLayer,
  TREES_3D_LAYER_ID,
  type SolarGLStats,
} from "../graphics/gl/SolarGLLayer";
import { createFpsMonitor, qualityApi, type QualityState } from "../graphics/quality";
import { ShadowGeometryClient } from "../graphics/shadowGeometryClient";
import { shadowToneAlpha } from "../graphics/shadowTone";
import { treeStore, type TreeBounds } from "../graphics/trees/treeStore";
import { leafDensities } from "../graphics/trees/treeTiles";
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
import { catastroHeights } from "../services/map/catastroHeights";
import { HILLSHADE_LAYER_ID, ReliefLayer } from "../services/map/relief";
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
  Theme,
  View,
} from "../types";
import { SolarHeatmap, lightParams } from "./layers/SolarHeatmap";
import { ShadowLayer } from "./layers/ShadowLayer";
import { SunPositionLayer } from "./layers/SunPosition";
import { computeView, projectLngLat } from "./view";

/**
 * SolarOverlayEngine — orquesta la capa solar sobre el mapa.
 *
 * Dos formas de dibujar, según la calidad gráfica (`qualityApi`):
 *
 *  · GPU (Alta / Media, WebGL2 + MapLibre): `SolarGLLayer` dibuja la luz y las sombras DENTRO del
 *    mapa, debajo de los edificios 3D y de las etiquetas: máscara de sombras a resolución de
 *    pantalla (MSAA en Alta), penumbra física, campo de luz bicúbico y aristas de tejado. La
 *    geometría se triangula en un Web Worker y el sol es un uniform: mover la hora no recalcula nada.
 *  · Canvas 2D (Ahorro, o si la GPU falla): un canvas sincronizado con la cámara compone, de abajo
 *    arriba: luz (SolarHeatmap) → sombras de edificios (ShadowLayer) → nubes.
 *
 * En ambos casos, el canvas 2D de encima lleva las zonas destacadas (Find the Sun) y la trayectoria
 * del sol. Si la GPU falla a mitad de sesión, el motor pasa al canvas sin dejar el mapa vacío.
 *
 * Separación de trabajo (mover el selector de tiempo NO recalcula todo):
 *   · sol          posición astronómica por fotograma (barato)
 *   · nubes        datos en memoria (`cloudService`); la rejilla solo se recalcula si cambia el
 *                  instante o llegan datos nuevos — nunca hay peticiones de red al arrastrar
 *   · edificios    geometría extraída de las teselas al terminar de mover el mapa
 *   · dibujo       solo si cambió la cámara, el tiempo o una capa
 *   · interfaz     resultados enviados a React con límite de frecuencia
 *
 * Solo depende de la interfaz `MapLike`: funciona igual con Mapbox GL JS y MapLibre GL JS (la capa
 * en la GPU solo con MapLibre; con Mapbox se usa el canvas).
 */

export interface EngineOptions {
  /** Id de la fuente vectorial del estilo (para refrescar los edificios al cargar teselas). */
  sourceId: string;
  /** El proveedor admite capas WebGL propias (MapLibre 5). */
  supportsCustomLayers?: boolean;
  getAreaName(lng: number, lat: number, zoom: number): string;
  onStats(stats: CityStats): void;
  onPointTimeline(timeline: PointTimeline | null): void;
  onPointSunlight(result: SunlightResult | null): void;
}

export type EngineRenderer = "gl" | "canvas";

const MAX_GROUND_M = 16_000;
const EXTRUDE_FROM_ZOOM = BUILDINGS_3D.fromZoom;
const EXTRUDE_FULL_ZOOM = BUILDINGS_3D.fullZoom;
/** Intervalo mínimo entre resultados enviados a la interfaz mientras se mueve el tiempo. */
const POINT_EMIT_MS = 90;
/** Rejilla de las estadísticas de la vista (columnas). */
const STATS_COLS = 48;

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

/** Máscara de sombras reducida para las estadísticas: cobertura 0-1 por celda (filas de arriba abajo). */
interface StatsMask {
  cols: number;
  rows: number;
  at(i: number, j: number): number;
}

function mapHasWebGL2(map: MapLike): boolean {
  try {
    if (typeof WebGL2RenderingContext === "undefined") return false;
    return map.getCanvas().getContext("webgl2") instanceof WebGL2RenderingContext;
  } catch {
    return false;
  }
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
  /** Cambia cada vez que la rejilla de luz cambia de contenido (para subirla a la GPU). */
  private gridVersion = 0;
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
  private theme: Theme = "day";

  /* Calidad y renderizador. */
  private quality: QualityState;
  private unsubQuality: () => void;
  private renderer: EngineRenderer = "canvas";
  private glLayer: SolarGLLayer | null = null;
  private geometryClient: ShadowGeometryClient | null = null;
  /** Edificios cuya geometría de GPU está pedida o aplicada. */
  private geometrySet: BuildingSet | null = null;
  private glStateKey = "";
  private moving = false;
  private startedAt = performance.now();
  private fps = createFpsMonitor({
    minFps: GRAPHICS.fps.min,
    windowMs: GRAPHICS.fps.windowMs,
    onLow: () => {
      qualityApi.reportLowFps();
    },
  });
  private statsRequested = false;
  /* Fase C: árboles del inventario (Media y Alta) y relieve sombreado (Alta). */
  private treeKey = "";
  private treeReq = 0;
  private relief: ReliefLayer;
  private reliefKey = "";
  private unsubHeights: () => void;
  /** Momento en que se pidió mostrar la capa (0 = aún no): la luz aparece en ~1,8 s. */
  private revealAt = 0;
  private revealK = 0;

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
    this.relief = new ReliefLayer(map);

    map.on("render", this.onRender);
    map.on("resize", this.markDirty);
    map.on("movestart", this.onMoveStart);
    map.on("moveend", this.onMoveEnd);
    map.on("idle", this.onIdle);
    map.on("sourcedata", this.onSourceData);
    map.on("styledata", this.onStyleData);

    // Cuando llegan o se refrescan los datos meteorológicos, se rehace la capa y el punto.
    this.unsubWeather = lightFusionService.subscribe(this.onWeatherChange);

    this.quality = qualityApi.get();
    this.unsubQuality = qualityApi.subscribe(this.onQuality);
    // Llegan alturas del Catastro: se vuelven a extraer los edificios para sus sombras.
    this.unsubHeights = catastroHeights.subscribe(() => {
      if (this.destroyed) return;
      this.sourceDirty = true;
      this.scheduleRefresh(120);
    });
    this.applyRenderer();

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
      this.gridVersion++;
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

  /** Paleta del mapa (día / noche): tono de las aristas de tejado. */
  setTheme(theme: Theme) {
    if (theme === this.theme) return;
    this.theme = theme;
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
    if (!this.revealAt) this.revealAt = performance.now();
    this.scheduleRefresh(80);
  }

  getBuildings() {
    return this.buildings;
  }

  getDayStart() {
    return this.dayStart;
  }

  /** Canvas 2D de encima del mapa (trayectoria, zonas destacadas…): para grabar vídeo. */
  getOverlayCanvas(): HTMLCanvasElement {
    return this.canvas;
  }

  /** Cómo se está dibujando ahora la capa solar. */
  getRenderer(): EngineRenderer {
    return this.renderer;
  }

  destroy() {
    this.destroyed = true;
    cancelAnimationFrame(this.raf);
    window.clearTimeout(this.refreshTimer);
    window.clearTimeout(this.timelineTimer);
    window.clearTimeout(this.pointEmitTimer);
    this.unsubWeather();
    this.unsubQuality();
    this.unsubHeights();
    this.map.off("render", this.onRender);
    this.map.off("resize", this.markDirty);
    this.map.off("movestart", this.onMoveStart);
    this.map.off("moveend", this.onMoveEnd);
    this.map.off("idle", this.onIdle);
    this.map.off("sourcedata", this.onSourceData);
    this.map.off("styledata", this.onStyleData);
    this.disableGL();
    this.relief.update(false, { azimuthDeg: 0, altitudeDeg: 0 }, this.theme);
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

  /* ------------------------------ calidad y renderizador ------------------------------ */

  private onQuality = (s: QualityState) => {
    if (this.destroyed) return;
    this.quality = s;
    this.applyRenderer();
    this.treeKey = "";
    this.refreshTrees();
    this.dirty = true;
  };

  private applyRenderer() {
    const s = this.quality.settings;
    const gpu = s.webgl && this.opts.supportsCustomLayers === true && mapHasWebGL2(this.map);
    if (gpu) this.enableGL();
    else this.disableGL();
  }

  private enableGL() {
    const s = this.quality.settings;
    if (this.glLayer) {
      this.glLayer.setSettings(s);
      return;
    }
    this.glLayer = new SolarGLLayer({
      settings: s,
      // Se avisa fuera del dibujo del mapa: quitar capas en mitad de un fotograma no es seguro.
      onError: (e) => window.setTimeout(() => qualityApi.reportGlFailure(e), 0),
    });
    this.geometryClient ??= new ShadowGeometryClient();
    this.renderer = "gl";
    this.glStateKey = "";
    this.geometrySet = null;
    this.ensureGLLayers();
    if (this.buildings) this.requestGeometry(this.buildings);
    this.dirty = true;
  }

  private disableGL() {
    const layer = this.glLayer;
    this.renderer = "canvas";
    if (!layer) return;
    this.glLayer = null;
    this.treeKey = "";
    this.treeReq++;
    for (const id of [ROOF_EDGES_LAYER_ID, TREES_3D_LAYER_ID, FACADE_SHADOWS_LAYER_ID, SOLAR_GL_LAYER_ID]) {
      try {
        if (this.map.getLayer(id)) this.map.removeLayer?.(id);
      } catch {
        /* estilo en transición */
      }
    }
    this.geometryClient?.destroy();
    this.geometryClient = null;
    this.geometrySet = null;
    this.statsRequested = false;
    this.dirty = true;
    this.map.triggerRepaint?.();
  }

  /** Inserta (o reinserta tras un cambio de estilo) las capas de la GPU en su sitio. */
  private ensureGLLayers() {
    const layer = this.glLayer;
    if (!layer || this.destroyed) return;
    try {
      const ids = [SOLAR_GL_LAYER_ID, FACADE_SHADOWS_LAYER_ID, TREES_3D_LAYER_ID, ROOF_EDGES_LAYER_ID];
      if (ids.every((id) => this.map.getLayer(id))) return;
      const layers = this.map.getStyle?.()?.layers ?? [];
      const firstSymbol = layers.find((l) => l.type === "symbol")?.id;
      const below3D = this.map.getLayer("buildings-3d") ? "buildings-3d" : firstSymbol;
      // Suelo (luz y sombras) bajo los edificios 3D; encima de ellos y bajo los rótulos: sombra en
      // fachadas y tejados → árboles 3D → aristas de tejado.
      if (!this.map.getLayer(SOLAR_GL_LAYER_ID)) this.map.addLayer(layer, below3D);
      if (!this.map.getLayer(ROOF_EDGES_LAYER_ID)) this.map.addLayer(layer.roofLayer, firstSymbol);
      if (!this.map.getLayer(FACADE_SHADOWS_LAYER_ID)) this.map.addLayer(layer.facadeLayer, ROOF_EDGES_LAYER_ID);
      if (!this.map.getLayer(TREES_3D_LAYER_ID)) this.map.addLayer(layer.treesLayer, ROOF_EDGES_LAYER_ID);
    } catch {
      /* el estilo aún no está listo: se reintenta con el siguiente `styledata` */
    }
  }

  private onStyleData = () => {
    if (this.glLayer) this.ensureGLLayers();
  };

  private requestGeometry(set: BuildingSet) {
    const client = this.geometryClient;
    if (!client || !this.glLayer || set === this.geometrySet) return;
    this.geometrySet = set;
    client.build(set).then(
      (g) => {
        // Solo vale si sigue siendo el conjunto vigente.
        if (this.destroyed || set !== this.geometrySet || !this.glLayer) return;
        this.glLayer.setGeometry(g);
        this.dirty = true;
      },
      () => {
        if (set === this.geometrySet) this.geometrySet = null;
      }
    );
  }

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

  private onMoveStart = () => {
    this.moving = true;
  };

  private onMoveEnd = () => {
    this.moving = false;
    this.scheduleRefresh(140);
  };

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
      this.refreshTrees();
    }, delay);
  }

  /** Árboles del inventario alrededor de la vista (Fase C): desde «calle», en Media y Alta. */
  private refreshTrees() {
    const layer = this.glLayer;
    if (!layer || this.destroyed) return;
    const s = this.quality.settings;
    const zoom = this.map.getZoom();
    const on = (s.treeShadows || s.trees3d) && s.maxTrees > 0;
    if (!on || zoom < PHASE_C.treesLoadZoom) {
      // Se sueltan al alejarse (con margen, para no recargar al oscilar junto al umbral).
      if (this.treeKey && (!on || zoom < PHASE_C.treesLoadZoom - 0.4)) {
        this.treeKey = "";
        this.treeReq++;
        layer.setTrees(null);
        this.dirty = true;
        this.map.triggerRepaint?.();
      }
      return;
    }
    const b = this.treeBounds();
    if (!b) return;
    const q = 0.0025; // ~250 m: moverse un poco no recarga
    const key = `${Math.floor(b.west / q)}|${Math.floor(b.south / q)}|${Math.ceil(b.east / q)}|${Math.ceil(b.north / q)}|${s.maxTrees}`;
    if (key === this.treeKey) return;
    this.treeKey = key;
    const req = ++this.treeReq;
    treeStore.batchFor(b, this.map.getCenter(), s.maxTrees).then(
      (batch) => {
        if (this.destroyed || req !== this.treeReq || !this.glLayer) return;
        this.glLayer.setTrees(batch && batch.count > 0 ? batch : null);
        // Sin datos de arbolado publicados todavía: se vuelve a mirar en la próxima vista.
        if (!batch) this.treeKey = "";
        this.dirty = true;
        this.map.triggerRepaint?.();
      },
      () => {
        if (req === this.treeReq) this.treeKey = "";
      }
    );
  }

  /** Caja de la vista con margen, acotada a 1,6 km del centro (inclinado, el horizonte queda lejos). */
  private treeBounds(): TreeBounds | null {
    const el = this.map.getContainer();
    const w = el.clientWidth;
    const h = el.clientHeight;
    if (w < 2 || h < 2) return null;
    let west = Infinity;
    let east = -Infinity;
    let south = Infinity;
    let north = -Infinity;
    const pts: Array<[number, number]> = [
      [0, 0],
      [w / 2, 0],
      [w, 0],
      [0, h / 2],
      [w, h / 2],
      [0, h],
      [w, h],
    ];
    for (const pt of pts) {
      const p = this.map.unproject(pt);
      if (!Number.isFinite(p.lng) || !Number.isFinite(p.lat)) continue;
      west = Math.min(west, p.lng);
      east = Math.max(east, p.lng);
      south = Math.min(south, p.lat);
      north = Math.max(north, p.lat);
    }
    if (!Number.isFinite(west)) return null;
    const c = this.map.getCenter();
    const mx = (east - west) * 0.35;
    const my = (north - south) * 0.35;
    const dLat = 1600 / 111_320;
    const dLng = dLat / Math.max(0.2, Math.cos((c.lat * Math.PI) / 180));
    return {
      west: Math.max(west - mx, c.lng - dLng),
      east: Math.min(east + mx, c.lng + dLng),
      south: Math.max(south - my, c.lat - dLat),
      north: Math.min(north + my, c.lat + dLat),
    };
  }

  /** Relieve sombreado (Alta) con la luz del sol de la hora elegida; fuera en satélite. */
  private updateRelief(pos: SunPosition) {
    const enabled = this.quality.settings.hillshade;
    let present = false;
    let satellite = false;
    try {
      present = !!this.map.getLayer(HILLSHADE_LAYER_ID);
      satellite = !!this.map.getLayer("satellite-base");
    } catch {
      return;
    }
    const az = Math.round((((pos.azimuthDeg % 360) + 360) % 360) / 2) * 2;
    const alt = Math.round(pos.altitudeDeg / 2) * 2;
    const key = `${enabled}|${present}|${satellite}|${az}|${alt}|${this.theme}`;
    if (key === this.reliefKey) return;
    this.reliefKey = key;
    this.relief.update(enabled, { azimuthDeg: az, altitudeDeg: alt }, this.theme);
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
      if (this.glLayer) this.requestGeometry(set);
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
    const timeAnimating = diff !== 0;
    if (timeAnimating) {
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
    // Aparición de la luz en la GPU (el canvas lo hace con una transición CSS de 1,8 s).
    if (this.revealAt && this.revealK < 1) {
      this.revealK = smoothstep(0, 1800, performance.now() - this.revealAt);
      this.dirty = true;
    }

    if (this.dirty) this.draw();

    // Fluidez: solo cuenta mientras el mapa se mueve o se anima la hora (no al estar quieto).
    if ((this.moving || timeAnimating) && performance.now() - this.startedAt > GRAPHICS.fps.warmupMs) {
      this.fps.frame(ts);
    } else {
      this.fps.pause();
    }

    if (this.renderer === "gl") this.collectGLStats();

    if (this.statsDirty && ts - this.lastStatsAt > 240) {
      this.statsDirty = false;
      this.lastStatsAt = ts;
      this.requestStats();
    }
  };

  /* ------------------------------ dibujo ------------------------------ */

  private ensureSize(v: View) {
    const dpr = Math.min(window.devicePixelRatio || 1, this.quality.settings.maxPixelRatio);
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
    this.gridVersion++;
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

    this.updateField(time);
    this.updateMapLight(pos);
    this.updateRelief(pos);

    if (this.renderer === "gl" && this.glLayer) {
      // 1-3 · Luz, sombras y nubes: en la GPU, dentro del mapa.
      this.drawGL(pos);
    } else {
      this.drawCanvasSolar(v, pos, shadeK);
    }

    // 4 · Zonas destacadas y trayectoria (siempre en el canvas de encima).
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

  /** Entrega a la capa de la GPU el estado del sol y de las capas; pide fotograma si cambió. */
  private drawGL(pos: SunPosition) {
    const layer = this.glLayer!;
    const light = lightParams(pos.altitudeDeg, this.weatherAvailable);
    // Hoja de los árboles según la fecha mostrada (caducifolios casi desnudos en invierno).
    const leaf = leafDensities(new Date(this.displayTime));
    layer.setField(this.grid, this.gridVersion);
    layer.setFrame({
      azimuth: pos.azimuth,
      altitude: pos.altitude,
      light,
      cloudK: this.cloudsFade,
      shadowsK: this.shadowsFade * light.shadeK,
      buildings3D: this.buildings3D,
      theme: this.theme,
      opacity: this.revealK,
      leaf,
    });
    // Solo lo que el mapa no ve por sí mismo (la cámara ya provoca su propio fotograma).
    const stateKey = `${pos.azimuth.toFixed(5)}|${pos.altitude.toFixed(5)}|${this.gridVersion}|${this.weatherAvailable}|${this.shadowsFade.toFixed(3)}|${this.cloudsFade.toFixed(3)}|${this.buildings3D}|${this.theme}|${this.revealK.toFixed(3)}|${leaf[1].toFixed(2)}`;
    if (stateKey !== this.glStateKey) {
      this.glStateKey = stateKey;
      this.map.triggerRepaint?.();
    }
  }

  /** Motor de canvas 2D (calidad Ahorro o sin WebGL2). */
  private drawCanvasSolar(v: View, pos: SunPosition, shadeK: number) {
    const ctx = this.ctx;
    const altDeg = pos.altitudeDeg;

    // 1 · Luz: calidez del sol directo efectivo + relieve + ambiente.
    this.heatmap.prepare(v, this.grid, altDeg, {
      cloudK: this.cloudsFade,
      weatherAvailable: this.weatherAvailable,
    });
    this.heatmap.drawLight(ctx);

    // 2 · Sombras de edificios (geometría; independientes de las nubes) y relieve 3D.
    // Las sombras se ven enteras desde el zoom inicial del móvil (13,2): son la información clave.
    const zoomFade = smoothstep(12.2, 13.0, v.zoom);
    const bFade = this.shadowsFade * zoomFade * shadeK;
    // Misma transición que la capa 3D del mapa (altura interpolada linealmente con el zoom).
    const extrudeK = this.buildings3D ? clamp((v.zoom - EXTRUDE_FROM_ZOOM) / (EXTRUDE_FULL_ZOOM - EXTRUDE_FROM_ZOOM), 0, 1) : 0;
    this.lastBFade = bFade;
    this.maskActive = false;

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
        // Tono de la sombra: suave en ciudad y barrio, más marcado al acercarse (calle a calle).
        ctx.globalCompositeOperation = "source-over";
        ctx.globalAlpha = shadowToneAlpha(v.zoom) * bFade;
        ctx.drawImage(this.shadows.canvas, 0, 0, v.w, v.h);
      }
      ctx.globalCompositeOperation = "source-over";
      ctx.globalAlpha = 1;
    }

    // 3 · Nubes.
    if (this.cloudsFade > 0.01) this.heatmap.drawClouds(ctx);
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

  private statsRows(v: View) {
    return Math.max(16, Math.round((STATS_COLS * v.h) / v.w));
  }

  /** Estadísticas de la vista: en canvas, al momento; en GPU, cuando llega la reducción de la máscara. */
  private requestStats() {
    const v = this.lastView;
    if (!v || this.destroyed) return;
    const layer = this.glLayer;
    if (this.renderer === "gl" && layer) {
      if (layer.shadowMaskActive) {
        layer.requestStats(STATS_COLS, this.statsRows(v));
        this.statsRequested = true;
        this.map.triggerRepaint?.();
        return;
      }
      this.computeStats(null, 0);
      return;
    }
    this.computeStats(this.canvasStatsMask(v), this.lastBFade);
  }

  private collectGLStats() {
    const layer = this.glLayer;
    if (!this.statsRequested || !layer) return;
    const s: SolarGLStats | null = layer.takeStats();
    if (!s) return;
    this.statsRequested = false;
    this.computeStats(
      { cols: s.cols, rows: s.rows, at: (i, j) => s.data[j * s.cols + i] / 255 },
      layer.shadowFade
    );
  }

  private canvasStatsMask(v: View): StatsMask | null {
    if (!this.maskActive) return null;
    const gc = STATS_COLS;
    const gr = this.statsRows(v);
    if (this.statCv.width !== gc || this.statCv.height !== gr) {
      this.statCv.width = gc;
      this.statCv.height = gr;
    }
    const sctx = this.statCtx;
    sctx.clearRect(0, 0, gc, gr);
    sctx.imageSmoothingEnabled = true;
    sctx.imageSmoothingQuality = "high";
    const mask = this.shadows.canvas;
    sctx.drawImage(mask, 0, 0, mask.width, mask.height, 0, 0, gc, gr);
    const px = sctx.getImageData(0, 0, gc, gr).data;
    return { cols: gc, rows: gr, at: (i, j) => px[(j * gc + i) * 4 + 3] / 255 };
  }

  private computeStats(mask: StatsMask | null, bScale: number) {
    const v = this.lastView;
    const pos = this.lastSun;
    if (!v || !pos || this.destroyed) return;

    const gc = mask?.cols ?? STATS_COLS;
    const gr = mask?.rows ?? this.statsRows(v);
    const up = pos.altitude >= SUN_UP_RAD;
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
        const m = mask ? mask.at(i, j) * bScale : 0;
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
