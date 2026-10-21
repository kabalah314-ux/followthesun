import { lazy, Suspense, useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import DebugPanel from "./components/DebugPanel";
import { shownResults } from "./components/Find/SearchResults";
import ContextPanel, { AppShell } from "./components/Layout/ContextPanel";
import { LAYOUT, useDevice } from "./components/Layout/layout";
import BarcelonaMap, { type MapController } from "./components/Map/BarcelonaMap";
import BuildingLayer from "./components/Map/BuildingLayer";
import CloudLayer from "./components/Map/CloudLayer";
import LayerControl from "./components/Map/LayerControl";
import MapControls from "./components/Map/MapControls";
import MapMarkers from "./components/Map/MapMarkers";
import ShadowLayer from "./components/Map/ShadowLayer";
import SolarOverlay from "./components/Map/SolarOverlay";
import SunStatus from "./components/Map/SunStatus";
import TimeSlider, { TimelineCollapsed } from "./components/Map/TimeSlider";
import MobileHeader from "./components/Navigation/MobileHeader";
import MobileNavigation from "./components/Navigation/MobileNavigation";
import { NAV_ITEMS } from "./components/Navigation/navItems";
import Sidebar from "./components/Navigation/Sidebar";
import PointPanel from "./components/PointPanel";
import { PROVENANCE_WORD } from "./components/SourceStatusLine";
import Splash from "./components/Splash";
import NowPanel from "./components/Now/NowPanel";
import NearbyStrip from "./components/Now/NearbyStrip";
import SearchHub from "./components/Search/SearchHub";
import Toast from "./components/Toast";
import AnswerCard from "./components/Now/AnswerCard";

/**
 * Los paneles de cada sección se descargan al abrirlas: la carga inicial solo trae el mapa, el sol
 * y la línea de tiempo. «Recomendados» y el detalle de un resultado también.
 */
const FindSunPanel = lazy(() => import("./components/Find/FindSunPanel"));
const SunPlanner = lazy(() => import("./components/Plan/SunPlanner"));
const PlacesExplorer = lazy(() => import("./components/Places/PlacesExplorer"));
const Recommended = lazy(() => import("./components/Recommended/Recommended"));
const SavedPlaces = lazy(() => import("./components/Saved/SavedPlaces"));
const SettingsPanel = lazy(() => import("./components/Settings/SettingsPanel"));
const AboutPanel = lazy(() => import("./components/About/AboutPanel"));
const SunDetails = lazy(() => import("./components/FindSun/SunDetails"));

/** Mientras se descarga un panel: un punto de luz, sin parpadeos ni esqueletos. */
function PanelFallback() {
  return (
    <div className="flex h-full min-h-[180px] items-center justify-center">
      <span className="fts-breathe block h-2 w-2 rounded-full bg-sun" />
    </div>
  );
}
import { BARCELONA, CITY_BOUNDS, DEBUG, FEATURES } from "./config";
import { PANEL_VIEWS, useAppNavigation, type AppView } from "./hooks/useAppNavigation";
import { useLightSource } from "./hooks/useLightSource";
import { useMediaQuery } from "./hooks/useMediaQuery";
import { useNow } from "./hooks/useNow";
import { usePlaceInventory } from "./hooks/usePlaceInventory";
import { usePreferences } from "./hooks/usePreferences";
import { useSavedPlaces } from "./hooks/useSavedPlaces";
import { useSunSearch } from "./hooks/useSunSearch";
import { useTimeController } from "./hooks/useTimeController";
import { useDeepLink } from "./hooks/useDeepLink";
import type { PlaceLinkRef } from "./lib/deepLinks";
import { resolvePlaceRef } from "./services/placeLinkService";
import { getPlaceSunSummaryCached } from "./services/placeSunService";
import { useSunShadeMode } from "./hooks/useSunShadeMode";
import { describeCity, type SunShadeMode } from "./lib/answer";
import { SUN_INTENTS } from "./lib/placeTypes";
import { isSearchView } from "./lib/routing";
import { distanceMeters } from "./lib/coordinates";
import { onIdle } from "./lib/idle";
import { DEFAULT_PLANNER, buildSearchRequest, oneHourOfSun, type PlannerState } from "./lib/planning";
import { dayChoiceLabel, dayStartFor, minutesOfDay, zonedMs } from "./lib/planningTime";
import { presentOnDay, timelineRange } from "./lib/timelineRange";
import { cloudService } from "./services/cloudService";
import { PLACES_CONFIG } from "./config";
import { locateUser } from "./services/mapService";
import { createCoordinatePlace } from "./services/placeService";
import type { PlaceSunSummary } from "./services/placeSunService";
import { createShareablePlan, shareOrCopy } from "./services/planShareService";
import { satelliteService } from "./services/satelliteService";
import { SUN_UP_RAD, solarService } from "./services/solarService";
import { venueToSunPlace, venueService } from "./services/venueService";
import { formatClock, startOfZoneDay, zoneDayKey } from "./services/timeService";
import type {
  CameraState,
  CityStats,
  Highlight,
  LightSourceMode,
  LngLat,
  LocationTypeFilter,
  NormalizedSunRequest,
  PointTimeline,
  SavedPlace,
  SelectedPoint,
  SunPlace,
  SunSearchResult,
  SunlightResult,
  Theme,
} from "./types";
import { cn } from "./utils/cn";

const EMPTY_HIGHLIGHTS: Highlight[] = [];
const DAY = 86_400_000;
const HOUR = 3_600_000;
const MIN = 60_000;

const themeFor = (altDeg: number, prev?: Theme): Theme => {
  if (!prev) return altDeg < -2 ? "night" : "day";
  return prev === "day" ? (altDeg < -3 ? "night" : "day") : altDeg > -1 ? "day" : "night";
};

/** Plan por defecto: hoy a partir de las 17:00 (o de ahora), mañana si ya es tarde. */
function initialPlan(now: number): PlannerState {
  const m = minutesOfDay(now);
  const late = m > 19 * 60;
  const from = late ? 17 * 60 : Math.max(17 * 60 > m ? 17 * 60 : Math.ceil((m + 5) / 15) * 15, 8 * 60);
  return {
    ...DEFAULT_PLANNER,
    when: "custom",
    dayOffset: late ? 1 : 0,
    fromMinutes: from,
    toMinutes: Math.min(23 * 60 + 59, from + 120),
    durationMinutes: 60,
  };
}

interface ActiveResult {
  result: SunSearchResult;
  request: NormalizedSunRequest;
  peers: SunSearchResult[];
}

interface SavedTime {
  mode: "now" | "ahead";
  time: number;
  dayOffset: number;
}

export default function App() {
  const now = useNow(15_000);
  const device = useDevice();
  const isMobile = device === "mobile";
  /** Caben a la vez el panel de la vista y el de detalle. */
  const wide = useMediaQuery("(min-width: 1320px)");
  const [prefs, setPrefs] = usePreferences();
  const { view, navigate } = useAppNavigation();

  /* ------------------------------ día y hora (contexto que se conserva entre vistas) ------------------------------ */
  const [dayOffset, setDayOffset] = useState(0);
  const dayKey = zoneDayKey(now);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  const dayStart = useMemo(() => dayStartFor(now, dayOffset), [dayKey, dayOffset]);
  const sunTimes = useMemo(() => solarService.getSunTimes(dayStart, BARCELONA.lat, BARCELONA.lng), [dayStart]);
  /** Franja visible: de la hora presente del día elegido hasta la puesta de sol (mirar hacia delante). */
  const present = presentOnDay(now, dayOffset);
  /** Día solar completo que enseña la línea de tiempo (de noche, el de mañana). */
  const timelineDay = useMemo(() => {
    const next =
      dayOffset === 0 ? solarService.getSunTimes(dayStartFor(now, 1), BARCELONA.lat, BARCELONA.lng) : undefined;
    return timelineRange(present, sunTimes, next);
  }, [now, dayOffset, present, sunTimes]);
  const range = useMemo(
    () => ({ start: timelineDay.start, end: timelineDay.end }),
    [timelineDay.start, timelineDay.end]
  );

  const clock = useTimeController(now, range);
  const scrub = clock.scrub;
  const clockGoNow = clock.goNow;
  const selectedTime = clock.selectedTime;
  const sunPos = useMemo(() => solarService.getPosition(selectedTime, BARCELONA.lat, BARCELONA.lng), [selectedTime]);
  const up = sunPos.altitude >= SUN_UP_RAD;
  const isNow = clock.mode === "now" && dayOffset === 0;

  const timeRef = useRef(selectedTime);
  timeRef.current = selectedTime;
  const dayOffsetRef = useRef(dayOffset);
  dayOffsetRef.current = dayOffset;
  const pendingDayTime = useRef<number | null>(null);

  // Al cambiar de día, se aplica la hora pedida cuando ya existe el rango del nuevo día.
  useEffect(() => {
    const t = pendingDayTime.current;
    if (t === null) return;
    pendingDayTime.current = null;
    clock.scrub(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [dayStart]);

  const showTimeAt = useCallback(
    (t: number) => {
      const off = Math.round((startOfZoneDay(t) - startOfZoneDay(Date.now())) / DAY);
      if (off < 0 || off > 6) return;
      if (off === dayOffsetRef.current) scrub(t);
      else {
        pendingDayTime.current = t;
        setDayOffset(off);
      }
    },
    [scrub]
  );

  /** Otro día conservando la hora del día (17:30 hoy → 17:30 mañana). */
  const selectDay = useCallback(
    (offset: number) => {
      if (offset === dayOffsetRef.current) return;
      pendingDayTime.current = zonedMs(dayStartFor(Date.now(), offset), minutesOfDay(timeRef.current));
      setDayOffset(offset);
    },
    []
  );

  const goNow = useCallback(() => {
    pendingDayTime.current = null;
    setDayOffset(0);
    clockGoNow();
  }, [clockGoNow]);

  /* ------------------------------ tema ------------------------------ */
  const [autoTheme, setAutoTheme] = useState<Theme>(() =>
    themeFor(solarService.getPosition(Date.now(), BARCELONA.lat, BARCELONA.lng).altitudeDeg)
  );
  useEffect(() => setAutoTheme((prev) => themeFor(sunPos.altitudeDeg, prev)), [sunPos.altitudeDeg]);
  const theme: Theme = prefs.mapTheme === "auto" ? autoTheme : prefs.mapTheme === "dark" ? "night" : "day";
  useEffect(() => {
    document.documentElement.dataset.theme = theme;
    document.querySelector('meta[name="theme-color"]')?.setAttribute("content", theme === "night" ? "#0f1428" : "#f6f1e8");
  }, [theme]);

  /* ------------------------------ fuentes de luz ------------------------------ */
  // La meteorología se inicializa en tiempo ocioso, después del primer render: no estorba a la
  // carga del mapa ni a la interacción.
  useEffect(() => {
    const cancel = onIdle(() => {
      cloudService.start();
      satelliteService.start();
    }, 3000);
    return () => {
      cancel();
      cloudService.stop();
      satelliteService.stop();
    };
  }, []);
  const light = useLightSource(selectedTime);

  /* ------------------------------ estado de la interfaz ------------------------------ */
  const [loaded, setLoaded] = useState(false);
  const [stats, setStats] = useState<CityStats | null>(null);
  const [selection, setSelection] = useState<SelectedPoint | null>(null);
  const [pointTimeline, setPointTimeline] = useState<PointTimeline | null>(null);
  const [pointSunlight, setPointSunlight] = useState<SunlightResult | null>(null);
  const [activeResult, setActiveResult] = useState<ActiveResult | null>(null);
  const [userLocation, setUserLocation] = useState<LngLat | null>(null);
  const [camera, setCamera] = useState<CameraState>({ bearing: 0, pitch: 0 });
  const [layersOpen, setLayersOpen] = useState(false);
  const [toast, setToast] = useState<string | null>(null);
  const [debugSource, setDebugSource] = useState<LightSourceMode>("fused");
  const mapController = useRef<MapController | null>(null);
  const selCounter = useRef(1_000_000);
  const savedTime = useRef<SavedTime | null>(null);

  const findSearch = useSunSearch();
  const planSearch = useSunSearch();
  const placesSearch = useSunSearch();
  const recommendedSearch = useSunSearch();
  /** «Cerca de ti ahora» (Ahora): los tres mejores sitios para la próxima hora. */
  const nowSearch = useSunSearch();
  const [findPlanner, setFindPlanner] = useState<PlannerState>(DEFAULT_PLANNER);
  const [planPlanner, setPlanPlanner] = useState<PlannerState>(() => initialPlan(Date.now()));
  const [placesCategory, setPlacesCategory] = useState<LocationTypeFilter>("any");
  const inventory = usePlaceInventory(
    view === "now" || view === "find" || view === "plan" || view === "places" || view === "recommended"
  );
  const { saved, toggle } = useSavedPlaces();

  const handleCamera = useCallback((c: CameraState) => {
    const bearing = Math.round(c.bearing * 2) / 2;
    const pitch = Math.round(c.pitch);
    setCamera((prev) => (prev.bearing === bearing && prev.pitch === pitch ? prev : { bearing, pitch }));
  }, []);
  const handleMapReady = useCallback((c: MapController) => {
    mapController.current = c;
  }, []);
  const clearToast = useCallback(() => setToast(null), []);
  const handleLoaded = useCallback(() => setLoaded(true), []);

  /* ------------------------------ tiempo al abrir resultados ------------------------------ */
  /** Al abrir un resultado se muestra su mejor momento; al cerrarlo se vuelve exactamente a donde estaba. */
  const previewTime = useCallback(
    (t: number) => {
      if (!savedTime.current) {
        savedTime.current = { mode: clock.mode, time: timeRef.current, dayOffset: dayOffsetRef.current };
      }
      showTimeAt(t);
    },
    [clock.mode, showTimeAt]
  );
  const restoreTime = useCallback(() => {
    const s = savedTime.current;
    if (!s) return;
    savedTime.current = null;
    if (s.mode === "now") goNow();
    else if (s.dayOffset !== dayOffsetRef.current) {
      pendingDayTime.current = s.time;
      setDayOffset(s.dayOffset);
    } else scrub(s.time);
  }, [goNow, scrub]);

  /* ------------------------------ detalle ------------------------------ */
  const clearDetail = useCallback(() => {
    setActiveResult(null);
    setSelection(null);
    setPointTimeline(null);
    setPointSunlight(null);
  }, []);
  const closeDetail = useCallback(() => {
    clearDetail();
    restoreTime();
  }, [clearDetail, restoreTime]);

  const handleSelect = useCallback((p: SelectedPoint) => {
    setLayersOpen(false);
    setActiveResult(null);
    setPointTimeline(null);
    setPointSunlight(null);
    setSelection(p);
  }, []);

  const openResult = useCallback(
    (r: SunSearchResult, request: NormalizedSunRequest, peers: SunSearchResult[]) => {
      setActiveResult({ result: r, request, peers });
      setPointTimeline(null);
      setPointSunlight(null);
      setSelection({ id: ++selCounter.current, lng: r.spot.longitude, lat: r.spot.latitude, name: r.place.name });
      mapController.current?.flyToPoint(r.spot.longitude, r.spot.latitude, 16);
      previewTime((r.bestWindow ?? r.searchWindow).start);
    },
    [previewTime]
  );

  /* ------------------------------ navegación ------------------------------ */
  const go = useCallback(
    (v: AppView) => {
      setLayersOpen(false);
      clearDetail();
      restoreTime();
      // Find the Sun parte de la hora que se está explorando (no vuelve a «ahora»).
      if (v === "find" && findSearch.state.status === "idle" && clock.mode === "ahead") {
        const m = minutesOfDay(timeRef.current);
        setFindPlanner((p) =>
          p.when === "sunset"
            ? p
            : { ...p, when: "custom", dayOffset: dayOffsetRef.current, fromMinutes: m, toMinutes: Math.min(1439, m + p.durationMinutes) }
        );
      }
      if (v === "plan" && planSearch.state.status === "idle" && dayOffsetRef.current !== 0) {
        setPlanPlanner((p) => ({ ...p, dayOffset: dayOffsetRef.current }));
      }
      navigate(v);
    },
    [clearDetail, restoreTime, findSearch.state.status, planSearch.state.status, clock.mode, navigate]
  );

  /* ------------------------------ búsquedas ------------------------------ */
  const [venuesLoading, setVenuesLoading] = useState(false);

  const runFind = useCallback(
    async (p?: PlannerState, origin?: LngLat | null) => {
      const plan = p ?? findPlanner;
      setFindPlanner(plan);

      // «Café» y «Terraza» necesitan el inventario de negocios, que no está en el general.
      const wantsVenues = plan.intent === "coffee" || plan.locationType === "terrace";
      let places: SunPlace[] | undefined;
      if (wantsVenues) {
        setVenuesLoading(true);
        try {
          const { venues } = await venueService.loadVenues(PLACES_CONFIG.bbox);
          places = venues.map(venueToSunPlace);
        } catch {
          setToast("No hemos podido cargar los bares y cafeterías de la zona.");
          setVenuesLoading(false);
          return;
        }
        setVenuesLoading(false);
      }

      void findSearch.run(buildSearchRequest(plan, { now: Date.now(), origin: origin ?? userLocation }), {
        places,
      });
    },
    [findPlanner, findSearch, userLocation]
  );
  const runPlan = useCallback(
    (p?: PlannerState) => {
      const plan = p ?? planPlanner;
      setPlanPlanner(plan);
      void planSearch.run(buildSearchRequest(plan, { now: Date.now(), origin: userLocation }));
    },
    [planPlanner, planSearch, userLocation]
  );

  // Lugares: los mejores de hoy (o de mañana si ya no queda sol) para la categoría elegida.
  const placesKeyRef = useRef("");
  const todaySunset = useMemo(
    () => solarService.getSunTimes(dayStartFor(Date.now(), 0), BARCELONA.lat, BARCELONA.lng).sunset,
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [dayKey]
  );
  const placesTomorrow = now > todaySunset - 45 * MIN;
  useEffect(() => {
    if (view !== "places") return;
    const key = `${placesCategory}|${dayKey}|${Math.floor(now / HOUR)}|${userLocation ? 1 : 0}`;
    if (placesKeyRef.current === key) return;
    placesKeyRef.current = key;
    const t = Date.now();
    const sun = solarService.getSunTimes(dayStartFor(t, placesTomorrow ? 1 : 0), BARCELONA.lat, BARCELONA.lng);
    const start = placesTomorrow ? sun.sunrise : Math.floor(t / MIN) * MIN;
    const span = Math.max(10, Math.round((sun.sunset - start) / MIN));
    void placesSearch.run({
      startTime: start,
      endTime: sun.sunset,
      minimumSunlightMinutes: Math.min(60, span),
      locationType: placesCategory,
      origin: userLocation,
      limit: 6,
    });
  }, [view, placesCategory, dayKey, now, userLocation, placesTomorrow, placesSearch]);

  /* ------------------------------ resultados de la vista actual ------------------------------ */
  const viewOutcome =
    view === "now"
      ? nowSearch.state.outcome
      : view === "find"
      ? findSearch.state.outcome
      : view === "plan"
        ? planSearch.state.outcome
        : view === "places"
          ? placesSearch.state.outcome
          : null;
  const viewResults = useMemo(() => shownResults(viewOutcome), [viewOutcome]);

  // Cada conjunto de resultados nuevo se encuadra una vez, con un movimiento suave.
  const fitted = useRef(new WeakSet<object>());
  useEffect(() => {
    if (!viewOutcome || viewResults.length === 0 || fitted.current.has(viewOutcome)) return;
    fitted.current.add(viewOutcome);
    mapController.current?.fitPoints(viewResults.map((r) => ({ lng: r.spot.longitude, lat: r.spot.latitude })));
  }, [viewOutcome, viewResults]);
  useEffect(() => {
    if (view === "saved" && saved.length > 0) {
      mapController.current?.fitPoints(saved.map((p) => ({ lng: p.longitude, lat: p.latitude })));
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [view]);

  const activeId = activeResult?.result.placeId ?? null;
  const highlights = useMemo<Highlight[]>(() => {
    if (view === "saved") {
      return saved.map((p, i) => ({ id: p.id, lng: p.longitude, lat: p.latitude, score: 0.2, rank: i + 1, name: p.name }));
    }
    if (viewResults.length === 0) return EMPTY_HIGHLIGHTS;
    return viewResults.map((r) => {
      const primary = activeId ? r.placeId === activeId : r.rank === 1;
      return {
        id: r.placeId,
        lng: r.spot.longitude,
        lat: r.spot.latitude,
        score: primary ? 0.9 : 0.25,
        rank: r.rank,
        name: r.place.name,
        label: String(r.score),
        primary,
      };
    });
  }, [view, saved, viewResults, activeId]);

  const pickFromView = useCallback(
    (r: SunSearchResult) => {
      if (viewOutcome) openResult(r, viewOutcome.request, shownResults(viewOutcome));
    },
    [viewOutcome, openResult]
  );

  const openSaved = useCallback(
    (p: SavedPlace, summary: PlaceSunSummary | null) => {
      if (summary?.result && summary.request) {
        openResult(summary.result, summary.request, [summary.result]);
        return;
      }
      handleSelect({ id: ++selCounter.current, lng: p.longitude, lat: p.latitude, name: p.name });
      mapController.current?.flyToPoint(p.longitude, p.latitude, 16);
    },
    [openResult, handleSelect]
  );

  /* ------------------------------ enlaces profundos ------------------------------ */
  const openPlaceLink = useCallback(
    async (ref: PlaceLinkRef) => {
      const place = await resolvePlaceRef(ref);
      if (!place) return false;
      const summary = await getPlaceSunSummaryCached(place).catch(() => null);
      if (!summary?.result || !summary.request) return false;
      openResult(summary.result, summary.request, [summary.result]);
      return true;
    },
    [openResult]
  );
  useDeepLink({
    ready: loaded,
    view,
    chosenTime: clock.mode === "ahead" ? selectedTime : null,
    place: activeResult?.result.place ?? null,
    showTimeAt,
    flyTo: (lng, lat, zoom) => mapController.current?.flyToPoint(lng, lat, zoom ?? 16),
    openPlace: openPlaceLink,
    onToast: setToast,
  });

  const handlePickSpot = useCallback(
    (id: string) => {
      if (view === "saved") {
        const p = saved.find((s) => s.id === id);
        if (p) openSaved(p, null);
        return;
      }
      const r = viewResults.find((x) => x.placeId === id);
      if (r) pickFromView(r);
    },
    [view, saved, viewResults, openSaved, pickFromView]
  );

  /* ------------------------------ ubicación, guardar, compartir ------------------------------ */
  const requestUserLocation = useCallback(async (): Promise<LngLat | null> => {
    try {
      const pos = await locateUser();
      const m = 0.03;
      const inside =
        pos.lng > CITY_BOUNDS.west - m && pos.lng < CITY_BOUNDS.east + m && pos.lat > CITY_BOUNDS.south - m && pos.lat < CITY_BOUNDS.north + m;
      if (!inside) {
        setToast("Estás fuera de Barcelona: se busca en toda la ciudad.");
        return null;
      }
      setUserLocation(pos);
      return pos;
    } catch {
      setToast("No se pudo obtener tu ubicación.");
      return null;
    }
  }, []);

  const savedIds = useMemo(() => new Set(saved.map((p) => p.id)), [saved]);
  const isSaved = useCallback((id: string) => savedIds.has(id), [savedIds]);
  const toggleSaveResult = useCallback(
    (r: SunSearchResult) => setToast(toggle(r.place) ? "Guardado en tus sitios soleados" : "Quitado de guardados"),
    [toggle]
  );
  const shareResult = useCallback(async (r: SunSearchResult) => {
    if ((await shareOrCopy(createShareablePlan(r))) === "copied") setToast("Copiado al portapapeles");
  }, []);

  const pointSaved = useMemo(
    () => (selection ? saved.find((p) => distanceMeters(p.longitude, p.latitude, selection.lng, selection.lat) < 5) ?? null : null),
    [selection, saved]
  );
  const toggleSavePoint = useCallback(() => {
    if (!selection) return;
    const target = pointSaved ?? createCoordinatePlace(selection.lat, selection.lng, selection.name === "Tu ubicación" ? "Mi ubicación" : selection.name);
    setToast(toggle(target) ? "Punto guardado" : "Quitado de guardados");
  }, [selection, pointSaved, toggle]);

  /* ------------------------------ Ahora: respuesta y modo sol/sombra ------------------------------ */
  const sunShade = useSunShadeMode(now);
  const [answerHidden, setAnswerHidden] = useState(false);
  const [nearbyBusy, setNearbyBusy] = useState(false);
  const nextSunrise = useMemo(
    () => solarService.getSunTimes(dayStartFor(Date.now(), dayOffset + 1), BARCELONA.lat, BARCELONA.lng).sunrise,
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [dayKey, dayOffset]
  );
  const cityAnswer = useMemo(
    () =>
      describeCity({
        time: selectedTime,
        sunrise: sunTimes.sunrise,
        sunset: sunTimes.sunset,
        nextSunrise,
        sunPercent: up && stats ? stats.sunPercent : null,
        shadePercent: up && stats ? stats.shadePercent : null,
        cloudPercent: up && stats ? stats.cloudPercent : null,
        temperatureC: isNow ? sunShade.temperatureC : null,
        apparentC: isNow ? sunShade.apparentC : null,
        mode: sunShade.mode,
      }),
    [selectedTime, sunTimes, nextSunrise, up, stats, isNow, sunShade.temperatureC, sunShade.apparentC, sunShade.mode]
  );

  /** «Sol / Sombra cerca de mí»: ubicación (si se da), 1 h desde ahora y búsqueda en Buscar. */
  const startNearby = useCallback(
    async (mode: SunShadeMode) => {
      if (mode !== sunShade.mode) sunShade.choose(mode);
      setNearbyBusy(true);
      const origin = userLocation ?? (await requestUserLocation());
      setNearbyBusy(false);
      const plan: PlannerState = { ...oneHourOfSun(60, !!origin), intent: mode, preference: SUN_INTENTS[mode].preference };
      go("find");
      void runFind(plan, origin);
    },
    [sunShade, userLocation, requestUserLocation, go, runFind]
  );

  const showMyPoint = useCallback(() => {
    if (!userLocation) return;
    handleSelect({ id: ++selCounter.current, lng: userLocation.lng, lat: userLocation.lat, name: "Tu ubicación" });
    mapController.current?.flyToPoint(userLocation.lng, userLocation.lat, 16);
  }, [userLocation, handleSelect]);

  const handleRename = useCallback((id: number, name: string, area: string) => {
    setSelection((s) => (s && s.id === id ? { ...s, name, area } : s));
  }, []);

  // Buscar sigue al modo (sol o sombra) mientras no haya una búsqueda en marcha ni otra intención elegida.
  const findStatus = findSearch.state.status;
  useEffect(() => {
    if (findStatus !== "idle") return;
    setFindPlanner((p) =>
      p.locationType === "any" && (p.intent === "sun" || p.intent === "shade") && p.intent !== sunShade.mode
        ? { ...p, intent: sunShade.mode, preference: SUN_INTENTS[sunShade.mode].preference }
        : p
    );
  }, [sunShade.mode, findStatus]);

  const answerVisible = view === "now" && !activeResult && !selection && !answerHidden;
  const answerTimeLabel = isNow ? `Ahora · ${formatClock(selectedTime)}` : `${dayChoiceLabel(dayStart, now)} · ${formatClock(selectedTime)}`;
  const answerCard = (compact: boolean, inline = false) => (
    <AnswerCard
      compact={compact}
      inline={inline}
      answer={cityAnswer}
      timeLabel={answerTimeLabel}
      mode={sunShade.mode}
      heatSuggested={sunShade.auto === "shade" && !sunShade.overridden}
      hasLocation={!!userLocation}
      busy={nearbyBusy}
      onNearby={(m) => void startNearby(m)}
      onMyPoint={showMyPoint}
      onHide={inline ? undefined : () => setAnswerHidden(true)}
    />
  );

  /* ------------------------------ Ahora: «Cerca de ti ahora» ------------------------------ */
  // Próximas 2 h (hasta la puesta si se busca sol), 1 h mínima, cerca de la ubicación o, sin ella,
  // del centro. Pasada la puesta (o a menos de 45 min), las primeras horas de mañana.
  const nowTomorrow = placesTomorrow;
  const nowKeyRef = useRef("");
  const [nowLocating, setNowLocating] = useState(false);
  useEffect(() => {
    if (view !== "now") return;
    const mode = sunShade.mode;
    const origin: LngLat = userLocation ?? { lng: BARCELONA.lng, lat: BARCELONA.lat };
    const key = `${mode}|${dayKey}|${Math.floor(now / (15 * MIN))}|${origin.lng.toFixed(3)},${origin.lat.toFixed(3)}|${nowTomorrow ? 1 : 0}`;
    if (nowKeyRef.current === key) return;
    nowKeyRef.current = key;
    const t = Date.now();
    let start: number;
    let end: number;
    if (nowTomorrow) {
      const sun = solarService.getSunTimes(dayStartFor(t, 1), BARCELONA.lat, BARCELONA.lng);
      start = sun.sunrise + 90 * MIN;
      end = start + 2 * HOUR;
    } else {
      start = Math.floor(t / MIN) * MIN;
      end = mode === "sun" ? Math.min(start + 2 * HOUR, todaySunset) : start + 2 * HOUR;
    }
    const span = Math.max(10, Math.round((end - start) / MIN));
    void nowSearch.run({
      startTime: start,
      endTime: end,
      minimumSunlightMinutes: Math.min(60, span),
      maximumWalkingMinutes: userLocation ? 20 : 30,
      origin,
      locationType: "any",
      intent: mode,
      preference: SUN_INTENTS[mode].preference,
      limit: 3,
    }, {
      // Respuesta rápida en la pantalla de inicio: los 40 lugares más cercanos y 4 puntos por lugar.
      maxCandidates: 40,
      maxSamplePoints: 4,
    });
  }, [view, sunShade.mode, dayKey, now, userLocation, nowTomorrow, nowSearch, todaySunset]);

  const locateForNow = useCallback(async () => {
    setNowLocating(true);
    await requestUserLocation();
    setNowLocating(false);
  }, [requestUserLocation]);

  const modeWord = sunShade.mode === "shade" ? "sombra" : "sol";
  const nearby = {
    title: nowTomorrow
      ? `Mañana con ${modeWord}`
      : userLocation
        ? `Con ${modeWord} cerca de ti`
        : `Con ${modeWord} cerca del centro`,
    results: shownResults(nowSearch.state.outcome).slice(0, 3),
    loading: nowSearch.state.status === "searching" || (view === "now" && nowSearch.state.status === "idle"),
    emptyText: nowTomorrow
      ? "Todavía no hay sitios para mañana."
      : `No encontramos sitios con ${modeWord} seguida en la próxima hora. Prueba en Buscar.`,
    mode: sunShade.mode,
    now,
    sunset: todaySunset,
    hasLocation: !!userLocation,
    locating: nowLocating,
    activeId,
    onUseLocation: () => void locateForNow(),
    onPick: pickFromView,
    onMore: () => go("find"),
  };

  /* ------------------------------ teclado ------------------------------ */
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== "Escape" || e.defaultPrevented) return;
      const el = document.activeElement;
      if (el instanceof HTMLInputElement || el instanceof HTMLSelectElement) return;
      if (layersOpen) setLayersOpen(false);
      else if (activeResult || selection) closeDetail();
      else if (view !== "explore" && view !== "now") go("explore");
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [layersOpen, activeResult, selection, view, closeDetail, go]);

  /* ------------------------------ geometría de la pantalla ------------------------------ */
  // En móvil, Ahora no es una hoja: la tarjeta va arriba y los sitios en una tira sobre la línea de tiempo.
  const panelOpen = PANEL_VIEWS.has(view) && !(isMobile && view === "now");
  const panelLabel = isSearchView(view) ? "Buscar" : NAV_ITEMS[view].label;
  const nearbyStrip = isMobile && view === "now" && !activeResult && !selection;
  const hasDetail = !!activeResult || !!selection;
  const navW = isMobile ? 0 : device === "tablet" || prefs.sidebarCollapsed ? LAYOUT.sidebarCompact : LAYOUT.sidebarExpanded;
  const navRight = isMobile ? 0 : LAYOUT.gap + navW;
  const panelW = device === "tablet" ? LAYOUT.panelWidthTablet : LAYOUT.panelWidth;
  const detailInLeft = !isMobile && panelOpen && hasDetail && !wide;
  const detailRight = !isMobile && hasDetail && !detailInLeft;
  const mapLeft = navRight + LAYOUT.gap + (!isMobile && panelOpen ? panelW + LAYOUT.gap : 0);
  const sheetOpen = isMobile && (panelOpen || hasDetail);
  const showTimeline = isMobile ? !sheetOpen : view !== "settings" && view !== "about";
  /** Espacio que ocupa la línea de tiempo (o su acceso compacto, si está oculta). */
  const timelineSpace = !showTimeline
    ? 0
    : prefs.timelineHidden
      ? LAYOUT.timelineCollapsedHeight
      : LAYOUT.timelineHeight;

  useEffect(() => {
    mapController.current?.setInsets(
      isMobile
        ? {
            top: answerVisible && !sheetOpen ? 270 : 104,
            left: 0,
            right: 0,
            bottom: sheetOpen
              ? Math.round(window.innerHeight * 0.5)
              : (prefs.timelineHidden ? 150 : 200) + (nearbyStrip ? 128 : 0),
          }
        : {
            top: 64,
            left: mapLeft,
            right: LAYOUT.controlsWidth + (detailRight ? LAYOUT.detailWidth + LAYOUT.gap : 0),
            bottom: showTimeline ? timelineSpace + LAYOUT.gap * 2 : LAYOUT.gap,
          }
    );
  }, [isMobile, sheetOpen, mapLeft, detailRight, showTimeline, timelineSpace, prefs.timelineHidden, answerVisible, nearbyStrip]);

  /* ------------------------------ contenido de los paneles ------------------------------ */
  const detailNode: ReactNode =
    activeResult || selection ? (
      <Suspense fallback={<PanelFallback />}>
        {activeResult ? (
          <SunDetails
            key={activeResult.result.placeId}
            embedded
            result={activeResult.result}
            peers={activeResult.peers}
            request={activeResult.request}
            saved={isSaved(activeResult.result.placeId)}
            onToggleSave={() => toggleSaveResult(activeResult.result)}
            onShare={() => void shareResult(activeResult.result)}
            onClose={closeDetail}
            now={now}
            onTerraceFeedback={(hasTerrace: boolean) =>
              setToast(
                hasTerrace
                  ? "¡Gracias! Esta terraza queda confirmada en tus búsquedas."
                  : "Gracias, lo tendremos en cuenta para no recomendarla."
              )
            }
          />
        ) : (
          <PointPanel
            key={selection!.id}
            embedded
            point={selection!}
            timeline={pointTimeline}
            sunlight={pointSunlight}
            now={now}
            time={selectedTime}
            onClose={closeDetail}
            saved={!!pointSaved}
            onToggleSave={toggleSavePoint}
            mode={sunShade.mode}
            apparentC={sunShade.apparentC}
          />
        )}
      </Suspense>
    ) : null;

  const closeView = () => go("explore");
  const viewNode: ReactNode = (
    <Suspense fallback={<PanelFallback />}>
      {(() => {
        switch (view) {
      case "now":
        return <NowPanel answerCard={answerCard(false, true)} {...nearby} />;
      case "find":
        return (
          <FindSunPanel
            search={findSearch}
            planner={findPlanner}
            onChange={(patch) => {
              // Elegir «Máximo sol» o «Sombra» es una elección de modo: se respeta hasta medianoche.
              if ((patch.intent === "sun" || patch.intent === "shade") && (patch.locationType ?? "any") === "any") {
                sunShade.choose(patch.intent);
              }
              setFindPlanner((p) => ({ ...p, ...patch }));
            }}
            onSearch={runFind}
            venuesLoading={venuesLoading}
            now={now}
            origin={userLocation}
            activeId={activeId}
            onPick={pickFromView}
            onRequestLocation={requestUserLocation}
            onOpenPlaces={() => go("places")}
            onOpenPlan={() => go("plan")}
            onClose={closeView}
          />
        );
      case "plan":
        return (
          <SunPlanner
            search={planSearch}
            planner={planPlanner}
            onChange={(patch) => setPlanPlanner((p) => ({ ...p, ...patch }))}
            onSearch={runPlan}
            now={now}
            origin={userLocation}
            inventory={inventory}
            activeId={activeId}
            isSaved={isSaved}
            onPick={pickFromView}
            onToggleSave={toggleSaveResult}
            onShare={(r) => void shareResult(r)}
            onRequestLocation={requestUserLocation}
            onClose={closeView}
          />
        );
      case "places":
        return (
          <PlacesExplorer
            inventory={inventory}
            category={placesCategory}
            onCategory={setPlacesCategory}
            search={placesSearch}
            dayWord={placesTomorrow ? "Mañana" : "Hoy"}
            activeId={activeId}
            onPick={pickFromView}
            onClose={closeView}
          />
        );
      case "recommended":
        return (
          <Recommended
            inventory={inventory}
            search={recommendedSearch}
            dayWord={placesTomorrow ? "Mañana" : "Hoy"}
            activeId={activeId}
            onPick={pickFromView}
            onOpenPlaces={() => go("places")}
            onClose={closeView}
          />
        );
      case "saved":
        return (
          <SavedPlaces
            saved={saved}
            activeId={activeId}
            onOpen={openSaved}
            onRemove={(p) => {
              toggle(p);
              setToast("Quitado de guardados");
            }}
            onClose={closeView}
          />
        );
      case "settings":
        return (
          <SettingsPanel
            prefs={prefs}
            onChange={setPrefs}
            light={light}
            onRequestLocation={() => void requestUserLocation()}
            onClose={closeView}
          />
        );
      case "about":
        return <AboutPanel onClose={closeView} />;
      default:
        return null;
      }
    })()}
    </Suspense>
  );

  /** Las pestañas de Buscar comparten un contenedor con su título y sus pestañas. */
  const panelNode: ReactNode = isSearchView(view) ? (
    <SearchHub view={view} onTab={(v) => go(v)} onClose={closeView}>
      {viewNode}
    </SearchHub>
  ) : (
    viewNode
  );

  const layerPanel = <LayerControl prefs={prefs} onChange={setPrefs} onClose={() => setLayersOpen(false)} />;
  /** Relieve 3D efectivo: hace falta ver los edificios. */
  const buildings3D = prefs.showBuildings && (prefs.buildings3D || FEATURES.buildings3D);
  const dayLabel = dayChoiceLabel(dayStart, now);

  /* ------------------------------ composición ------------------------------ */
  const map = (
    <BarcelonaMap
      theme={theme}
      onSelect={handleSelect}
      onReady={handleMapReady}
      onLoaded={handleLoaded}
      onToast={setToast}
      onCamera={handleCamera}
      onUserLocation={setUserLocation}
      onRename={handleRename}
      autoTilt={prefs.autoTilt && buildings3D}
    >
      <BuildingLayer visible={prefs.showBuildings} extrude={prefs.buildings3D || FEATURES.buildings3D} />
      <SolarOverlay
        time={selectedTime}
        dayStart={dayStart}
        showSunPath={prefs.showSunPath}
        buildings3D={buildings3D}
        selection={selection}
        highlights={highlights}
        onStats={setStats}
        onPointTimeline={setPointTimeline}
        onPointSunlight={setPointSunlight}
      >
        <ShadowLayer visible={prefs.showShadows} />
        <CloudLayer visible={prefs.showClouds} source={debugSource} />
      </SolarOverlay>
      <MapMarkers
        selection={selection}
        userLocation={userLocation}
        highlights={highlights}
        activeSpotId={activeId}
        onPickSpot={handlePickSpot}
      />
    </BarcelonaMap>
  );

  const timeline = prefs.timelineHidden ? (
    <TimelineCollapsed
      selectedTime={selectedTime}
      dayLabel={dayLabel}
      onShow={() => setPrefs({ timelineHidden: false })}
    />
  ) : (
    <TimeSlider
      selectedTime={selectedTime}
      now={now}
      range={range}
      day={timelineDay}
      mode={clock.mode}
      isNight={!up}
      dayOffset={dayOffset}
      onSelectDay={selectDay}
      onHide={() => setPrefs({ timelineHidden: true })}
      intervals={pointTimeline && selection ? pointTimeline.intervals : null}
      zones={light.zones}
      provenance={PROVENANCE_WORD[light.summary.kind]}
      onScrub={scrub}
      onNow={goNow}
      compact={isMobile}
    />
  );

  return (
    <AppShell map={map}>
      {loaded && !isMobile && (
        <>
          <Sidebar
            view={view}
            compact={navW === LAYOUT.sidebarCompact}
            canExpand={device === "desktop"}
            onNavigate={go}
            onToggleCompact={() => setPrefs({ sidebarCollapsed: !prefs.sidebarCollapsed })}
          />

          {panelOpen && (
            <ContextPanel
              device={device}
              side="left"
              label={detailInLeft ? "Detalle" : panelLabel}
              width={panelW}
              style={{ left: navRight + LAYOUT.gap, top: LAYOUT.gap, bottom: LAYOUT.gap }}
              resetKey={view}
              key={detailInLeft ? "detail" : view}
            >
              {detailInLeft ? detailNode : panelNode}
            </ContextPanel>
          )}

          {detailRight && (
            <ContextPanel
              device={device}
              side="right"
              label="Detalle"
              width={LAYOUT.detailWidth}
              style={{
                right: LAYOUT.controlsWidth,
                top: LAYOUT.gap,
                maxHeight: `calc(100% - ${LAYOUT.gap * 3 + timelineSpace}px)`,
              }}
            >
              {detailNode}
            </ContextPanel>
          )}

          <div className="pointer-events-none absolute z-10 transition-[left] duration-300" style={{ left: mapLeft, top: LAYOUT.gap }}>
            <SunStatus
              stats={stats}
              time={selectedTime}
              dayLabel={dayLabel}
              sunTimes={sunTimes}
              up={up}
              altitudeDeg={sunPos.altitudeDeg}
              azimuthDeg={sunPos.azimuthDeg}
              light={light}
            />

          </div>

          <div className="pointer-events-none absolute right-3 z-20" style={{ top: LAYOUT.gap }}>
            <div className="pointer-events-auto">
              <MapControls
                variant="desktop"
                onZoomIn={() => mapController.current?.zoomIn()}
                onZoomOut={() => mapController.current?.zoomOut()}
                onLocate={() => mapController.current?.locate()}
                onResetNorth={() => mapController.current?.resetNorth()}
                bearing={camera.bearing}
                pitch={camera.pitch}
                layersOpen={layersOpen}
                onToggleLayers={() => setLayersOpen((v) => !v)}
                layerPanel={layerPanel}
                sun={{ azimuthDeg: sunPos.azimuthDeg, altitudeDeg: sunPos.altitudeDeg }}
                isNow={isNow}
                onNow={goNow}
                showSunDial={prefs.showSunPath}
              />
            </div>
          </div>

          {showTimeline && (
            <div
              className="pointer-events-none absolute bottom-3 z-10 flex justify-center transition-[left] duration-300"
              style={{ left: mapLeft, right: LAYOUT.controlsWidth }}
            >
              <div className="pointer-events-auto w-full max-w-[760px]">{timeline}</div>
            </div>
          )}
        </>
      )}

      {loaded && isMobile && (
        <>
          <MobileHeader
            view={view}
            layersOpen={layersOpen}
            onToggleLayers={() => setLayersOpen((v) => !v)}
            onLocate={() => mapController.current?.locate()}
            onNavigate={go}
            onBrand={() => go("now")}
            layerPanel={layerPanel}
          />

          <div
            className={cn("pointer-events-none fixed left-3 z-20 transition-opacity duration-300", layersOpen && "opacity-0")}
            style={{ top: "calc(env(safe-area-inset-top) + 58px)" }}
          >
            <SunStatus
              compact
              stats={stats}
              time={selectedTime}
              dayLabel={dayLabel}
              sunTimes={sunTimes}
              up={up}
              altitudeDeg={sunPos.altitudeDeg}
              azimuthDeg={sunPos.azimuthDeg}
              light={light}
            />
            {answerVisible && !sheetOpen && !layersOpen && <div className="mt-2">{answerCard(true)}</div>}
          </div>
          <div
            className={cn("pointer-events-auto fixed right-3 z-20 transition-opacity duration-300", layersOpen && "pointer-events-none opacity-0")}
            style={{ top: "calc(env(safe-area-inset-top) + 58px)" }}
          >
            <MapControls
              variant="mobile"
              onZoomIn={() => undefined}
              onZoomOut={() => undefined}
              onLocate={() => mapController.current?.locate()}
              onResetNorth={() => mapController.current?.resetNorth()}
              bearing={camera.bearing}
              pitch={camera.pitch}
              layersOpen={false}
              onToggleLayers={() => setLayersOpen(true)}
              layerPanel={null}
              sun={{ azimuthDeg: sunPos.azimuthDeg, altitudeDeg: sunPos.altitudeDeg }}
              isNow={isNow}
              onNow={goNow}
            />
          </div>

          {sheetOpen ? (
            <ContextPanel
              device="mobile"
              side="left"
              label={hasDetail ? "Detalle" : panelLabel}
              mobileBottom={LAYOUT.mobileNav}
              resetKey={hasDetail ? `d${selection?.id ?? activeId}` : view}
              key={hasDetail ? "detail" : view}
              onDismiss={hasDetail ? closeDetail : () => go("explore")}
            >
              {hasDetail ? detailNode : panelNode}
            </ContextPanel>
          ) : (
            <div className="fixed inset-x-2 z-20" style={{ bottom: `calc(${LAYOUT.mobileNav}px + env(safe-area-inset-bottom) + 8px)` }}>
              {/* Ahora: los sitios cerca, encima de la línea de tiempo (sin taparla). */}
              {nearbyStrip && (
                <div className="fts-fade-in mb-2">
                  <NearbyStrip {...nearby} />
                </div>
              )}
              <div className="pointer-events-auto">{timeline}</div>
            </div>
          )}

          <MobileNavigation view={view} onNavigate={go} />
        </>
      )}

      {DEBUG.weather && (
        <DebugPanel
          latitude={selection ? selection.lat : BARCELONA.lat}
          longitude={selection ? selection.lng : BARCELONA.lng}
          time={selectedTime}
          source={debugSource}
          onSourceChange={setDebugSource}
        />
      )}

      <Toast message={toast} onDone={clearToast} />
      <Splash visible={!loaded} />
    </AppShell>
  );
}
