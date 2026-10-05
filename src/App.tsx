import { Suspense, lazy, useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import Header from "./components/Header";
import InfoPanel from "./components/InfoPanel";
import Sidebar, { SIDEBAR_COLLAPSED, SIDEBAR_EXPANDED } from "./components/Navigation/Sidebar";
import MobileNavigation from "./components/Navigation/MobileNavigation";
import { isSearchView, type AppView } from "./components/Navigation/viewTypes";
import ExploreActions from "./components/Navigation/ExploreActions";
import { PlacesIcon } from "./components/Navigation/NavIcons";
import BarcelonaMap, { type MapController } from "./components/Map/BarcelonaMap";
import BuildingLayer from "./components/Map/BuildingLayer";
import CloudLayer from "./components/Map/CloudLayer";
import MapControls from "./components/Map/MapControls";
import MapMarkers from "./components/Map/MapMarkers";
import ShadowLayer from "./components/Map/ShadowLayer";
import SunIndicator from "./components/Map/SunIndicator";
import TimeSlider from "./components/Map/TimeSlider";
import Splash from "./components/Splash";
import { PROVENANCE_WORD } from "./components/SourceStatusLine";
import Toast from "./components/Toast";
import { BARCELONA, CITY_BOUNDS, DEBUG, FEATURES } from "./config";
import { useLightSource } from "./hooks/useLightSource";
import { useMediaQuery } from "./hooks/useMediaQuery";
import { useNow } from "./hooks/useNow";
import { usePlaceInventory } from "./hooks/usePlaceInventory";
import { useSavedPlaces } from "./hooks/useSavedPlaces";
import { useSunSearch } from "./hooks/useSunSearch";
import { useTimeController } from "./hooks/useTimeController";
import { buildSearchRequest, oneHourOfSun, type PlannerState } from "./lib/planning";
import { locateUser } from "./services/mapService";
import { createShareablePlan, shareOrCopy } from "./services/planShareService";
import { SUN_UP_RAD, solarService } from "./services/solarService";
import { startOfZoneDay, zoneDayKey } from "./services/timeService";
import type {
  CameraState,
  CityStats,
  Highlight,
  LightSourceMode,
  LngLat,
  PointTimeline,
  SavedPlace,
  SelectedPoint,
  SunSearchResult,
  SunlightResult,
  Theme,
} from "./types";
import { cn } from "./utils/cn";

// Funciones secundarias se descargan cuando se abren: mapa primero, herramientas después.
const FindSunSheet = lazy(() => import("./components/FindSun/FindSunSheet"));
const SunDetails = lazy(() => import("./components/FindSun/SunDetails"));
const AboutPanel = lazy(() => import("./components/Sections/AboutPanel"));
const PlacesPanel = lazy(() => import("./components/Sections/PlacesPanel"));
const SavedPanel = lazy(() => import("./components/Sections/SavedPanel"));
const SettingsPanel = lazy(() => import("./components/Sections/SettingsPanel"));
const DebugPanel = lazy(() => import("./components/DebugPanel"));
const PointPanel = lazy(() => import("./components/PointPanel"));
const SolarOverlay = lazy(() => import("./components/Map/SolarOverlay"));

const PANEL_SUSPENSE = (
  <div className="fts-glass w-[min(calc(100vw-1.5rem),370px)] rounded-[24px] p-4" aria-busy="true">
    <div className="fts-shimmer h-5 w-32 rounded-full" />
    <div className="fts-shimmer mt-3 h-10 w-full rounded-2xl" />
  </div>
);

const EMPTY_HIGHLIGHTS: Highlight[] = [];
const EMPTY_RESULTS: SunSearchResult[] = [];

const themeFor = (altDeg: number, prev?: Theme): Theme => {
  if (!prev) return altDeg < -2 ? "night" : "day";
  return prev === "day" ? (altDeg < -3 ? "night" : "day") : altDeg > -1 ? "day" : "night";
};

export default function App() {
  const now = useNow(15_000);
  const isMobile = useMediaQuery("(max-width: 767px)");
  const isTablet = useMediaQuery("(min-width: 768px) and (max-width: 1023px)");

  /* ------------------------------ día y sol ------------------------------ */
  const dayKey = zoneDayKey(now);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  const dayStart = useMemo(() => startOfZoneDay(now), [dayKey]);
  const sunTimes = useMemo(
    () => solarService.getSunTimes(dayStart, BARCELONA.lat, BARCELONA.lng),
    [dayStart]
  );
  const range = useMemo(() => ({ start: sunTimes.sunrise, end: sunTimes.sunset }), [sunTimes]);

  /** Instante visualizado. Por defecto es la hora actual; el selector de tiempo lo desplaza. */
  const clock = useTimeController(now, range);
  const selectedTime = clock.selectedTime;
  const sunPos = useMemo(
    () => solarService.getPosition(selectedTime, BARCELONA.lat, BARCELONA.lng),
    [selectedTime]
  );
  const up = sunPos.altitude >= SUN_UP_RAD;

  /* ------------------------------ tema día / noche ------------------------------ */
  const [theme, setTheme] = useState<Theme>(() =>
    themeFor(solarService.getPosition(Date.now(), BARCELONA.lat, BARCELONA.lng).altitudeDeg)
  );
  useEffect(() => {
    setTheme((prev) => themeFor(sunPos.altitudeDeg, prev));
  }, [sunPos.altitudeDeg]);
  useLayoutEffect(() => {
    document.documentElement.dataset.theme = theme;
    document
      .querySelector('meta[name="theme-color"]')
      ?.setAttribute("content", theme === "night" ? "#0f1428" : "#f6f1e8");
  }, [theme]);

  /* ------------------------------ estado de interfaz ------------------------------ */
  const [loaded, setLoaded] = useState(false);
  const [stats, setStats] = useState<CityStats | null>(null);
  const [showBuildings, setShowBuildings] = useState(true);
  const [showShadows, setShowShadows] = useState(true);
  const [showClouds, setShowClouds] = useState(true);
  const [showSunPath, setShowSunPath] = useState(false);
  const [selection, setSelection] = useState<SelectedPoint | null>(null);
  const [pointTimeline, setPointTimeline] = useState<PointTimeline | null>(null);
  const [pointSunlight, setPointSunlight] = useState<SunlightResult | null>(null);
  const [userLocation, setUserLocation] = useState<LngLat | null>(null);
  const [camera, setCamera] = useState<CameraState>({ bearing: 0, pitch: 0 });
  const [toast, setToast] = useState<string | null>(null);
  const [debugSource, setDebugSource] = useState<LightSourceMode>("fused");
  const [view, setView] = useState<AppView>("explore");
  const [sidebarCollapsed, setSidebarCollapsed] = useState(() => {
    try {
      return window.localStorage.getItem("fts:sidebar-collapsed") === "1";
    } catch {
      return false;
    }
  });

  /* El hook carga los servicios meteorológicos en idle, después del primer render del mapa. */
  const light = useLightSource(selectedTime, loaded);

  const mapController = useRef<MapController | null>(null);
  const selCounter = useRef(1_000_000);
  const compactRail = isTablet || sidebarCollapsed;
  const panelLeft = compactRail ? SIDEBAR_COLLAPSED + 18 : SIDEBAR_EXPANDED + 20;
  const resultLeftPadding = isMobile ? 36 : panelLeft + 405 + 20;

  const handleMapReady = useCallback((c: MapController) => {
    mapController.current = c;
  }, []);
  const handleStats = useCallback((s: CityStats) => setStats(s), []);
  const handleTimeline = useCallback((t: PointTimeline | null) => setPointTimeline(t), []);
  const handlePointSunlight = useCallback((r: SunlightResult | null) => setPointSunlight(r), []);
  const handleLoaded = useCallback(() => setLoaded(true), []);
  const handleToast = useCallback((m: string) => setToast(m), []);
  const clearToast = useCallback(() => setToast(null), []);
  const handleUserLocation = useCallback((p: LngLat) => setUserLocation(p), []);
  const handleCamera = useCallback((c: CameraState) => {
    // Se cuantiza para no re-renderizar en cada fotograma de una rotación.
    const bearing = Math.round(c.bearing * 2) / 2;
    const pitch = Math.round(c.pitch);
    setCamera((prev) => (prev.bearing === bearing && prev.pitch === pitch ? prev : { bearing, pitch }));
  }, []);

  useEffect(() => {
    try {
      window.localStorage.setItem("fts:sidebar-collapsed", sidebarCollapsed ? "1" : "0");
    } catch {
      /* el menú funciona aunque el almacenamiento no esté disponible */
    }
  }, [sidebarCollapsed]);

  /* ------------------------------ navegación + búsqueda ------------------------------ */
  const search = useSunSearch();
  const findOpen = isSearchView(view);
  const inventory = usePlaceInventory(findOpen || view === "places");
  const { saved, isSaved, toggle } = useSavedPlaces();
  const [activeResultId, setActiveResultId] = useState<string | null>(null);
  const scrubbedRef = useRef(false);
  const rangeRef = useRef(range);
  rangeRef.current = range;

  const outcome = search.state.outcome;
  /** Lo que se enseña: los que cumplen la petición o, si no hay ninguno, lo mejor disponible. */
  const displayed = useMemo(
    () => (!outcome ? EMPTY_RESULTS : outcome.results.length > 0 ? outcome.results : outcome.bestAvailable),
    [outcome]
  );
  const activeResult = useMemo(
    () => displayed.find((r) => r.placeId === activeResultId) ?? null,
    [displayed, activeResultId]
  );

  const navigate = useCallback(
    (next: AppView) => {
      if (isSearchView(view) && !isSearchView(next)) search.reset();
      if (!isSearchView(view) && isSearchView(next)) {
        search.reset();
        setActiveResultId(null);
      }
      if (isSearchView(view) && isSearchView(next) && view !== next) {
        search.reset();
        setActiveResultId(null);
      }
      setView(next);
    },
    [view, search.reset]
  );

  const changeSearchMode = useCallback(
    (mode: "find" | "plan") => {
      if (view === mode) return;
      search.reset();
      setActiveResultId(null);
      setView(mode);
    },
    [view, search.reset]
  );

  const runQuickSearch = useCallback(
    (planner: PlannerState) => {
      setSelection(null);
      setPointTimeline(null);
      setPointSunlight(null);
      setActiveResultId(null);
      setView("find");
      void search.run(buildSearchRequest(planner, { now: Date.now(), origin: userLocation }));
    },
    [search.run, userLocation]
  );

  const handleNavigate = useCallback(
    (next: AppView) => {
      if (next === view) return;
      if (isSearchView(view) && !isSearchView(next) && scrubbedRef.current) {
        scrubbedRef.current = false;
        clock.goNow();
      }
      if (next !== "explore") {
        setSelection(null);
        setPointTimeline(null);
        setPointSunlight(null);
      }
      navigate(next);
    },
    [view, navigate, clock.goNow]
  );

  // Nuevos resultados: el mapa los encuadra con un movimiento suave.
  useEffect(() => {
    setActiveResultId(null);
    if (displayed.length === 0) return;
    mapController.current?.fitPoints(
      displayed.map((r) => ({ lng: r.spot.longitude, lat: r.spot.latitude })),
      resultLeftPadding
    );
  }, [displayed, resultLeftPadding]);

  const highlights = useMemo<Highlight[]>(() => {
    if (displayed.length === 0) return EMPTY_HIGHLIGHTS;
    return displayed.map((r) => {
      const primary = activeResultId ? r.placeId === activeResultId : r.rank === 1;
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
  }, [displayed, activeResultId]);

  const requestUserLocation = useCallback(async (): Promise<LngLat | null> => {
    try {
      const pos = await locateUser();
      const m = 0.03;
      const inside =
        pos.lng > CITY_BOUNDS.west - m &&
        pos.lng < CITY_BOUNDS.east + m &&
        pos.lat > CITY_BOUNDS.south - m &&
        pos.lat < CITY_BOUNDS.north + m;
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

  /** Si se previsualizó el mejor momento en la línea de tiempo, al salir se vuelve a «ahora». */
  const restoreTime = useCallback(() => {
    if (scrubbedRef.current) {
      scrubbedRef.current = false;
      clock.goNow();
    }
  }, [clock.goNow]);

  const handleSelect = useCallback((p: SelectedPoint) => {
    setPointTimeline(null);
    setPointSunlight(null);
    setActiveResultId(null);
    setSelection(p);
    setView("explore");
    search.reset();
  }, [search.reset]);

  const closeSelection = useCallback(() => {
    setSelection(null);
    setPointTimeline(null);
    setPointSunlight(null);
  }, []);

  const pickResult = useCallback(
    (r: SunSearchResult) => {
      setActiveResultId(r.placeId);
      setPointTimeline(null);
      setPointSunlight(null);
      setSelection({ id: ++selCounter.current, lng: r.spot.longitude, lat: r.spot.latitude, name: r.place.name });
      mapController.current?.flyToPoint(r.spot.longitude, r.spot.latitude, 16);
      // Se muestra el mapa en el mejor momento de ese lugar (si cae dentro del día de la línea de tiempo).
      const t = (r.bestWindow ?? r.searchWindow).start;
      const rg = rangeRef.current;
      if (t >= rg.start && t <= rg.end) {
        clock.scrub(t);
        scrubbedRef.current = true;
      }
    },
    [clock.scrub]
  );

  const handlePickSpot = useCallback(
    (id: string) => {
      const r = displayed.find((x) => x.placeId === id);
      if (r) pickResult(r);
    },
    [displayed, pickResult]
  );

  const closeDetails = useCallback(() => {
    setActiveResultId(null);
    closeSelection();
    restoreTime();
  }, [closeSelection, restoreTime]);

  const closeFind = useCallback(() => {
    setView("explore");
    search.reset();
    setActiveResultId(null);
    closeSelection();
    restoreTime();
  }, [search.reset, closeSelection, restoreTime]);

  const pickSaved = useCallback(
    (p: SavedPlace) => {
      setView("explore");
      search.reset();
      setActiveResultId(null);
      setPointTimeline(null);
      setPointSunlight(null);
      setSelection({ id: ++selCounter.current, lng: p.longitude, lat: p.latitude, name: p.name });
      mapController.current?.flyToPoint(p.longitude, p.latitude, 16);
    },
    [search.reset]
  );

  const selectPlace = useCallback((p: import("./types").SunPlace) => {
    setView("explore");
    search.reset();
    setActiveResultId(null);
    setPointTimeline(null);
    setPointSunlight(null);
    setSelection({ id: ++selCounter.current, lng: p.longitude, lat: p.latitude, name: p.name });
    mapController.current?.flyToPoint(p.longitude, p.latitude, 15.8);
  }, [search.reset]);

  const selectSaved = useCallback((p: SavedPlace) => {
    setView("explore");
    setActiveResultId(null);
    setPointTimeline(null);
    setPointSunlight(null);
    setSelection({ id: ++selCounter.current, lng: p.longitude, lat: p.latitude, name: p.name });
    mapController.current?.flyToPoint(p.longitude, p.latitude, 15.8);
  }, []);

  const removeSaved = useCallback((p: SavedPlace) => {
    toggle(p);
    setToast("Quitado de guardados");
  }, [toggle]);

  const handleShare = useCallback(async (r: SunSearchResult) => {
    const res = await shareOrCopy(createShareablePlan(r));
    if (res === "copied") setToast("Copiado al portapapeles");
  }, []);

  const handleToggleSave = useCallback(
    (r: SunSearchResult) => {
      const nowSaved = toggle(r.place);
      setToast(nowSaved ? "Guardado en tus sitios soleados" : "Quitado de guardados");
    },
    [toggle]
  );

  const onZoomIn = useCallback(() => mapController.current?.zoomIn(), []);
  const onZoomOut = useCallback(() => mapController.current?.zoomOut(), []);
  const onLocate = useCallback(() => mapController.current?.locate(), []);
  const onResetNorth = useCallback(() => mapController.current?.resetNorth(), []);
  const toggleClouds = useCallback(() => setShowClouds((v) => !v), []);
  const toggleShadows = useCallback(() => setShowShadows((v) => !v), []);

  const hasSectionPanel = view === "places" || view === "saved" || view === "settings" || view === "about";
  const sheetOnMobile = isMobile && (findOpen || hasSectionPanel || !!selection);
  const provenance = PROVENANCE_WORD[light.summary.kind];
  const showTimeline = view === "explore";

  const detailsProps = activeResult
    ? {
        result: activeResult,
        peers: displayed,
        request: outcome ? outcome.request : null,
        saved: isSaved(activeResult.placeId),
        onToggleSave: () => handleToggleSave(activeResult),
        onShare: () => void handleShare(activeResult),
        onClose: closeDetails,
      }
    : null;

  const renderSearchPanel = (compact = false) =>
    findOpen ? (
      <Suspense fallback={PANEL_SUSPENSE}>
        <FindSunSheet
          mode={view === "plan" ? "plan" : "find"}
          open
          compact={compact}
          now={now}
          origin={userLocation}
          search={search}
          inventory={inventory}
          activeId={activeResultId}
          saved={saved}
          onOpen={() => navigate("find")}
          onModeChange={changeSearchMode}
          onClose={closeFind}
          onRequestLocation={requestUserLocation}
          onPick={pickResult}
          onPickSaved={pickSaved}
        />
      </Suspense>
    ) : (
      <ExploreActions
        onFind={() => navigate("find")}
        onOneHour={() => runQuickSearch(oneHourOfSun(60, userLocation !== null))}
      />
    );

  const renderSectionPanel = () => {
    if (view === "places") {
      return <Suspense fallback={PANEL_SUSPENSE}><PlacesPanel inventory={inventory} onSelect={selectPlace} onClose={() => navigate("explore")} /></Suspense>;
    }
    if (view === "saved") {
      return <Suspense fallback={PANEL_SUSPENSE}><SavedPanel saved={saved} onSelect={selectSaved} onRemove={removeSaved} onClose={() => navigate("explore")} /></Suspense>;
    }
    if (view === "settings") {
      return (
        <Suspense fallback={PANEL_SUSPENSE}>
        <SettingsPanel
          light={light}
          onClose={() => navigate("explore")}
          onAbout={() => navigate("about")}
        />
        </Suspense>
      );
    }
    if (view === "about") return <Suspense fallback={PANEL_SUSPENSE}><AboutPanel light={light} onClose={() => navigate("explore")} /></Suspense>;
    return null;
  };

  return (
    <div className="relative h-dvh w-screen overflow-hidden bg-paper text-ink">
      {/* Mapa de Barcelona + capas que se montan encima */}
      <BarcelonaMap
        theme={theme}
        onSelect={handleSelect}
        onReady={handleMapReady}
        onLoaded={handleLoaded}
        onToast={handleToast}
        onCamera={handleCamera}
        onUserLocation={handleUserLocation}
      >
        <BuildingLayer visible={showBuildings} extrude={FEATURES.buildings3D ? true : "auto"} />
        {loaded && (
          <Suspense fallback={null}>
            <SolarOverlay
              time={selectedTime}
              dayStart={dayStart}
              showSunPath={showSunPath}
              selection={selection}
              highlights={highlights}
              onStats={handleStats}
              onPointTimeline={handleTimeline}
              onPointSunlight={handlePointSunlight}
            >
              <ShadowLayer visible={showShadows} />
              <CloudLayer visible={showClouds} source={debugSource} />
            </SolarOverlay>
          </Suspense>
        )}
        <MapMarkers
          selection={selection}
          userLocation={userLocation}
          highlights={highlights}
          activeSpotId={activeResultId}
          onPickSpot={handlePickSpot}
        />
      </BarcelonaMap>

      {/* La interfaz aparece cuando el mapa ya es visible: primero el mapa, después la
          información solar y por último el indicador solar (retardos en cada componente). */}
      {loaded && (
        <>
          <Sidebar
            view={view}
            collapsed={compactRail}
            onCollapsedChange={setSidebarCollapsed}
            onNavigate={handleNavigate}
          />
          <Header
            now={now}
            desktopSidebar={!isMobile && !compactRail}
            brandOffset={!isMobile && compactRail ? SIDEBAR_COLLAPSED + 18 : 0}
            onSettings={() => navigate("settings")}
          />

          {/* Explore: primero la luz del mapa; las vistas de trabajo usan un panel contextual. */}
          {view === "explore" && !selection && (
          <div
            className={cn(
              "pointer-events-none absolute top-[80px] z-10 flex flex-col items-start gap-3 transition-all duration-500 sm:top-[124px]",
              sheetOnMobile && "-translate-y-2 opacity-0",
              isMobile ? "left-3" : "left-[var(--fts-panel-left)]"
            )}
            style={!isMobile ? ({ "--fts-panel-left": `${panelLeft}px` } as React.CSSProperties) : undefined}
          >
            <div className={cn(sheetOnMobile ? "pointer-events-none" : "pointer-events-auto")}>
              <InfoPanel
                stats={stats}
                time={selectedTime}
                sunTimes={sunTimes}
                up={up}
                altitudeDeg={sunPos.altitudeDeg}
                azimuthDeg={sunPos.azimuthDeg}
                light={light}
                showClouds={showClouds}
                showShadows={showShadows}
              />
            </div>
            {showSunPath && view === "explore" && !selection && (
              <div className="pointer-events-auto hidden sm:block">
                <SunIndicator
                  variant="capsule"
                  azimuthDeg={sunPos.azimuthDeg}
                  altitudeDeg={sunPos.altitudeDeg}
                  bearing={camera.bearing}
                />
              </div>
            )}
          </div>
          )}

          {/* Indicador solar compacto solo al activar la trayectoria. */}
          {showSunPath && view === "explore" && !selection && (
            <div
              className={cn(
                "pointer-events-none absolute right-3 top-[66px] z-20 transition-opacity duration-500 sm:hidden",
                sheetOnMobile && "opacity-0"
              )}
            >
              <SunIndicator
                variant="dial"
                azimuthDeg={sunPos.azimuthDeg}
                altitudeDeg={sunPos.altitudeDeg}
                bearing={camera.bearing}
              />
            </div>
          )}

          {/* Paneles contextuales en desktop: la navegación y el mapa permanecen siempre visibles. */}
          {!isMobile && findOpen && (
            <div
              className="pointer-events-none absolute top-[88px] z-30 w-[min(405px,calc(100vw-110px))]"
              style={{ left: `${panelLeft}px`, bottom: 112 }}
            >
              <div className="fts-scroll-y pointer-events-auto h-full overflow-y-auto pr-1">
                {renderSearchPanel(!!activeResult)}
              </div>
            </div>
          )}
          {!isMobile && hasSectionPanel && (
            <div className="pointer-events-none absolute top-[88px] z-30" style={{ left: `${panelLeft}px` }}>
              <div className="pointer-events-auto">{renderSectionPanel()}</div>
            </div>
          )}

          {/* Detalle del resultado de Find the Sun, o información solar del punto (escritorio / tablet) */}
          {!isMobile && detailsProps && detailsProps.request && (
            <div className="pointer-events-none absolute right-[92px] top-[116px] z-10">
              <div className="pointer-events-auto">
                <Suspense fallback={PANEL_SUSPENSE}>
                  <SunDetails
                    key={detailsProps.result.placeId}
                    {...detailsProps}
                    request={detailsProps.request}
                    className="max-h-[calc(100dvh-116px-250px)]"
                  />
                </Suspense>
              </div>
            </div>
          )}
          {!isMobile && selection && !activeResult && (
            <div className="pointer-events-none absolute right-[92px] top-[116px] z-10">
              <div className="pointer-events-auto">
                <Suspense fallback={PANEL_SUSPENSE}>
                  <PointPanel
                    key={selection.id}
                    point={selection}
                    timeline={pointTimeline}
                    sunlight={pointSunlight}
                    now={now}
                    time={selectedTime}
                    onClose={closeSelection}
                  />
                </Suspense>
              </div>
            </div>
          )}

          {/* Controles del mapa */}
          <div className="pointer-events-none absolute right-3 top-[136px] z-20 sm:right-5 sm:top-[104px]">
            <div className="pointer-events-auto">
              <MapControls
                onZoomIn={onZoomIn}
                onZoomOut={onZoomOut}
                onLocate={onLocate}
                onResetNorth={onResetNorth}
                bearing={camera.bearing}
                pitch={camera.pitch}
                showBuildings={showBuildings}
                onToggleBuildings={() => setShowBuildings((v) => !v)}
                showShadows={showShadows}
                onToggleShadows={toggleShadows}
                showClouds={showClouds}
                onToggleClouds={toggleClouds}
                showSunPath={showSunPath}
                onToggleSunPath={() => setShowSunPath((v) => !v)}
              />
            </div>
          </div>

          {/* Explore: una acción principal y la línea temporal. El resto vive en navegación. */}
          {!isMobile && view === "explore" && (
            <div className="pointer-events-none absolute inset-x-0 bottom-0 z-20 flex flex-col items-center gap-3 px-6 pb-2">
              <div className="pointer-events-auto flex w-full max-w-[880px] items-center justify-center gap-3">
                <div className="pointer-events-none">{renderSearchPanel(false)}</div>
              </div>
              {showTimeline && (
                <div className="pointer-events-auto w-full max-w-[880px]">
                  <TimeSlider
                    selectedTime={selectedTime}
                    now={now}
                    range={range}
                    mode={clock.mode}
                    playing={clock.playing}
                    isNight={!up}
                    intervals={pointTimeline && selection ? pointTimeline.intervals : null}
                    zones={light.zones}
                    provenance={provenance}
                    onScrub={clock.scrub}
                    onNow={clock.goNow}
                    onAhead={clock.startAhead}
                    onTogglePlay={clock.togglePlay}
                  />
                </div>
              )}
            </div>
          )}

          {/* Navegación contextual en desktop. El mapa permanece montado debajo del panel. */}
          {isMobile && (findOpen || hasSectionPanel || (selection && view === "explore")) && (
            <div className="pointer-events-none absolute inset-x-3 bottom-[calc(82px+env(safe-area-inset-bottom))] z-30 flex max-h-[58dvh] justify-center">
              <div className="pointer-events-auto w-full max-w-[440px] overflow-y-auto fts-scroll-y">
                {detailsProps && detailsProps.request ? (
                  <Suspense fallback={PANEL_SUSPENSE}>
                    <SunDetails
                      key={detailsProps.result.placeId}
                      {...detailsProps}
                      request={detailsProps.request}
                      className="max-h-[58dvh] w-full"
                    />
                  </Suspense>
                ) : findOpen ? (
                  renderSearchPanel(false)
                ) : view === "places" ? (
                  <Suspense fallback={PANEL_SUSPENSE}><PlacesPanel inventory={inventory} onSelect={selectPlace} onClose={() => navigate("explore")} /></Suspense>
                ) : view === "saved" ? (
                  <Suspense fallback={PANEL_SUSPENSE}><SavedPanel saved={saved} onSelect={selectSaved} onRemove={removeSaved} onClose={() => navigate("explore")} /></Suspense>
                ) : view === "settings" ? (
                  <Suspense fallback={PANEL_SUSPENSE}>
                    <SettingsPanel light={light} onClose={() => navigate("explore")} onAbout={() => navigate("about")} />
                  </Suspense>
                ) : view === "about" ? (
                  <Suspense fallback={PANEL_SUSPENSE}><AboutPanel light={light} onClose={() => navigate("explore")} /></Suspense>
              ) : selection ? (
                <div className="flex w-full flex-col gap-2">
                  <Suspense fallback={PANEL_SUSPENSE}>
                    <PointPanel
                      key={selection.id}
                      point={selection}
                      timeline={pointTimeline}
                      sunlight={pointSunlight}
                      now={now}
                      time={selectedTime}
                      onClose={closeSelection}
                      className="w-full"
                    />
                  </Suspense>
                  {view === "explore" && (
                    <TimeSlider
                      selectedTime={selectedTime}
                      now={now}
                      range={range}
                      mode={clock.mode}
                      playing={clock.playing}
                      isNight={!up}
                      intervals={pointTimeline?.intervals ?? null}
                      zones={light.zones}
                      provenance={provenance}
                      onScrub={clock.scrub}
                      onNow={clock.goNow}
                      onAhead={clock.startAhead}
                      onTogglePlay={clock.togglePlay}
                    />
                  )}
                </div>
                ) : null}
              </div>
            </div>
          )}

          {/* Acción Find en Explore; paneles de Find/Plan se abren encima del mapa. */}
          {isMobile && view === "explore" && !selection && (
            <div className="pointer-events-none absolute inset-x-0 bottom-[calc(82px+env(safe-area-inset-bottom))] z-20 flex justify-center px-3">
              <div className="pointer-events-auto flex w-full max-w-[520px] items-center justify-center gap-2">
                <div className="pointer-events-none flex-1">{renderSearchPanel(false)}</div>
                <button
                  type="button"
                  aria-label="Explorar lugares"
                  onClick={() => navigate("places")}
                  className="fts-glass flex h-11 w-11 shrink-0 items-center justify-center rounded-full text-sun-deep transition-transform active:scale-95"
                >
                  <PlacesIcon className="h-[18px] w-[18px]" />
                </button>
              </div>
            </div>
          )}

          {/* Línea temporal solo en Explore: Find y Plan tienen su propia hora y franja. */}
          {isMobile && showTimeline && !selection && (
            <div
              className="pointer-events-none absolute inset-x-0 z-20 flex justify-center px-3"
              style={{ bottom: selection ? "calc(82px + env(safe-area-inset-bottom))" : "calc(140px + env(safe-area-inset-bottom))" }}
            >
              <div className="pointer-events-auto w-full max-w-[620px]">
                <TimeSlider
                  selectedTime={selectedTime}
                  now={now}
                  range={range}
                  mode={clock.mode}
                  playing={clock.playing}
                  isNight={!up}
                  intervals={pointTimeline && selection ? pointTimeline.intervals : null}
                  zones={light.zones}
                  provenance={provenance}
                  onScrub={clock.scrub}
                  onNow={clock.goNow}
                  onAhead={clock.startAhead}
                  onTogglePlay={clock.togglePlay}
                />
              </div>
            </div>
          )}

          <MobileNavigation view={view} onNavigate={(tab) => handleNavigate(tab)} />
        </>
      )}

      {DEBUG.weather && (
        <Suspense fallback={null}>
          <DebugPanel
            latitude={selection ? selection.lat : BARCELONA.lat}
            longitude={selection ? selection.lng : BARCELONA.lng}
            time={selectedTime}
            source={debugSource}
            onSourceChange={setDebugSource}
          />
        </Suspense>
      )}

      <Toast message={toast} onDone={clearToast} />
      <Splash visible={!loaded} />
    </div>
  );
}
