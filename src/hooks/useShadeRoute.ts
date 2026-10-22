import { useCallback, useRef, useState } from "react";
import { LIGHT_MODEL_CONFIG, SEARCH_CONFIG } from "../config";
import type { SunShadeMode } from "../lib/answer";
import { routeWaypoints, sampleLine, shadeSegments, summarizeShade } from "../lib/routeShade";
import type { LngLatPair } from "../lib/terraceShape";
import { buildTreeGrid, createTreeShadeTester } from "../graphics/trees/treeShade";
import { treeStore } from "../graphics/trees/treeStore";
import { leafDensities } from "../graphics/trees/treeTiles";
import { TREE_SHADE_THRESHOLD, createShadowEvaluator } from "../services/shadowService";
import { solarService } from "../services/solarService";
import { urbanGeometryService } from "../services/urbanGeometryService";
import { walkRoutes } from "../services/walkRouteService";
import type { LngLat } from "../types";

/**
 * La ruta por la sombra (o por el sol) hasta un sitio: alternativas a pie de OSRM y, para cada
 * una, qué tramos van a la sombra de los edificios a la hora a la que se pasa por ellos.
 */

export interface ShadeRoute {
  coords: LngLatPair[];
  segments: Array<{ coords: LngLatPair[]; shaded: boolean }>;
  minutes: number;
  /** Minutos más que la más corta. */
  extraMinutes: number;
  shadePct: number;
  waypoints: LngLatPair[];
}

export interface ShadeRouteState {
  status: "idle" | "loading" | "ready" | "error" | "night";
  /** Lugar al que va la ruta (para descartarla si la ficha cambia). */
  placeId: string | null;
  mode: SunShadeMode;
  departure: number;
  from: LngLat | null;
  to: LngLat | null;
  routes: ShadeRoute[];
  best: number;
  /** Se contó la sombra de los árboles (hay datos de arbolado en la zona). */
  trees: boolean;
}

const IDLE: ShadeRouteState = { status: "idle", placeId: null, mode: "shade", departure: 0, from: null, to: null, routes: [], best: 0, trees: false };
const SPEED_M_PER_MIN = SEARCH_CONFIG.walking.speedMetersPerMinute;
const tick = () => new Promise<void>((r) => setTimeout(r, 0));

export function useShadeRoute() {
  const [state, setState] = useState<ShadeRouteState>(IDLE);
  const run = useRef(0);

  const clear = useCallback(() => {
    run.current++;
    setState(IDLE);
  }, []);

  const compute = useCallback(async (placeId: string, from: LngLat, to: LngLat, departure: number, mode: SunShadeMode) => {
    const id = ++run.current;
    const base = { placeId, mode, departure, from, to };
    setState({ ...IDLE, ...base, status: "loading" });
    try {
      const raw = await walkRoutes(from, to);
      if (id !== run.current) return;
      if (raw.length === 0) throw new Error("sin rutas");
      const sampled = raw.map((r) => sampleLine(r.coords, r.distanceM > 3000 ? 25 : 15));
      const points = sampled.flat().filter((_, i) => i % 6 === 0).map((s) => ({ lng: s.lng, lat: s.lat }));
      const geo = await urbanGeometryService.load(points, SEARCH_CONFIG.shadowRadiusM);
      if (id !== run.current) return;
      // Árboles de la calle (si ya hay datos de arbolado): en Barcelona dan buena parte de la sombra.
      const all = raw.flatMap((r) => r.coords);
      const lngs = all.map((c) => c[0]);
      const lats = all.map((c) => c[1]);
      const bounds = { west: Math.min(...lngs) - 0.001, east: Math.max(...lngs) + 0.001, south: Math.min(...lats) - 0.001, north: Math.max(...lats) + 0.001 };
      const trees = await treeStore
        .batchFor(bounds, { lng: (bounds.west + bounds.east) / 2, lat: (bounds.south + bounds.north) / 2 }, 120_000)
        .catch(() => null);
      if (id !== run.current) return;
      const grid = trees ? buildTreeGrid(trees) : undefined;
      const leaf = leafDensities(new Date(departure));
      const minutesOf = (m: number) => Math.max(1, Math.round(m / SPEED_M_PER_MIN));
      const shortest = Math.min(...raw.map((r) => minutesOf(r.distanceM)));
      const sunAtStart = solarService.getPosition(departure, from.lat, from.lng);
      if (sunAtStart.altitudeDeg < LIGHT_MODEL_CONFIG.MIN_SUN_ELEVATION_DEG) {
        setState({ ...IDLE, ...base, status: "night" });
        return;
      }
      const routes: ShadeRoute[] = [];
      for (let k = 0; k < raw.length; k++) {
        const samples = sampled[k];
        const shaded = samples.map((s) => {
          const t = departure + (s.distM / SPEED_M_PER_MIN) * 60_000;
          const sun = solarService.getPosition(t, s.lat, s.lng);
          if (sun.altitudeDeg < LIGHT_MODEL_CONFIG.MIN_SUN_ELEVATION_DEG) return true;
          const r = createShadowEvaluator({ latitude: s.lat, longitude: s.lng, buildings: geo.buildings }).evaluate(sun);
          if (r.urbanShadow || r.terrainShadow) return true;
          return trees ? createTreeShadeTester(trees, s.lng, s.lat, 40, grid).shadeAt(sun.azimuth, sun.altitude, leaf) >= TREE_SHADE_THRESHOLD : false;
        });
        const sum = summarizeShade(samples, shaded);
        const minutes = minutesOf(raw[k].distanceM);
        routes.push({
          coords: raw[k].coords,
          segments: shadeSegments(samples, shaded),
          minutes,
          extraMinutes: minutes - shortest,
          shadePct: sum.shadePct,
          waypoints: routeWaypoints(raw[k].coords, 2),
        });
        await tick();
        if (id !== run.current) return;
      }
      // La mejor: más sombra (o más sol) por distancia; a igualdad, la más corta.
      const score = (r: ShadeRoute) => (mode === "shade" ? r.shadePct : 100 - r.shadePct);
      let best = 0;
      routes.forEach((r, i) => {
        const b = routes[best];
        if (score(r) > score(b) + 2 || (Math.abs(score(r) - score(b)) <= 2 && r.minutes < b.minutes)) best = i;
      });
      setState({ ...IDLE, ...base, status: "ready", routes, best, trees: !!trees && trees.count > 0 });
    } catch {
      if (id === run.current) setState({ ...IDLE, ...base, status: "error" });
    }
  }, []);

  return { state, compute, clear };
}
