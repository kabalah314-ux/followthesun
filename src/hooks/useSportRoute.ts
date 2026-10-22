import { useCallback, useRef, useState } from "react";
import { LIGHT_MODEL_CONFIG } from "../config";
import { buildTreeGrid, createTreeShadeTester } from "../graphics/trees/treeShade";
import { treeStore } from "../graphics/trees/treeStore";
import { leafDensities } from "../graphics/trees/treeTiles";
import type { SunShadeMode } from "../lib/answer";
import { sampleLine, summarizeShade, type RouteSample } from "../lib/routeShade";
import { SPORT_SAMPLE_M, SPORT_SPEED_M_PER_MIN, loopWaypoints, pickSlot, sportSlots, type Circuit, type Sport } from "../lib/sportRoutes";
import type { LngLatPair } from "../lib/terraceShape";
import { TREE_SHADE_THRESHOLD, createShadowEvaluator } from "../services/shadowService";
import { solarService } from "../services/solarService";
import { startOfZoneDay } from "../services/timeService";
import { urbanGeometryService } from "../services/urbanGeometryService";
import { routeThrough } from "../services/walkRouteService";
import type { LngLat } from "../types";

/**
 * Correr o ir en bici a la sombra (guía maestra 2, utilidad 31): el recorrido sale de OSRM y, para
 * cada hora de salida, se calcula qué tramos van a la sombra (edificios, relieve y árboles) con el
 * sol de la hora a la que se pasa por ellos. Las vueltas desde donde estás se prueban en tres
 * direcciones y se ordenan de la que mejor encaja a la que menos.
 */

export type SportTarget = { kind: "circuit"; circuit: Circuit } | { kind: "loop"; start: LngLat; km: number };

export interface SportRoute {
  coords: LngLatPair[];
  distanceM: number;
  minutes: number;
  samples: RouteSample[];
  /** Por hora de salida (en el orden de `slots`): qué muestras van a la sombra. */
  shaded: boolean[][];
  /** Por hora de salida: % del recorrido a la sombra (por distancia). */
  shadePct: number[];
}

export interface SportState {
  status: "idle" | "loading" | "ready" | "error";
  target: SportTarget | null;
  sport: Sport;
  mode: SunShadeMode;
  dayStart: number;
  /** «Ahora» (si hoy aún hay sol), primera hora y última hora. */
  now: number | null;
  morning: number[];
  evening: number[];
  /** Todas las horas de salida: [ahora, ...primera hora, ...última hora]. */
  slots: number[];
  /** Recorridos (las vueltas, de la que mejor encaja a la que menos). */
  routes: SportRoute[];
  /** Recorrido que se enseña. */
  route: number;
  /** Hora de salida elegida (índice en `slots`). */
  slot: number;
  /** 0–1 mientras calcula. */
  progress: number;
  /** Se contó la sombra de los árboles (hay arbolado en la zona). */
  trees: boolean;
}

const IDLE: SportState = {
  status: "idle",
  target: null,
  sport: "run",
  mode: "shade",
  dayStart: 0,
  now: null,
  morning: [],
  evening: [],
  slots: [],
  routes: [],
  route: 0,
  slot: 0,
  progress: 0,
  trees: false,
};

const MIN = 60_000;
/** Distancia (m) a la que se miran edificios que den sombra: basta a primera y última hora. */
const SHADE_RADIUS_M = 300;
/** Direcciones (rumbo, °) en que se prueban las vueltas. */
const LOOP_BEARINGS = [30, 150, 270];
const tick = () => new Promise<void>((r) => setTimeout(r, 0));

/** % de lo que se busca (sombra o sol) a partir del % de sombra. */
export const wantedPct = (shadePct: number, mode: SunShadeMode) => (mode === "shade" ? shadePct : 100 - shadePct);

/** Las horas recomendadas de primera y de última hora de un recorrido. */
export function sportPicks(s: Pick<SportState, "morning" | "evening" | "slots" | "mode">, r: SportRoute) {
  const pctAt = (t: number) => wantedPct(r.shadePct[s.slots.indexOf(t)] ?? 0, s.mode);
  return {
    morning: pickSlot(s.morning, s.morning.map(pctAt), s.mode === "shade" ? "latest" : "earliest"),
    evening: pickSlot(s.evening, s.evening.map(pctAt), s.mode === "shade" ? "earliest" : "latest"),
  };
}

export function useSportRoute() {
  const [state, setState] = useState<SportState>(IDLE);
  const run = useRef(0);

  const clear = useCallback(() => {
    run.current++;
    setState(IDLE);
  }, []);

  const selectSlot = useCallback((slot: number) => setState((s) => (s.status === "ready" && slot >= 0 && slot < s.slots.length ? { ...s, slot } : s)), []);
  const nextRoute = useCallback(() => setState((s) => (s.status === "ready" && s.routes.length > 1 ? { ...s, route: (s.route + 1) % s.routes.length } : s)), []);

  const compute = useCallback(async (target: SportTarget, sport: Sport, dayStart: number, now: number, mode: SunShadeMode) => {
    const id = ++run.current;
    const base = { target, sport, mode, dayStart };
    setState({ ...IDLE, ...base, status: "loading", progress: 0.02 });
    try {
      const plans: LngLatPair[][] =
        target.kind === "circuit" ? [[...target.circuit.points]] : LOOP_BEARINGS.map((b) => loopWaypoints(target.start, target.km, b));
      const settled = await Promise.allSettled(plans.map((p) => routeThrough(p, sport === "bike" ? "bike" : "foot")));
      if (id !== run.current) return;
      let raw = settled.flatMap((s) => (s.status === "fulfilled" ? [s.value] : []));
      if (raw.length === 0) throw new Error("sin recorrido");
      // Una vuelta que sale mucho más corta o más larga de lo pedido no se ofrece (si hay otras).
      if (target.kind === "loop") {
        const ok = raw.filter((r) => r.distanceM > target.km * 500 && r.distanceM < target.km * 1800);
        if (ok.length > 0) raw = ok;
      }
      setState((p) => ({ ...p, progress: 0.08 }));

      const speed = SPORT_SPEED_M_PER_MIN[sport];
      const [lng0, lat0] = raw[0].coords[0];
      const sunTimes = solarService.getSunTimes(dayStart, lat0, lng0);
      const today = startOfZoneDay(now) === dayStart;
      const nowSlot = today && now > sunTimes.sunrise && now < sunTimes.sunset - 20 * MIN ? Math.ceil(now / (5 * MIN)) * 5 * MIN : null;
      const { morning, evening } = sportSlots(sunTimes.sunrise, sunTimes.sunset, today ? now : -Infinity);
      // Sin repetir «ahora» con una hora casi igual.
      const near = (t: number) => nowSlot !== null && Math.abs(t - nowSlot) < 15 * MIN;
      const m = morning.filter((t) => !near(t));
      const e = evening.filter((t) => !near(t));
      const slots = [...(nowSlot !== null ? [nowSlot] : []), ...m, ...e];

      const samples = raw.map((r) => sampleLine(r.coords, SPORT_SAMPLE_M[sport]));
      const geo = await urbanGeometryService.load(
        samples.flat().filter((_, i) => i % 4 === 0).map((s) => ({ lng: s.lng, lat: s.lat })),
        SHADE_RADIUS_M
      );
      if (id !== run.current) return;
      setState((p) => ({ ...p, progress: 0.2 }));

      // Árboles a lo largo de los recorridos (si ya hay arbolado publicado).
      const all = raw.flatMap((r) => r.coords);
      const lngs = all.map((c) => c[0]);
      const lats = all.map((c) => c[1]);
      const bounds = { west: Math.min(...lngs) - 0.001, east: Math.max(...lngs) + 0.001, south: Math.min(...lats) - 0.001, north: Math.max(...lats) + 0.001 };
      const trees = await treeStore
        .batchFor(bounds, { lng: (bounds.west + bounds.east) / 2, lat: (bounds.south + bounds.north) / 2 }, 250_000)
        .catch(() => null);
      if (id !== run.current) return;
      const grid = trees && trees.count > 0 ? buildTreeGrid(trees) : undefined;
      const leaf = leafDensities(new Date(dayStart + 12 * 3_600_000));

      const total = samples.reduce((n, s) => n + s.length, 0) || 1;
      let done = 0;
      const routes: SportRoute[] = [];
      for (let k = 0; k < raw.length; k++) {
        const ss = samples[k];
        const shaded = slots.map(() => new Array<boolean>(ss.length).fill(true));
        for (let i = 0; i < ss.length; i++) {
          const s = ss[i];
          const ev = createShadowEvaluator({ latitude: s.lat, longitude: s.lng, buildings: geo.buildings, radiusM: SHADE_RADIUS_M });
          const tt = trees && grid ? createTreeShadeTester(trees, s.lng, s.lat, 40, grid) : null;
          for (let j = 0; j < slots.length; j++) {
            const sun = solarService.getPosition(slots[j] + (s.distM / speed) * MIN, s.lat, s.lng);
            if (sun.altitudeDeg < LIGHT_MODEL_CONFIG.MIN_SUN_ELEVATION_DEG) continue; // de noche: sin sol
            const r = ev.evaluate(sun);
            shaded[j][i] = r.urbanShadow || r.terrainShadow || (tt !== null && tt.candidates > 0 && tt.shadeAt(sun.azimuth, sun.altitude, leaf) >= TREE_SHADE_THRESHOLD);
          }
          done++;
          if (done % 16 === 0) {
            setState((p) => ({ ...p, progress: 0.2 + 0.78 * (done / total) }));
            await tick();
            if (id !== run.current) return;
          }
        }
        routes.push({
          coords: raw[k].coords,
          distanceM: raw[k].distanceM,
          minutes: Math.max(1, Math.round(raw[k].distanceM / speed)),
          samples: ss,
          shaded,
          shadePct: shaded.map((sh) => summarizeShade(ss, sh).shadePct),
        });
      }

      // Vueltas: primero la que da más de lo que se busca de media en las horas comparadas.
      const mean = (r: SportRoute) => (r.shadePct.length ? r.shadePct.reduce((a, p) => a + wantedPct(p, mode), 0) / r.shadePct.length : 0);
      routes.sort((a, b) => mean(b) - mean(a));

      const ready: SportState = {
        ...IDLE,
        ...base,
        status: "ready",
        now: nowSlot,
        morning: m,
        evening: e,
        slots,
        routes,
        trees: !!grid,
        progress: 1,
      };
      // Hora elegida de entrada: la próxima recomendada (la de primera o la de última hora).
      const picks = sportPicks(ready, routes[0]);
      const next = [picks.morning, picks.evening].filter((p): p is NonNullable<typeof p> => p !== null).sort((a, b) => a.slot - b.slot)[0];
      ready.slot = next ? slots.indexOf(next.slot) : 0;
      setState(ready);
    } catch {
      if (id === run.current) setState({ ...IDLE, ...base, status: "error" });
    }
  }, []);

  return { state, compute, clear, selectSlot, nextRoute };
}
