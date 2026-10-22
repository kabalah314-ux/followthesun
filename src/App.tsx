import { lazy, Suspense, useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import DebugPanel from "./components/DebugPanel";
import { shownResults } from "./components/Find/SearchResults";
import ChipsBar from "./components/Find/ChipsBar";
import FiltersPanel from "./components/Find/FiltersPanel";
import { specTitle } from "./components/Find/specLabel";
import { CloseIcon, SunGlyph } from "./components/Icons";
import BottomSheet, { type WindowRect } from "./components/Layout/BottomSheet";
import { AppShell, PanelChrome } from "./components/Layout/ContextPanel";
import SidePanel from "./components/Layout/SidePanel";
import { LAYOUT, useDevice } from "./components/Layout/layout";
import { Layers, LocateFixed } from "./components/LineIcons";
import { LogoMark, Wordmark } from "./components/Logo";
import BarcelonaMap, { type MapController, type MapInsets } from "./components/Map/BarcelonaMap";
import BuildingLayer from "./components/Map/BuildingLayer";
import CloudLayer from "./components/Map/CloudLayer";
import LayerControl from "./components/Map/LayerControl";
import MapControls from "./components/Map/MapControls";
import MapMarkers from "./components/Map/MapMarkers";
import ShadowLayer from "./components/Map/ShadowLayer";
import SolarOverlay from "./components/Map/SolarOverlay";
import SunStatus from "./components/Map/SunStatus";
import TimeSlider, { TimePill, useAutoHide, type DayPlayer } from "./components/Map/TimeSlider";
import DestinationTabs from "./components/Navigation/DestinationTabs";
import MobileNavigation from "./components/Navigation/MobileNavigation";
import ForYou from "./components/Now/ForYou";
import SheetAnswer from "./components/Now/SheetAnswer";
import AffiliateSlot from "./components/Places/AffiliateSlot";
import { PlaceCardBody, PlaceCardHeader, type CardData } from "./components/Places/PlaceCard";
import PlaceMedia, { type MediaTab } from "./components/Places/PlaceMedia";
import PlansTabs from "./components/Plan/PlansTabs";
import type { WeekCandidate } from "./components/Plan/WeekPanel";
import PointPanel from "./components/PointPanel";
import Collections from "./components/Recommended/Collections";
import MineTabs from "./components/Saved/MineTabs";
import ProfileMenu from "./components/Search/ProfileMenu";
import UniversalSearch from "./components/Search/UniversalSearch";
import { PROVENANCE_WORD } from "./components/SourceStatusLine";
import Splash from "./components/Splash";
import Toast from "./components/Toast";
import VideoReady from "./components/Map/VideoReady";
import { canRecordVideo, useDayAnimation, videoFileExtension } from "./graphics";
import { BARCELONA, CITY_BOUNDS, DEBUG, FEATURES } from "./config";
import { useAppNavigation, type AppView, type ViewTab } from "./hooks/useAppNavigation";
import { useDeepLink } from "./hooks/useDeepLink";
import { useExplore, type ExploreState } from "./hooks/useExplore";
import { useLightSource } from "./hooks/useLightSource";
import { useLocalStore } from "./hooks/useLocalStore";
import { useNow } from "./hooks/useNow";
import { usePlaceInventory } from "./hooks/usePlaceInventory";
import { usePreferences } from "./hooks/usePreferences";
import { useReducedMotion } from "./hooks/useReducedMotion";
import { useSavedPlaces } from "./hooks/useSavedPlaces";
import { useSunSearch } from "./hooks/useSunSearch";
import { useSunShadeMode } from "./hooks/useSunShadeMode";
import { useTimeController } from "./hooks/useTimeController";
import { useUniversalSearch, type SearchSuggestion } from "./hooks/useUniversalSearch";
import { useViewport } from "./hooks/useViewport";
import { describeCity, describePoint, type SunShadeMode } from "./lib/answer";
import { distanceMeters } from "./lib/coordinates";
import { placeSlug, type PlaceLinkRef } from "./lib/deepLinks";
import { addAlert, downloadAlert } from "./services/alertsService";
import {
  activeFilterCount,
  chipSpec,
  collectionSpec,
  collectionsFor,
  homeSpec,
  nearestOfType,
  NO_FILTERS,
  sanitizeFilters,
  type ChipId,
  type ExploreFilters,
  type ExploreSpec,
} from "./lib/explore";
import { decodeGroupPlan, GROUP_MAX, optionToPlace } from "./lib/groupPlan";
import { onIdle } from "./lib/idle";
import { readLocal, writeLocal } from "./lib/localStore";
import { searchPlaces, buildNameIndex } from "./lib/placeSearch";
import { DEFAULT_PLANNER, buildSearchRequest, type PlannerState } from "./lib/planning";
import { dayChoiceLabel, dayStartFor, minutesOfDay, zonedMs } from "./lib/planningTime";
import { MINE_TABS, PLANS_TABS, urlWith, type MineTab, type PlansTab } from "./lib/routing";
import { isSheetLevel, sheetHeights, type SheetLevel } from "./lib/sheet";
import { presentOnDay, timelineRange } from "./lib/timelineRange";
import { cloudService } from "./services/cloudService";
import { addToGroupDraft, groupDraftStore, removeFromGroupDraft, setGroupDraftTitle } from "./services/groupDraftService";
import { historyStore, historyToPlace, recordVisit } from "./services/historyService";
import { homeStore, homeToPlace } from "./services/homeService";
import { forgetPlace, listsStore } from "./services/listsService";
import { locateUser } from "./services/mapService";
import { resolvePlaceRef } from "./services/placeLinkService";
import { createCoordinatePlace, placeService } from "./services/placeService";
import { getPlaceSunSummaryCached, savedToPlace, type PlaceSunSummary } from "./services/placeSunService";
import { createShareablePlan, shareOrCopy } from "./services/planShareService";
import { minutesForStraightMeters } from "./services/routeService";
import { satelliteService } from "./services/satelliteService";
import { SUN_UP_RAD, solarService } from "./services/solarService";
import type { PlannedRoute } from "./services/sunRouteService";
import { learnTaste, tasteStore } from "./services/tasteService";
import { formatClock, formatDayLabel, getZoneParts, startOfZoneDay, zoneDayKey } from "./services/timeService";
import type {
  CameraState,
  CityStats,
  Highlight,
  LightSourceMode,
  LngLat,
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
import { tr } from "./i18n";

/**
 * Los paneles de Planes, Mis sitios, Ajustes y «Cómo lo sabemos» se descargan al abrirlos: la
 * carga inicial solo trae el mapa, Explorar y la línea de tiempo.
 */
const SunPlanner = lazy(() => import("./components/Plan/SunPlanner"));
const SunRoutePanel = lazy(() => import("./components/Plan/SunRoutePanel"));
const WeekPanel = lazy(() => import("./components/Plan/WeekPanel"));
const GroupPlanPanel = lazy(() => import("./components/Plan/GroupPlanPanel"));
const AlertsPanel = lazy(() => import("./components/Plan/AlertsPanel"));
const ListsPanel = lazy(() => import("./components/Saved/ListsPanel"));
const HomePanel = lazy(() => import("./components/Saved/HomePanel"));
const HistoryPanel = lazy(() => import("./components/Saved/HistoryPanel"));
const SettingsPanel = lazy(() => import("./components/Settings/SettingsPanel"));
const AboutPanel = lazy(() => import("./components/About/AboutPanel"));

/** Mientras se descarga un panel: un punto de luz, sin parpadeos ni esqueletos. */
function PanelFallback() {
  return (
    <div className="flex h-full min-h-[180px] items-center justify-center">
      <span className="fts-breathe block h-2 w-2 rounded-full bg-sun" />
    </div>
  );
}

const EMPTY_HIGHLIGHTS: Highlight[] = [];
const DAY = 86_400_000;
const HOUR = 3_600_000;
const SHEET_KEY = "fts:sheet:v1";
const FILTERS_KEY = "fts:filters:v1";

const themeFor = (altDeg: number, prev?: Theme): Theme => {
  if (!prev) return altDeg < -2 ? "night" : "day";
  return prev === "day" ? (altDeg < -3 ? "night" : "day") : altDeg > -1 ? "day" : "night";
};

/** Plan por defecto de «Más tarde»: hoy a partir de las 17:00 (o de ahora), mañana si ya es tarde. */
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

/** Por qué una búsqueda de Explorar sale vacía, en palabras (las nubes, la noche o los edificios). */
function exploreEmptyText(e: ExploreState): string {
  if (e.filteredOut) return tr("forYou.ninguno_cumple_los_filtros");
  const when = e.window.movedToTomorrow
    ? tr("app.manana_a_primera_hora")
    : tr("app.entre_las_y_las", { p0: formatClock(e.window.start), p1: formatClock(e.window.end) });
  switch (e.outcome?.noSunReason) {
    case "clouds":
      return tr("app.las_nubes_taparan_el_sol", { p0: when });
    case "shade":
      return tr("app.los_edificios_dan_sombra_a", { p0: when });
    case "night":
      return tr("app.ya_no_queda_sol_hoy");
    case "no_places":
      return e.filters.maxWalk !== null ? tr("forYou.nada_tan_cerca") : tr("forYou.sin_sitios_de_ese_tipo");
    default:
      if (e.state.failed) return tr("forYou.algo_ha_fallado");
      return tr(e.mode === "shade" ? "app.no_encontramos_sitios_con_sombra_seguida" : "app.no_encontramos_sitios_con_sol_seguido", { p0: when });
  }
}

interface SavedTime {
  mode: "now" | "ahead";
  time: number;
  dayOffset: number;
}

interface CardState {
  data: CardData;
  peers: SunSearchResult[];
}


/** Cabecera de una vista en la hoja o el panel: título, subtítulo y «atrás». */
function ViewHeader({ title, subtitle, onBack }: { title: string; subtitle?: string; onBack?(): void }) {
  return (
    <div className="flex items-center gap-1">
      {onBack && (
        <button
          type="button"
          onClick={onBack}
          aria-label={tr("contextPanel.atras")}
          className="-ml-2 flex h-11 w-11 shrink-0 items-center justify-center rounded-full text-ink-soft outline-none transition-colors hover:bg-ink/5 hover:text-ink focus-visible:ring-2 focus-visible:ring-sun/60"
        >
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
            <path d="M15 18l-6-6 6-6" />
          </svg>
        </button>
      )}
      <div className="min-w-0">
        <h2 className="truncate font-serif text-[23px] leading-tight text-ink">{title}</h2>
        {subtitle && <p className="mt-0.5 truncate text-[13px] text-ink-soft">{subtitle}</p>}
      </div>
    </div>
  );
}

export default function App() {
  const now = useNow(15_000);
  const device = useDevice();
  const isMobile = device === "mobile";
  const vp = useViewport();
  const reduced = useReducedMotion();
  const [prefs, setPrefs] = usePreferences();
  const { view, tab, navigate } = useAppNavigation();
  const plansTab: PlansTab = view === "plans" && tab && (PLANS_TABS as readonly string[]).includes(tab) ? (tab as PlansTab) : "route";
  const mineTab: MineTab = view === "mine" && tab && (MINE_TABS as readonly string[]).includes(tab) ? (tab as MineTab) : "lists";

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
    const next = dayOffset === 0 ? solarService.getSunTimes(dayStartFor(now, 1), BARCELONA.lat, BARCELONA.lng) : undefined;
    return timelineRange(present, sunTimes, next);
  }, [now, dayOffset, present, sunTimes]);
  const range = useMemo(() => ({ start: timelineDay.start, end: timelineDay.end }), [timelineDay.start, timelineDay.end]);

  const clock = useTimeController(now, range);
  const scrub = clock.scrub;

  /* «El día en movimiento»: del amanecer a la puesta en 12 s moviendo la hora de la app, y en vídeo. */
  const rangeRef = useRef(range);
  rangeRef.current = range;
  const dayAnim = useDayAnimation({ getRange: () => rangeRef.current, scrub });
  const canVideo = useMemo(() => canRecordVideo(), []);
  const [videoProgress, setVideoProgress] = useState<number | null>(null);
  const [videoFile, setVideoFile] = useState<File | null>(null);
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
  const selectDay = useCallback((offset: number) => {
    if (offset === dayOffsetRef.current) return;
    pendingDayTime.current = zonedMs(dayStartFor(Date.now(), offset), minutesOfDay(timeRef.current));
    setDayOffset(offset);
  }, []);

  const goNow = useCallback(() => {
    pendingDayTime.current = null;
    setDayOffset(0);
    clockGoNow();
  }, [clockGoNow]);

  /* ------------------------------ tema ------------------------------ */
  const [autoTheme, setAutoTheme] = useState<Theme>(() => themeFor(solarService.getPosition(Date.now(), BARCELONA.lat, BARCELONA.lng).altitudeDeg));
  useEffect(() => setAutoTheme((prev) => themeFor(sunPos.altitudeDeg, prev)), [sunPos.altitudeDeg]);
  const theme: Theme = prefs.mapTheme === "auto" ? autoTheme : prefs.mapTheme === "dark" ? "night" : "day";
  useEffect(() => {
    document.documentElement.dataset.theme = theme;
    document.querySelector('meta[name="theme-color"]')?.setAttribute("content", theme === "night" ? "#0f1428" : "#f6f1e8");
  }, [theme]);

  /* ------------------------------ fuentes de luz ------------------------------ */
  // La meteorología se inicializa en tiempo ocioso, después del primer render.
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
  const [card, setCard] = useState<CardState | null>(null);
  const [userLocation, setUserLocation] = useState<LngLat | null>(null);
  const [camera, setCamera] = useState<CameraState>({ bearing: 0, pitch: 0 });
  const [layersOpen, setLayersOpen] = useState(false);
  const [toast, setToast] = useState<string | null>(null);
  const [debugSource, setDebugSource] = useState<LightSourceMode>("fused");
  const [locating, setLocating] = useState(false);
  const mapController = useRef<MapController | null>(null);
  const selCounter = useRef(1_000_000);
  const savedTime = useRef<SavedTime | null>(null);
  const cardSeq = useRef(0);
  const titleRef = useRef<HTMLHeadingElement | null>(null);

  // Hoja inferior (móvil): recuerda su altura entre visitas.
  const [sheetLevel, setSheetLevelRaw] = useState<SheetLevel>(() => readLocal<SheetLevel>(SHEET_KEY, "half", (v) => (isSheetLevel(v) ? v : null)));
  const sheetLevelRef = useRef(sheetLevel);
  sheetLevelRef.current = sheetLevel;
  const setSheetLevel = useCallback((l: SheetLevel) => {
    setSheetLevelRaw(l);
    writeLocal(SHEET_KEY, l);
  }, []);
  const [windowRect, setWindowRect] = useState<WindowRect | null>(null);
  const [mediaTab, setMediaTab] = useState<MediaTab>("3d");
  const [timelineOpen, setTimelineOpen] = useState(false);

  const sunShade = useSunShadeMode(now);
  const inventory = usePlaceInventory(true);
  const { saved, toggle } = useSavedPlaces();
  const lists = useLocalStore(listsStore);
  const home = useLocalStore(homeStore);
  const history = useLocalStore(historyStore);
  const taste = useLocalStore(tasteStore);
  const groupDraft = useLocalStore(groupDraftStore);
  const [sharedCode, setSharedCode] = useState<string | null>(() => {
    try {
      return new URLSearchParams(window.location.search).get("g");
    } catch {
      return null;
    }
  });
  const [weekFocus, setWeekFocus] = useState<SunPlace | null>(null);

  /* ------------------------------ Explorar ------------------------------ */
  const [query, setQuery] = useState("");
  const [spec, setSpec] = useState<ExploreSpec>(() => homeSpec());
  const [filters, setFiltersRaw] = useState<ExploreFilters>(() => readLocal(FILTERS_KEY, NO_FILTERS, (v) => sanitizeFilters(v)));
  const setFilters = useCallback(
    (patch: Partial<ExploreFilters>) =>
      setFiltersRaw((f) => {
        const n = { ...f, ...patch };
        writeLocal(FILTERS_KEY, n);
        return n;
      }),
    []
  );
  const [filtersOpen, setFiltersOpen] = useState(false);
  const [hoverId, setHoverId] = useState<string | null>(null);

  const explore = useExplore({
    enabled: loaded && view === "explore" && !card && !selection,
    spec,
    appMode: sunShade.mode,
    now,
    selected: clock.mode === "ahead" ? selectedTime : null,
    userLocation,
    filters,
  });
  const universal = useUniversalSearch(query, sunShade.mode, now);
  const hourSlot = Math.floor(now / HOUR);
  const hot = sunShade.auto === "shade";
  const collections = useMemo(() => {
    const p = getZoneParts(Date.now());
    return collectionsFor({ month: p.month, hour: p.hour, hot });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [hourSlot, hot]);

  /* ------------------------------ Planes ------------------------------ */
  const planSearch = useSunSearch();
  const [planPlanner, setPlanPlanner] = useState<PlannerState>(() => initialPlan(Date.now()));
  const [route, setRoute] = useState<PlannedRoute | null>(null);
  const sharedPlan = useMemo(() => (sharedCode ? decodeGroupPlan(sharedCode) : null), [sharedCode]);

  const handleCamera = useCallback((c: CameraState) => {
    const bearing = Math.round(c.bearing * 2) / 2;
    const pitch = Math.round(c.pitch);
    setCamera((prev) => (prev.bearing === bearing && prev.pitch === pitch ? prev : { bearing, pitch }));
  }, []);
  const handleMapReady = useCallback((c: MapController) => {
    mapController.current = c;
  }, []);
  const clearToast = useCallback(() => setToast(null), []);
  const closeVideo = useCallback(() => setVideoFile(null), []);
  /** Graba el día del mapa tal como se ve (luz, sombras, trayectoria) y ofrece compartirlo. */
  const recordDay = useCallback(async () => {
    const c = mapController.current;
    if (!c) return;
    dayAnim.stop();
    setVideoFile(null);
    setVideoProgress(0);
    try {
      const blob = await c.recordDayVideo({
        getRange: () => rangeRef.current,
        scrub,
        label: (t) => `${formatClock(t)} · Barcelona`,
        onProgress: (p) => setVideoProgress(p),
      });
      const day = zoneDayKey(rangeRef.current.start);
      setVideoFile(new File([blob], `i-follow-the-sun-${day}.${videoFileExtension(blob.type)}`, { type: blob.type }));
    } catch {
      setToast(tr("dayVideo.no_se_pudo"));
    } finally {
      setVideoProgress(null);
    }
  }, [dayAnim, scrub]);
  const handleLoaded = useCallback(() => setLoaded(true), []);

  /* ------------------------------ geometría: hoja, panel y relleno de la cámara ------------------------------ */
  const navH = LAYOUT.mobileNav + vp.safeBottom;
  const topReserve = vp.safeTop + 64;
  const heights = useMemo(() => sheetHeights(vp.height, navH, topReserve), [vp.height, navH, topReserve]);
  const panelW = device === "tablet" ? 360 : 400;
  const mapLeft = isMobile ? 0 : LAYOUT.gap + panelW + LAYOUT.gap;
  const chipsShown = isMobile && view === "explore" && !card && !selection && sheetLevel !== "full";
  const mobileTop = vp.safeTop + 8 + 48 + (chipsShown ? 8 + 44 : 0) + 8;
  const windowMode = isMobile && !!card && sheetLevel === "full" && mediaTab === "3d";
  const windowHeight = isMobile && card && mediaTab === "3d" ? Math.round((Math.min(vp.width, 640) * 9) / 16) : undefined;

  const insetsFor = useCallback(
    (level: SheetLevel, win: WindowRect | null): MapInsets => {
      if (!isMobile) {
        return { top: 72, left: mapLeft, right: LAYOUT.controlsWidth, bottom: (timelineOpen ? LAYOUT.timelineHeight + 8 : 56) + LAYOUT.gap * 2 };
      }
      if (win) return { top: Math.round(win.top), bottom: Math.max(0, Math.round(vp.height - win.bottom)), left: 0, right: 0 };
      return { top: mobileTop, left: 0, right: 56, bottom: navH + heights[level] + (level === "full" ? 0 : 60) };
    },
    [isMobile, mapLeft, timelineOpen, vp.height, mobileTop, navH, heights]
  );

  const applyInsets = useCallback(
    (i: MapInsets, animate = true) => {
      const c = mapController.current;
      if (!c) return;
      // Como `padding`: también se desplaza el punto de fuga del 3D a la parte visible.
      c.setPadding(i, { animate: animate && !reduced });
    },
    [reduced]
  );

  /** Vuelo a un sitio «de cine»: inclinado y de espaldas al sol, para ver de frente la fachada iluminada. */
  const flyNow = useCallback((lng: number, lat: number) => {
    const c = mapController.current;
    if (!c) return;
    c.flyToCinematic(lng, lat, { sunAzimuthDeg: solarService.getPosition(timeRef.current, lat, lng).azimuthDeg });
  }, []);
  /**
   * El vuelo se lanza en un efecto que va DETRÁS del de los márgenes: así sale ya con el padding de
   * la nueva altura de la hoja y no lo corta un cambio de márgenes a medio camino.
   */
  const [pendingFly, setPendingFly] = useState<{ lng: number; lat: number; n: number } | null>(null);
  const flySeq = useRef(0);
  const flyToPlace = useCallback((lng: number, lat: number) => setPendingFly({ lng, lat, n: ++flySeq.current }), []);

  const effectiveWindow = windowMode ? windowRect : null;
  useEffect(() => {
    applyInsets(insetsFor(sheetLevel, effectiveWindow));
  }, [applyInsets, insetsFor, sheetLevel, effectiveWindow, loaded]);
  useEffect(() => {
    if (pendingFly) flyNow(pendingFly.lng, pendingFly.lat);
  }, [pendingFly, flyNow]);

  // Lo elegido (ficha o punto): la cámara lo mantiene en la parte visible.
  const focus: LngLat | null = card
    ? { lng: card.data.result?.spot.longitude ?? card.data.place.longitude, lat: card.data.result?.spot.latitude ?? card.data.place.latitude }
    : selection;
  const focusRef = useRef(focus);
  focusRef.current = focus;
  // Al cambiar la altura de la hoja no hace falta volver a centrar: el `padding` animado de
  // `applyInsets` recoloca el mapa y lo elegido sigue en la parte visible.
  useEffect(() => {
    if (!effectiveWindow) return;
    const f = focusRef.current;
    if (f) flyToPlace(f.lng, f.lat);
  }, [effectiveWindow, flyToPlace]);

  /* ------------------------------ tiempo al abrir una ficha ------------------------------ */
  /** Al abrir una ficha se muestra su mejor momento; al cerrarla se vuelve exactamente a donde estaba. */
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

  /* ------------------------------ ficha y punto ------------------------------ */
  const clearDetail = useCallback(() => {
    cardSeq.current++;
    setCard(null);
    setSelection(null);
    setPointTimeline(null);
    setPointSunlight(null);
    setWindowRect(null);
  }, []);
  const closeDetail = useCallback(() => {
    clearDetail();
    restoreTime();
  }, [clearDetail, restoreTime]);

  /** La hoja sube a media para enseñar la ficha (el sitio queda en el mapa, encima). */
  const sheetForDetail = useCallback(() => {
    if (!isMobile) return;
    if (sheetLevelRef.current !== "half") setSheetLevel("half");
    applyInsets(insetsFor("half", null), false);
  }, [isMobile, setSheetLevel, applyInsets, insetsFor]);

  const handleSelect = useCallback(
    (p: SelectedPoint) => {
      cardSeq.current++;
      setLayersOpen(false);
      setCard(null);
      setPointTimeline(null);
      setPointSunlight(null);
      setSelection(p);
      if (isMobile && sheetLevelRef.current === "peek") setSheetLevel("half");
    },
    [isMobile, setSheetLevel]
  );

  const selectPoint = useCallback(
    (lat: number, lng: number, name: string) => {
      handleSelect({ id: ++selCounter.current, lng, lat, name });
      sheetForDetail();
      mapController.current?.flyToPoint(lng, lat, 16.5);
    },
    [handleSelect, sheetForDetail]
  );

  const openResult = useCallback(
    (r: SunSearchResult, request: NormalizedSunRequest, peers: SunSearchResult[]) => {
      cardSeq.current++;
      setLayersOpen(false);
      setPointTimeline(null);
      setPointSunlight(null);
      setHoverId(null);
      setFiltersOpen(false);
      setCard({ data: { place: r.place, result: r, request, status: "ready" }, peers });
      setSelection({ id: ++selCounter.current, lng: r.spot.longitude, lat: r.spot.latitude, name: r.place.name });
      setMediaTab("3d");
      setWindowRect(null);
      sheetForDetail();
      flyToPlace(r.spot.longitude, r.spot.latitude);
      previewTime((r.bestWindow ?? r.searchWindow).start);
      recordVisit(r.place);
      learnTaste(r.place.type, 1);
    },
    [sheetForDetail, flyToPlace, previewTime]
  );

  /** Ficha de un lugar sin analizar todavía (buscador, Mis sitios, historial, enlaces). */
  const openPlace = useCallback(
    async (place: SunPlace): Promise<boolean> => {
      const seq = ++cardSeq.current;
      setLayersOpen(false);
      setPointTimeline(null);
      setPointSunlight(null);
      setFiltersOpen(false);
      setCard({ data: { place, result: null, request: null, status: "loading" }, peers: [] });
      setSelection({ id: ++selCounter.current, lng: place.longitude, lat: place.latitude, name: place.name });
      setMediaTab("3d");
      setWindowRect(null);
      sheetForDetail();
      flyToPlace(place.longitude, place.latitude);
      recordVisit(place);
      learnTaste(place.type, 1);
      try {
        const s = await getPlaceSunSummaryCached(place);
        if (seq !== cardSeq.current) return true;
        const r = s.result;
        if (r && s.request) {
          setCard({ data: { place: r.place, result: r, request: s.request, status: "ready" }, peers: [r] });
          setSelection((sel) => (sel ? { ...sel, lng: r.spot.longitude, lat: r.spot.latitude } : sel));
          previewTime((r.bestWindow ?? r.searchWindow).start);
        } else {
          setCard((c) => (c ? { ...c, data: { ...c.data, status: "error" } } : c));
        }
      } catch {
        if (seq === cardSeq.current) setCard((c) => (c ? { ...c, data: { ...c.data, status: "error" } } : c));
      }
      return true;
    },
    [sheetForDetail, flyToPlace, previewTime]
  );

  const openSaved = useCallback(
    (p: SavedPlace, summary: PlaceSunSummary | null) => {
      if (summary?.result && summary.request) openResult(summary.result, summary.request, [summary.result]);
      else void openPlace(savedToPlace(p));
    },
    [openResult, openPlace]
  );

  // La ficha recién abierta recibe el foco (lectores de pantalla).
  const cardId = card?.data.place.id ?? null;
  useEffect(() => {
    if (cardId) titleRef.current?.focus({ preventScroll: true });
  }, [cardId]);

  /* ------------------------------ navegación ------------------------------ */
  const go = useCallback(
    (v: AppView, t?: ViewTab | null) => {
      setLayersOpen(false);
      clearDetail();
      restoreTime();
      if (v !== "explore") setFiltersOpen(false);
      if (isMobile && v !== "explore" && sheetLevelRef.current === "peek") setSheetLevel("half");
      navigate(v, t);
    },
    [clearDetail, restoreTime, isMobile, setSheetLevel, navigate]
  );

  /* ------------------------------ ubicación ------------------------------ */
  const requestUserLocation = useCallback(async (): Promise<LngLat | null> => {
    try {
      const pos = await locateUser();
      const m = 0.03;
      const inside =
        pos.lng > CITY_BOUNDS.west - m && pos.lng < CITY_BOUNDS.east + m && pos.lat > CITY_BOUNDS.south - m && pos.lat < CITY_BOUNDS.north + m;
      if (!inside) {
        setToast(tr("app.estas_fuera_de_barcelona_se"));
        return null;
      }
      setUserLocation(pos);
      return pos;
    } catch {
      setToast(tr("app.no_se_pudo_obtener_tu"));
      return null;
    }
  }, []);
  const locateMe = useCallback(async () => {
    setLocating(true);
    await requestUserLocation();
    setLocating(false);
  }, [requestUserLocation]);

  /* ------------------------------ Explorar: buscador, chips y colecciones ------------------------------ */
  const applySpec = useCallback(
    (s: ExploreSpec) => {
      clearDetail();
      restoreTime();
      setSpec(s);
      setHoverId(null);
      if (view !== "explore") navigate("explore");
      if (isMobile && sheetLevelRef.current === "peek") setSheetLevel("half");
    },
    [clearDetail, restoreTime, view, navigate, isMobile, setSheetLevel]
  );

  const pickSuggestion = useCallback(
    (s: SearchSuggestion) => {
      if (s.kind === "place") {
        setQuery("");
        if (view !== "explore") navigate("explore");
        void openPlace(s.place);
      } else if (s.kind === "area") {
        setQuery(s.area.name);
        applySpec(homeSpec(s.area));
        mapController.current?.flyToPoint(s.area.lng, s.area.lat, 14.8);
      } else {
        applySpec(s.spec);
        if (s.spec.area) mapController.current?.flyToPoint(s.spec.area.lng, s.spec.area.lat, 14.6);
      }
    },
    [view, navigate, openPlace, applySpec]
  );

  const submitQuery = useCallback(
    (text: string) => {
      const { spec: s, place } = universal.interpret(text);
      if (place) {
        setQuery("");
        if (view !== "explore") navigate("explore");
        void openPlace(place);
        return;
      }
      if (s) {
        applySpec(s);
        if (s.area) mapController.current?.flyToPoint(s.area.lng, s.area.lat, 14.6);
        return;
      }
      const best = searchPlaces(buildNameIndex(placeService.getPlaces() ?? []), text, 1)[0];
      if (best) {
        setQuery("");
        if (view !== "explore") navigate("explore");
        void openPlace(best.place);
      } else setToast(tr("search.no_lo_hemos_entendido"));
    },
    [universal, view, navigate, openPlace, applySpec]
  );

  const clearSearch = useCallback(() => {
    setQuery("");
    if (spec.source !== "home" || spec.area) applySpec(homeSpec());
  }, [spec, applySpec]);

  const onChip = useCallback(
    (c: ChipId | null) => {
      setQuery("");
      applySpec(c ? chipSpec(c, spec.area) : homeSpec(spec.area));
    },
    [applySpec, spec.area]
  );

  /* ------------------------------ guardar, compartir, al plan ------------------------------ */
  const savedIds = useMemo(() => new Set(saved.map((p) => p.id)), [saved]);
  const planIds = useMemo(() => new Set(groupDraft.options.map((o) => o.id)), [groupDraft]);
  const toggleSavePlace = useCallback(
    (place: Pick<SunPlace, "id" | "name" | "type" | "latitude" | "longitude">) => {
      const nowSaved = toggle(place);
      if (nowSaved) learnTaste(place.type, 3);
      else forgetPlace(place.id);
      setToast(nowSaved ? tr("app.guardado_en_tus_sitios_soleados") : tr("app.quitado_de_guardados"));
    },
    [toggle]
  );
  const shareResult = useCallback(async (r: SunSearchResult) => {
    if ((await shareOrCopy(createShareablePlan(r))) === "copied") setToast(tr("app.copiado_al_portapapeles"));
  }, []);
  const toggleInPlan = useCallback((c: CardData) => {
    const p = c.place;
    const draft = groupDraftStore.get();
    if (draft.options.some((o) => o.id === p.id)) {
      removeFromGroupDraft(p.id);
      setToast(tr("group.quitado_del_plan"));
      return;
    }
    if (draft.options.length >= GROUP_MAX) {
      setToast(tr("group.plan_lleno", { p0: GROUP_MAX }));
      return;
    }
    addToGroupDraft({ id: p.id, name: p.name, type: p.type, lat: c.result?.spot.latitude ?? p.latitude, lng: c.result?.spot.longitude ?? p.longitude, time: null });
    setToast(tr("group.anadido_al_plan", { p0: draft.options.length + 1, p1: GROUP_MAX }));
  }, []);
  const setHome = useCallback((p: { lat: number; lng: number; name: string }) => {
    homeStore.set({ ...p, savedAt: Date.now() });
    setToast(tr("home.guardada"));
  }, []);

  const pointSaved = useMemo(
    () => (selection ? (saved.find((p) => distanceMeters(p.longitude, p.latitude, selection.lng, selection.lat) < 5) ?? null) : null),
    [selection, saved]
  );
  const toggleSavePoint = useCallback(() => {
    if (!selection) return;
    const target =
      pointSaved ?? createCoordinatePlace(selection.lat, selection.lng, selection.name === tr("app.tu_ubicacion") ? tr("app.mi_ubicacion") : selection.name);
    setToast(toggle(target) ? tr("app.punto_guardado") : tr("app.quitado_de_guardados"));
  }, [selection, pointSaved, toggle]);

  /* ------------------------------ Planes: Más tarde ------------------------------ */
  const runPlan = useCallback(
    (p?: PlannerState) => {
      const plan = p ?? planPlanner;
      setPlanPlanner(plan);
      void planSearch.run(buildSearchRequest(plan, { now: Date.now(), origin: userLocation }));
    },
    [planPlanner, planSearch, userLocation]
  );

  const weekCandidates = useMemo<WeekCandidate[]>(() => {
    const out: WeekCandidate[] = [];
    const add = (key: string, label: string, place: SunPlace) => {
      if (!out.some((x) => x.key === key)) out.push({ key, label, place });
    };
    if (weekFocus) add(weekFocus.id, weekFocus.name, weekFocus);
    if (home) {
      const p = homeToPlace(home);
      add(p.id, tr("home.mi_casa"), p);
    }
    for (const s of saved.slice(0, 8)) add(s.id, s.name, savedToPlace(s));
    return out;
  }, [weekFocus, home, saved]);

  const closeShared = useCallback(() => {
    setSharedCode(null);
    try {
      const q = new URLSearchParams(window.location.search);
      q.delete("g");
      const s = q.toString();
      window.history.replaceState(window.history.state, "", urlWith({ view: "plans", tab: "group" }, s ? `?${s}` : ""));
    } catch {
      /* sin History API */
    }
  }, []);

  /* ------------------------------ pines del mapa (sincronizados con las listas) ------------------------------ */
  const activePin = hoverId ?? card?.data.place.id ?? null;
  const highlights = useMemo<Highlight[]>(() => {
    const pin = (id: string, lng: number, lat: number, name: string, i: number, firstPrimary: boolean): Highlight => {
      const primary = activePin ? id === activePin : firstPrimary && i === 0;
      return { id, lng, lat, name, rank: i + 1, score: primary ? 0.9 : 0.3, primary };
    };
    if (view === "explore") return explore.results.map((r, i) => pin(r.placeId, r.spot.longitude, r.spot.latitude, r.place.name, i, true));
    if (view === "plans") {
      if (plansTab === "route" && route) return route.stops.map((s, i) => pin(s.result.placeId, s.result.spot.longitude, s.result.spot.latitude, s.result.place.name, i, false));
      if (plansTab === "later") return shownResults(planSearch.state.outcome).map((r, i) => pin(r.placeId, r.spot.longitude, r.spot.latitude, r.place.name, i, true));
      if (plansTab === "group") return (sharedPlan ?? groupDraft).options.map((o, i) => pin(o.id, o.lng, o.lat, o.name, i, false));
      if (plansTab === "week" && weekCandidates[0]) {
        const p = weekCandidates[0].place;
        return [pin(p.id, p.longitude, p.latitude, p.name, 0, true)];
      }
      return EMPTY_HIGHLIGHTS;
    }
    if (view === "mine") {
      if (mineTab === "lists") return saved.map((p, i) => pin(p.id, p.longitude, p.latitude, p.name, i, false));
      if (mineTab === "home" && home) return [pin("home", home.lng, home.lat, home.name, 0, true)];
      if (mineTab === "history") return history.slice(0, 12).map((e, i) => pin(e.id, e.longitude, e.latitude, e.name, i, false));
    }
    return EMPTY_HIGHLIGHTS;
  }, [view, plansTab, mineTab, explore.results, route, planSearch.state.outcome, sharedPlan, groupDraft, weekCandidates, saved, home, history, activePin]);

  const handlePickSpot = useCallback(
    (id: string) => {
      if (view === "explore") {
        const r = explore.results.find((x) => x.placeId === id);
        if (r && explore.outcome) openResult(r, explore.outcome.request, explore.results);
        return;
      }
      if (view === "plans") {
        if (plansTab === "route" && route) {
          const s = route.stops.find((x) => x.result.placeId === id);
          if (s) openResult(s.result, route.request, route.stops.map((x) => x.result));
          return;
        }
        if (plansTab === "later") {
          const o = planSearch.state.outcome;
          const shown = shownResults(o);
          const r = shown.find((x) => x.placeId === id);
          if (r && o) openResult(r, o.request, shown);
          return;
        }
        if (plansTab === "group") {
          const o = (sharedPlan ?? groupDraft).options.find((x) => x.id === id);
          if (o) void openPlace(optionToPlace(o));
          return;
        }
        const w = weekCandidates.find((x) => x.place.id === id);
        if (w) void openPlace(w.place);
        return;
      }
      if (view === "mine") {
        if (id === "home" && home) {
          selectPoint(home.lat, home.lng, home.name);
          return;
        }
        const s = saved.find((p) => p.id === id);
        if (s) {
          openSaved(s, null);
          return;
        }
        const h = history.find((e) => e.id === id);
        if (h) void openPlace(historyToPlace(h));
      }
    },
    [view, plansTab, explore.results, explore.outcome, route, planSearch.state.outcome, sharedPlan, groupDraft, weekCandidates, home, saved, history, openResult, openPlace, openSaved, selectPoint]
  );

  // Cada conjunto de resultados nuevo se encuadra una vez, con un movimiento suave.
  const fitted = useRef(new WeakSet<object>());
  useEffect(() => {
    if (card || selection) return;
    let key: object | null = null;
    let points: LngLat[] = [];
    if (view === "explore" && explore.outcome && explore.results.length) {
      key = explore.outcome;
      points = explore.results.map((r) => ({ lng: r.spot.longitude, lat: r.spot.latitude }));
    } else if (view === "plans" && plansTab === "route" && route) {
      key = route;
      points = route.stops.map((s) => ({ lng: s.result.spot.longitude, lat: s.result.spot.latitude }));
    } else if (view === "plans" && plansTab === "later" && planSearch.state.outcome) {
      key = planSearch.state.outcome;
      points = shownResults(planSearch.state.outcome).map((r) => ({ lng: r.spot.longitude, lat: r.spot.latitude }));
    }
    if (!key || points.length === 0 || fitted.current.has(key)) return;
    fitted.current.add(key);
    mapController.current?.fitPoints(points);
  }, [view, plansTab, card, selection, explore.outcome, explore.results, route, planSearch.state.outcome]);
  useEffect(() => {
    if (view === "mine" && mineTab === "lists" && saved.length > 0) mapController.current?.fitPoints(saved.map((p) => ({ lng: p.longitude, lat: p.latitude })));
    if (view === "plans" && plansTab === "group") {
      const opts = (sharedPlan ?? groupDraftStore.get()).options;
      if (opts.length) mapController.current?.fitPoints(opts.map((o) => ({ lng: o.lng, lat: o.lat })));
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [view, mineTab, plansTab]);

  // Una búsqueda con hora («a las 18», «mañana», «al atardecer») lleva el mapa a esa hora: las
  // sombras que se ven son las de la búsqueda. Con «ahora» el mapa sigue en la hora elegida.
  const timedSearch = useRef<string | null>(null);
  useEffect(() => {
    if (spec.when.kind === "now" || card) {
      if (spec.when.kind === "now") timedSearch.current = null;
      return;
    }
    const key = `${spec.key}@${explore.window.start}`;
    if (timedSearch.current === key) return;
    timedSearch.current = key;
    showTimeAt(explore.window.start);
  }, [spec.key, spec.when.kind, explore.window.start, card, showTimeAt]);

  /* ------------------------------ enlaces profundos ------------------------------ */
  const openPlaceLink = useCallback(
    async (ref: PlaceLinkRef) => {
      const place = await resolvePlaceRef(ref);
      if (!place) return false;
      return openPlace(place);
    },
    [openPlace]
  );
  useDeepLink({
    ready: loaded,
    view,
    tab: view === "plans" || view === "mine" ? tab : null,
    chosenTime: clock.mode === "ahead" ? selectedTime : null,
    place: card?.data.place ?? null,
    showTimeAt,
    flyTo: (lng, lat, zoom) => mapController.current?.flyToPoint(lng, lat, zoom ?? 16),
    openPlace: openPlaceLink,
    onToast: setToast,
  });

  /* ------------------------------ teclado ------------------------------ */
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== "Escape" || e.defaultPrevented) return;
      const el = document.activeElement;
      if (el instanceof HTMLInputElement || el instanceof HTMLSelectElement || el instanceof HTMLTextAreaElement) return;
      if (layersOpen) setLayersOpen(false);
      else if (timelineOpen) setTimelineOpen(false);
      else if (card || selection) closeDetail();
      else if (filtersOpen) setFiltersOpen(false);
      else if (view === "settings" || view === "about") go("explore");
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [layersOpen, timelineOpen, card, selection, filtersOpen, view, closeDetail, go]);

  /* ------------------------------ frases-respuesta ------------------------------ */
  const nextSunrise = useMemo(
    () => solarService.getSunTimes(dayStartFor(Date.now(), dayOffset + 1), BARCELONA.lat, BARCELONA.lng).sunrise,
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [dayKey, dayOffset]
  );
  const todaySunset = useMemo(
    () => solarService.getSunTimes(dayStartFor(Date.now(), 0), BARCELONA.lat, BARCELONA.lng).sunset,
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [dayKey]
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
  const pointAnswer = useMemo(
    () =>
      selection && !card && pointTimeline
        ? describePoint({
            time: selectedTime,
            intervals: pointTimeline.intervals,
            sunrise: sunTimes.sunrise,
            sunset: sunTimes.sunset,
            nextSunrise,
            weatherAvailable: pointTimeline.weatherAvailable,
            mode: sunShade.mode,
            apparentC: isNow ? sunShade.apparentC : null,
          })
        : null,
    [selection, card, pointTimeline, selectedTime, sunTimes, nextSunrise, sunShade.mode, isNow, sunShade.apparentC]
  );
  const dayLabel = dayChoiceLabel(dayStart, now);
  const answerTimeLabel = isNow ? tr("app.ahora", { p0: formatClock(selectedTime) }) : `${dayLabel} · ${formatClock(selectedTime)}`;

  /* ------------------------------ contenido: Explorar ------------------------------ */
  const windowLabel = `${dayChoiceLabel(startOfZoneDay(explore.window.start), now)} ${formatClock(explore.window.start)}–${formatClock(explore.window.end)}`;
  const kidsSearch = !!spec.types?.includes("playground");
  // eslint-disable-next-line react-hooks/exhaustive-deps
  const inventoryPlaces = useMemo(() => placeService.getPlaces() ?? [], [inventory.total]);
  const extraFor = useCallback(
    (r: SunSearchResult) => {
      if (!kidsSearch) return null;
      const wc = nearestOfType(inventoryPlaces, "toilet", r.spot.latitude, r.spot.longitude, 350);
      return wc ? tr("forYou.lavabo_a", { p0: Math.max(10, Math.round(wc.meters / 10) * 10) }) : null;
    },
    [kidsSearch, inventoryPlaces]
  );
  const shelter = useMemo(
    () => (explore.mode === "shade" ? nearestOfType(inventoryPlaces, "climate_shelter", explore.origin.lat, explore.origin.lng, 3000) : null),
    [explore.mode, explore.origin, inventoryPlaces]
  );

  const filtersNode = filtersOpen ? (
    <FiltersPanel
      filters={filters}
      onChange={setFilters}
      venues={spec.venues}
      hasOrigin={!!userLocation}
      originLabel={spec.area ? tr("filters.desde", { p0: spec.area.name }) : userLocation ? tr("filters.desde_tu_ubicacion") : tr("filters.desde_el_centro")}
      onUseLocation={() => void locateMe()}
      timeIsNow={isNow}
    />
  ) : null;

  const exploreBody = (
    <>
      <ForYou
        title={specTitle(spec, sunShade.mode, now)}
        subtitle={explore.window.movedToTomorrow ? `${windowLabel} · ${tr("forYou.hoy_ya_no_queda_sol")}` : windowLabel}
        results={explore.results}
        loading={explore.loading}
        refreshing={explore.refreshing}
        emptyText={exploreEmptyText(explore)}
        mode={explore.mode}
        now={now}
        sunset={todaySunset}
        showWalk={explore.originIsReal}
        activeId={activePin}
        onPick={(r) => explore.outcome && openResult(r, explore.outcome.request, explore.results)}
        onHover={isMobile ? undefined : setHoverId}
        onBackToForYou={
          spec.source !== "home"
            ? () => {
                setQuery("");
                applySpec(homeSpec(spec.area));
              }
            : undefined
        }
        hasLocation={!!userLocation}
        locating={locating}
        onUseLocation={() => void locateMe()}
        filters={filtersNode}
        extraFor={extraFor}
        failed={explore.state.failed}
        onRetry={explore.retry}
        footer={
          shelter ? (
            <button
              type="button"
              onClick={() => void openPlace(shelter.place)}
              className="flex min-h-[56px] w-full items-center gap-3 rounded-[18px] bg-shade/[0.08] px-3.5 py-2.5 text-left outline-none hover:bg-shade/[0.12] focus-visible:ring-2 focus-visible:ring-sun/60"
            >
              <SunGlyph state="shade" size={22} className="shrink-0" />
              <span className="min-w-0 text-[13.5px] leading-snug text-ink">
                {tr("forYou.refugio_mas_cercano", { p0: shelter.place.name, p1: Math.max(1, Math.round(minutesForStraightMeters(shelter.meters))) })}
              </span>
            </button>
          ) : null
        }
      />
      {(spec.source === "home" || spec.source === "collection") && (
        <Collections items={collections} activeId={spec.collection} onPick={(c) => applySpec(collectionSpec(c, spec.area))} />
      )}
      {spec.source === "collection" && <AffiliateSlot place={null} context="collection" />}
      <div className="mt-6 flex flex-wrap gap-x-5 gap-y-1 border-t border-line pt-3">
        <button type="button" onClick={() => go("plans", "route")} className="min-h-[44px] text-[14px] font-semibold text-ink underline-offset-4 hover:underline">
          {tr("forYou.ruta_del_sol")} →
        </button>
        <button type="button" onClick={() => go("plans", "later")} className="min-h-[44px] text-[14px] font-semibold text-ink-soft underline-offset-4 hover:text-ink hover:underline">
          {tr("forYou.busqueda_avanzada")}
        </button>
      </div>
    </>
  );

  /* ------------------------------ contenido: Planes ------------------------------ */
  const plansBody = (
    <Suspense fallback={<PanelFallback />}>
      {plansTab === "route" && (
        <SunRoutePanel
          now={now}
          appMode={sunShade.mode}
          origin={userLocation}
          hasLocation={!!userLocation}
          onUseLocation={() => void locateMe()}
          route={route}
          onRoute={setRoute}
          onPickStop={(r) => route && openResult(r, route.request, route.stops.map((s) => s.result))}
          activeId={activePin}
        />
      )}
      {plansTab === "week" && <WeekPanel now={now} candidates={weekCandidates} onPickPlace={() => go("explore")} />}
      {plansTab === "later" && (
        <PanelChrome.Provider value={{ embedded: true }}>
          <SunPlanner
            search={planSearch}
            planner={planPlanner}
            onChange={(patch) => setPlanPlanner((p) => ({ ...p, ...patch }))}
            onSearch={runPlan}
            now={now}
            origin={userLocation}
            inventory={inventory}
            activeId={activePin}
            isSaved={(id) => savedIds.has(id)}
            onPick={(r) => {
              const o = planSearch.state.outcome;
              if (o) openResult(r, o.request, shownResults(o));
            }}
            onToggleSave={(r) => toggleSavePlace(r.place)}
            onShare={(r) => void shareResult(r)}
            onRequestLocation={requestUserLocation}
            onClose={() => go("explore")}
          />
        </PanelChrome.Provider>
      )}
      {plansTab === "group" && (
        <GroupPlanPanel
          now={now}
          draft={groupDraft}
          sharedCode={sharedCode}
          selectedTime={selectedTime}
          isNow={isNow}
          onOpen={(o) => {
            if (o.time) showTimeAt(o.time);
            void openPlace(optionToPlace(o));
          }}
          onRemove={removeFromGroupDraft}
          onTitle={setGroupDraftTitle}
          onSetTimes={(t) => groupDraftStore.set((p) => ({ ...p, options: p.options.map((o) => ({ ...o, time: t })) }))}
          onAdoptShared={(plan) => {
            groupDraftStore.set({ title: plan.title, options: plan.options });
            closeShared();
          }}
          onCloseShared={closeShared}
          onToast={setToast}
        />
      )}
      {plansTab === "alerts" && <AlertsPanel now={now} savedCount={saved.length} onOpenSaved={() => go("mine", "lists")} />}
    </Suspense>
  );

  /* ------------------------------ contenido: Mis sitios ------------------------------ */
  const mineBody = (
    <Suspense fallback={<PanelFallback />}>
      {mineTab === "lists" && (
        <ListsPanel
          saved={saved}
          lists={lists}
          activeId={activePin}
          onOpen={openSaved}
          onRemove={(p) => {
            toggle(p);
            forgetPlace(p.id);
            setToast(tr("app.quitado_de_guardados"));
          }}
        />
      )}
      {mineTab === "home" && (
        <HomePanel
          home={home}
          selection={selection}
          userLocation={userLocation}
          onSet={setHome}
          onClear={() => homeStore.set(null)}
          onShow={(h) => selectPoint(h.lat, h.lng, h.name)}
          onRequestLocation={requestUserLocation}
        />
      )}
      {mineTab === "history" && (
        <HistoryPanel
          entries={history}
          now={now}
          tasteCount={taste.total}
          onOpen={(e) => void openPlace(historyToPlace(e))}
          onClearHistory={() => {
            historyStore.reset();
            setToast(tr("history.historial_borrado"));
          }}
          onClearTaste={() => {
            tasteStore.reset();
            setToast(tr("history.gustos_borrados"));
          }}
        />
      )}
    </Suspense>
  );

  const settingsBody = (
    <Suspense fallback={<PanelFallback />}>
      <PanelChrome.Provider value={{ embedded: true }}>
        {view === "settings" ? (
          <SettingsPanel prefs={prefs} onChange={setPrefs} light={light} onRequestLocation={() => void requestUserLocation()} onClose={() => go("explore")} />
        ) : (
          <AboutPanel onClose={() => go("explore")} />
        )}
      </PanelChrome.Provider>
    </Suspense>
  );

  /* ------------------------------ contenido: ficha y punto ------------------------------ */
  const cardMode: SunShadeMode = card?.data.request?.intent === "shade" ? "shade" : "sun";
  const cardSubject = card
    ? {
        id: card.data.place.id,
        name: card.data.place.name,
        type: card.data.place.type,
        latitude: card.data.result?.spot.latitude ?? card.data.place.latitude,
        longitude: card.data.result?.spot.longitude ?? card.data.place.longitude,
        category: typeof card.data.place.metadata?.category === "string" ? card.data.place.metadata.category : undefined,
      }
    : null;
  const on3D = useCallback(() => {
    const f = focusRef.current;
    if (!f) return;
    setMediaTab("3d");
    if (isMobile && sheetLevelRef.current !== "full") {
      setSheetLevel("peek");
      applyInsets(insetsFor("peek", null), false);
    }
    flyToPlace(f.lng, f.lat);
  }, [isMobile, setSheetLevel, applyInsets, insetsFor, flyToPlace]);

  const cardMedia = cardSubject ? (
    <PlaceMedia subject={cardSubject} tab={mediaTab} onTab={setMediaTab} variant={windowMode ? "tabs" : "inline"} device={isMobile ? "mobile" : "desktop"} on3D={on3D} />
  ) : null;
  const cardHeader = card ? <PlaceCardHeader data={card.data} mode={cardMode} now={now} onClose={closeDetail} titleRef={titleRef} /> : null;
  const cardBody = card ? (
    <PlaceCardBody
      data={card.data}
      mode={cardMode}
      now={now}
      media={windowMode ? undefined : cardMedia}
      saved={savedIds.has(card.data.place.id)}
      onToggleSave={() => toggleSavePlace(card.data.place)}
      onShare={() => card.data.result && void shareResult(card.data.result)}
      inPlan={planIds.has(card.data.place.id)}
      onAddToPlan={() => toggleInPlan(card.data)}
      onAlerts={() => {
        // «Avisarme»: el próximo rato de sol (o de sombra) del sitio, al calendario con alarma.
        const r = card.data.result;
        const w = r ? (r.bestWindow ?? r.searchWindow) : null;
        if (!r || !w || w.end <= now) {
          go("plans", "alerts");
          return;
        }
        const a = addAlert({
          placeId: card.data.place.id,
          name: card.data.place.name,
          slug: placeSlug(card.data.place),
          kind: sunShade.mode === "shade" ? "shade" : "sun",
          start: Math.max(w.start, now),
          end: w.end,
          latitude: r.spot.latitude,
          longitude: r.spot.longitude,
        });
        downloadAlert(a);
        setToast(tr("alerts.aviso_creado", { p0: formatClock(a.start) }));
      }}
      onTerraceFeedback={(hasTerrace) => setToast(hasTerrace ? tr("app.gracias_esta_terraza_queda_confirmada") : tr("app.gracias_lo_tendremos_en_cuenta"))}
      onRetry={() => void openPlace(card.data.place)}
    />
  ) : null;

  const pointHeader =
    selection && !card ? (
      <div>
        <div className="flex items-start gap-1">
          <div className="min-w-0 flex-1 pl-0.5">
            <p className="fts-caps truncate !text-[11.5px]">
              {dayLabel} · {formatDayLabel(selectedTime)}
            </p>
            <h2 className="mt-1 truncate font-serif text-[24px] leading-[1.08] text-ink">{selection.name}</h2>
          </div>
          <button
            type="button"
            onClick={closeDetail}
            aria-label={tr("sunDetails.cerrar")}
            className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full text-ink-soft outline-none transition-colors hover:bg-ink/5 hover:text-ink focus-visible:ring-2 focus-visible:ring-sun/60"
          >
            <CloseIcon />
          </button>
        </div>
        <div className="mt-1.5 flex min-h-[24px] items-center gap-2" aria-live="polite">
          {pointAnswer ? (
            <>
              <SunGlyph state={pointAnswer.state} size={22} className="shrink-0" />
              <p className="min-w-0 truncate text-[14.5px] font-semibold text-ink">{pointAnswer.headline}</p>
            </>
          ) : (
            <p className="text-[14px] text-ink-soft">{tr("answer.calculando_donde_da_el_sol")}</p>
          )}
        </div>
      </div>
    ) : null;
  const pointBody =
    selection && !card ? (
      <PointPanel
        key={selection.id}
        embedded
        headerless={isMobile}
        point={selection}
        timeline={pointTimeline}
        sunlight={pointSunlight}
        now={now}
        time={selectedTime}
        onClose={closeDetail}
        saved={!!pointSaved}
        onToggleSave={toggleSavePoint}
        mode={sunShade.mode}
        apparentC={sunShade.apparentC}
        onSetHome={() => setHome({ lat: selection.lat, lng: selection.lng, name: selection.name })}
        onWeek={() => {
          setWeekFocus(createCoordinatePlace(selection.lat, selection.lng, selection.name));
          go("plans", "week");
        }}
      />
    ) : null;

  /* ------------------------------ qué enseña la hoja (o el panel) ------------------------------ */
  let header: ReactNode;
  let subheader: ReactNode = null;
  let body: ReactNode;
  let label: string;
  let scrollKey: string;
  if (card) {
    header = cardHeader;
    subheader = windowMode ? <div className="px-4">{cardMedia}</div> : null;
    body = cardBody;
    label = tr("placeCard.ficha_de", { p0: card.data.place.name });
    scrollKey = `card:${card.data.place.id}`;
  } else if (selection) {
    header = pointHeader;
    body = pointBody;
    label = selection.name;
    scrollKey = `point:${selection.id}`;
  } else if (view === "plans") {
    header = <ViewHeader title={tr("nav.planes")} subtitle={tr("nav.planes_hint")} />;
    subheader = <PlansTabs tab={plansTab} onTab={(t) => go("plans", t)} groupCount={groupDraft.options.length} />;
    body = plansBody;
    label = tr("nav.planes");
    scrollKey = `plans:${plansTab}`;
  } else if (view === "mine") {
    header = <ViewHeader title={tr("navItems.mis_sitios")} subtitle={tr("nav.mis_sitios_hint")} />;
    subheader = <MineTabs tab={mineTab} onTab={(t) => go("mine", t)} />;
    body = mineBody;
    label = tr("navItems.mis_sitios");
    scrollKey = `mine:${mineTab}`;
  } else if (view === "settings" || view === "about") {
    header = <ViewHeader title={view === "settings" ? tr("navItems.ajustes") : tr("sunDetails.como_lo_sabemos")} onBack={() => go("explore")} />;
    body = settingsBody;
    label = view === "settings" ? tr("navItems.ajustes") : tr("sunDetails.como_lo_sabemos");
    scrollKey = view;
  } else {
    header = <SheetAnswer answer={cityAnswer} timeLabel={answerTimeLabel} />;
    body = exploreBody;
    label = tr("nav.explorar");
    scrollKey = `explore:${spec.key}`;
  }

  /* ------------------------------ capas del mapa y hora ------------------------------ */
  const layerPanel = <LayerControl prefs={prefs} onChange={setPrefs} onClose={() => setLayersOpen(false)} />;
  /** Relieve 3D efectivo: hace falta ver los edificios. */
  const buildings3D = prefs.showBuildings && (prefs.buildings3D || FEATURES.buildings3D);
  /** «El día en movimiento»: con «reducir movimiento» no se ofrece (ni la animación ni el vídeo). */
  const dayPlayer: DayPlayer | null = reduced
    ? null
    : {
        playing: dayAnim.playing,
        progress: dayAnim.progress,
        toggle: dayAnim.toggle,
        record: canVideo ? recordDay : undefined,
        recording: videoProgress,
      };
  const autoHide = useAutoHide(timelineOpen, () => setTimelineOpen(false), 7000, selectedTime);

  const timeline = (
    <TimeSlider
      selectedTime={selectedTime}
      now={now}
      range={range}
      day={timelineDay}
      mode={clock.mode}
      isNight={!up}
      dayOffset={dayOffset}
      onSelectDay={selectDay}
      onHide={() => setTimelineOpen(false)}
      intervals={pointTimeline && selection && !card ? pointTimeline.intervals : null}
      zones={light.zones}
      provenance={PROVENANCE_WORD[light.summary.kind]}
      onScrub={scrub}
      onNow={goNow}
      compact={isMobile}
      dayPlayer={dayPlayer}
    />
  );
  const timePill = (
    <TimePill selectedTime={selectedTime} dayLabel={dayLabel} isNow={isNow} open={timelineOpen} onToggle={() => setTimelineOpen((v) => !v)} onNow={goNow} dayPlayer={dayPlayer} />
  );

  const searchBox = (variant: "floating" | "panel") => (
    <UniversalSearch
      value={query}
      onChange={setQuery}
      suggestions={universal.suggestions}
      onPick={pickSuggestion}
      onSubmit={submitQuery}
      onClear={clearSearch}
      active={spec.source !== "home" || !!spec.area}
      variant={variant}
      profile={<ProfileMenu onNavigate={(v) => go(v)} />}
    />
  );
  const chips = (variant: "floating" | "panel") => (
    <ChipsBar
      active={spec.source === "chip" ? spec.chip : null}
      onChip={onChip}
      filterCount={activeFilterCount(filters)}
      filtersOpen={filtersOpen}
      onFilters={() => {
        setFiltersOpen((v) => !v);
        if (isMobile && sheetLevelRef.current === "peek") setSheetLevel("half");
      }}
      variant={variant}
    />
  );

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
      onRename={(id, name, area) => setSelection((s) => (s && s.id === id && !card ? { ...s, name, area } : s))}
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
      <MapMarkers selection={selection} userLocation={userLocation} highlights={highlights} activeSpotId={activePin} onPickSpot={handlePickSpot} />
    </BarcelonaMap>
  );

  const navBadge = { plans: groupDraft.options.length };
  const mapButton =
    "fts-glass flex h-11 w-11 items-center justify-center rounded-full text-ink outline-none transition-colors focus-visible:ring-2 focus-visible:ring-sun/60";

  return (
    <AppShell map={map}>
      {loaded && !isMobile && (
        <>
          <SidePanel
            label={label}
            width={panelW}
            top={
              <div className="space-y-3 pb-1">
                <div className="flex items-center justify-between gap-2">
                  <button
                    type="button"
                    onClick={() => go("explore")}
                    aria-label={tr("mobileHeader.i_follow_the_sun_volver")}
                    className="flex min-h-[44px] items-center gap-2.5 rounded-full outline-none focus-visible:ring-2 focus-visible:ring-sun/60"
                  >
                    <LogoMark size={28} className="text-ink" />
                    <span className="text-[12.5px] font-semibold tracking-[0.24em] text-ink">
                      <Wordmark />
                    </span>
                  </button>
                </div>
                <DestinationTabs view={view} onNavigate={(v) => go(v)} badge={navBadge} />
                {searchBox("panel")}
                {view === "explore" && !card && !selection && chips("panel")}
              </div>
            }
          >
            <div key={scrollKey}>
              {card ? (
                <>
                  {cardHeader}
                  {cardBody}
                </>
              ) : selection ? (
                pointBody
              ) : (
                <>
                  <div className="mb-3">{header}</div>
                  {subheader && <div className="-mx-4 mb-3">{subheader}</div>}
                  {body}
                </>
              )}
            </div>
          </SidePanel>

          <div className="pointer-events-none absolute z-10" style={{ left: mapLeft, top: LAYOUT.gap }}>
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

          <div className="pointer-events-none absolute bottom-3 z-10 flex justify-center" style={{ left: mapLeft, right: LAYOUT.controlsWidth }}>
            <div className="pointer-events-auto w-full max-w-[760px]" {...autoHide.handlers}>
              {timelineOpen ? timeline : <div className="flex justify-center">{timePill}</div>}
            </div>
          </div>
        </>
      )}

      {loaded && isMobile && (
        <>
          <div className="pointer-events-none fixed inset-x-0 top-0 z-40 px-3" style={{ paddingTop: `calc(env(safe-area-inset-top) + 8px)` }}>
            <div className="fts-fade-top pointer-events-none absolute inset-x-0 top-0 h-24" />
            <div className="relative pointer-events-auto">{searchBox("floating")}</div>
            {chipsShown && <div className="relative mt-2">{chips("floating")}</div>}
          </div>

          {sheetLevel !== "full" && (
            <div
              className={cn("pointer-events-none fixed right-3 z-30 flex flex-col items-end gap-2 transition-opacity duration-300", layersOpen && "z-40")}
              style={{ top: mobileTop }}
            >
              <div className="pointer-events-auto relative">
                <button type="button" data-layers-toggle aria-label={tr("layerControl.capas_del_mapa")} aria-expanded={layersOpen} onClick={() => setLayersOpen((v) => !v)} className={cn(mapButton, layersOpen && "bg-ink text-paper")}>
                  <Layers size={19} strokeWidth={1.5} absoluteStrokeWidth />
                </button>
                {layersOpen && <div className="absolute right-full top-0 mr-2 max-h-[calc(100dvh-14rem)] overflow-y-auto overscroll-contain rounded-2xl">{layerPanel}</div>}
              </div>
              <button type="button" aria-label={tr("app.mi_ubicacion")} onClick={() => mapController.current?.locate()} className={cn(mapButton, "pointer-events-auto")}>
                <LocateFixed size={19} strokeWidth={1.5} absoluteStrokeWidth />
              </button>
              <div className="pointer-events-auto">
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
                  showSunDial={prefs.showSunPath}
                />
              </div>
            </div>
          )}

          <BottomSheet
            label={label}
            level={sheetLevel}
            onLevel={setSheetLevel}
            heights={heights}
            bottom={navH}
            header={header}
            subheader={subheader}
            windowHeight={windowMode ? windowHeight : undefined}
            onWindowRect={setWindowRect}
            scrollKey={scrollKey}
            above={
              sheetLevel !== "full" ? (
                <div className="pointer-events-auto" {...autoHide.handlers}>
                  {timelineOpen ? (
                    timeline
                  ) : (
                    <div className="flex items-end justify-between gap-2">
                      {timePill}
                      {card && sheetLevel === "peek" && (
                        <button
                          type="button"
                          onClick={() => setSheetLevel("half")}
                          className="fts-glass flex h-11 shrink-0 items-center gap-1.5 rounded-full px-3.5 text-[13.5px] font-semibold text-ink outline-none focus-visible:ring-2 focus-visible:ring-sun/60"
                        >
                          {tr("placeCard.volver_a_la_ficha")}
                          <span aria-hidden>▴</span>
                        </button>
                      )}
                    </div>
                  )}
                </div>
              ) : null
            }
          >
            {body}
          </BottomSheet>

          <MobileNavigation view={view} onNavigate={(v) => go(v)} badge={navBadge} />
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
      <VideoReady file={videoFile} onClose={closeVideo} />
      <Splash visible={!loaded} />
    </AppShell>
  );
}
