import { Suspense, lazy, useCallback, useMemo, useRef, useState } from "react";
import Header from "./components/Header";
import Sidebar, { SIDEBAR_COLLAPSED, SIDEBAR_EXPANDED } from "./components/Navigation/Sidebar";
import MobileNavigation from "./components/Navigation/MobileNavigation";
import { isSearchView, type AppView } from "./components/Navigation/viewTypes";
import ExploreActions from "./components/Navigation/ExploreActions";
import type { MapController } from "./components/Map/BarcelonaMap";
import MapControlsDock from "./components/Shell/MapControlsDock";
import MapStage from "./components/Shell/MapStage";
import ExploreOverlay from "./components/Shell/ExploreOverlay";
import { DesktopExploreBar, DesktopPanels, MobileExploreBar, MobileSheet } from "./components/Shell/Layouts";
import type { PointDetailsProps, ResultDetailsProps } from "./components/Shell/Details";
import { useMapLayers } from "./hooks/useMapLayers";
import { useSearchResults } from "./hooks/useSearchResults";
import TimeSlider, { TimelineCollapsed } from "./components/Map/TimeSlider";
import Splash from "./components/Splash";
import { PROVENANCE_WORD } from "./components/SourceStatusLine";
import Toast from "./components/Toast";
import Welcome from "./components/Welcome";
import SectionPanel, { PANEL_SUSPENSE, isSectionView } from "./components/SectionPanel";
import { BARCELONA, DEBUG } from "./config";
import { useAppTheme } from "./hooks/useAppTheme";
import { useDaySun } from "./hooks/useDaySun";
import { usePointSelection } from "./hooks/usePointSelection";
import { useStoredFlag } from "./hooks/useStoredFlag";
import { useUserLocation } from "./hooks/useUserLocation";
import { useLightSource } from "./hooks/useLightSource";
import { useMediaQuery } from "./hooks/useMediaQuery";
import { useNow } from "./hooks/useNow";
import { usePlaceInventory } from "./hooks/usePlaceInventory";
import { useSavedPlaces } from "./hooks/useSavedPlaces";
import { useSunSearch } from "./hooks/useSunSearch";
import { useTimeController } from "./hooks/useTimeController";
import { buildSearchRequest, oneHourOfSun, type PlannerState } from "./lib/planning";
import { dayChoiceLabel, dayStartFor } from "./lib/planningTime";
import { createShareablePlan, shareOrCopy } from "./services/planShareService";
import { SUN_UP_RAD, solarService } from "./services/solarService";
import type {
  CameraState,
  CityStats,
  LightSourceMode,
  LngLat,
  PointTimeline,
  SavedPlace,
  SelectedPoint,
  SunPlace,
  SunSearchResult,
  SunlightResult,
} from "./types";

// Funciones secundarias se descargan cuando se abren: mapa primero, herramientas después.
const FindSunSheet = lazy(() => import("./components/FindSun/FindSunSheet"));
const DebugPanel = lazy(() => import("./components/DebugPanel"));


export default function App() {
  const now = useNow(15_000);
  const isMobile = useMediaQuery("(max-width: 767px)");
  const isTablet = useMediaQuery("(min-width: 768px) and (max-width: 1023px)");

  /* ------------------------------ día y sol ------------------------------ */
  /** Día que está mirando la línea de tiempo: 0 = hoy … 6. */
  const [dayOffset, setDayOffset] = useState(0);
  const { dayStart, sunTimes, range } = useDaySun(now, dayOffset);

  /** Instante visualizado. Por defecto es la hora presente del día elegido; el selector lo desplaza. */
  const clock = useTimeController(now, range, dayOffset);
  const { goNow, scrub } = clock;
  const selectedTime = clock.selectedTime;
  const sunPos = useMemo(
    () => solarService.getPosition(selectedTime, BARCELONA.lat, BARCELONA.lng),
    [selectedTime]
  );
  const up = sunPos.altitude >= SUN_UP_RAD;

  const theme = useAppTheme(sunPos.altitudeDeg);

  /* ------------------------------ estado de interfaz ------------------------------ */
  const [loaded, setLoaded] = useState(false);
  const [stats, setStats] = useState<CityStats | null>(null);
  const layers = useMapLayers();
  const point = usePointSelection();
  const { clear: clearPoint, select: selectPoint } = point;
  const { selection, pointTimeline, pointSunlight, setPointTimeline, setPointSunlight } = point;
  const [camera, setCamera] = useState<CameraState>({ bearing: 0, pitch: 0 });
  const [toast, setToast] = useState<string | null>(null);
  const [debugSource, setDebugSource] = useState<LightSourceMode>("fused");
  const [view, setView] = useState<AppView>("explore");
  const [sidebarCollapsed, setSidebarCollapsed] = useStoredFlag("fts:sidebar-collapsed");
  const [timelineHidden, setTimelineHidden] = useStoredFlag("fts:timeline-hidden");

  /* El hook carga los servicios meteorológicos en idle, después del primer render del mapa. */
  const light = useLightSource(selectedTime, loaded);

  const mapController = useRef<MapController | null>(null);
  const compactRail = isTablet || sidebarCollapsed;
  const panelLeft = compactRail ? SIDEBAR_COLLAPSED + 18 : SIDEBAR_EXPANDED + 20;
  const resultLeftPadding = isMobile ? 36 : panelLeft + 405 + 20;

  const handleMapReady = useCallback((c: MapController) => {
    mapController.current = c;
  }, []);
  const handleStats = useCallback((s: CityStats) => setStats(s), []);
  const handleTimeline = useCallback((t: PointTimeline | null) => setPointTimeline(t), [setPointTimeline]);
  const handlePointSunlight = useCallback((r: SunlightResult | null) => setPointSunlight(r), [setPointSunlight]);
  const handleLoaded = useCallback(() => setLoaded(true), []);
  const handleToast = useCallback((m: string) => setToast(m), []);
  const clearToast = useCallback(() => setToast(null), []);
  const { userLocation, setUserLocation, requestUserLocation } = useUserLocation(handleToast);
  const handleUserLocation = useCallback((p: LngLat) => setUserLocation(p), [setUserLocation]);
  const handleCamera = useCallback((c: CameraState) => {
    // Se cuantiza para no re-renderizar en cada fotograma de una rotación.
    const bearing = Math.round(c.bearing * 2) / 2;
    const pitch = Math.round(c.pitch);
    setCamera((prev) => (prev.bearing === bearing && prev.pitch === pitch ? prev : { bearing, pitch }));
  }, []);

  /* ------------------------------ navegación + búsqueda ------------------------------ */
  const search = useSunSearch();
  const { reset: resetSearch, run: runSearch } = search;
  const findOpen = isSearchView(view);
  const inventory = usePlaceInventory(findOpen || view === "places");
  const { saved, isSaved, toggle } = useSavedPlaces();
  const scrubbedRef = useRef(false);
  const rangeRef = useRef(range);
  rangeRef.current = range;

  const outcome = search.state.outcome;
  const { displayed, activeResult, activeResultId, setActiveResultId, highlights } = useSearchResults(
    outcome,
    mapController,
    resultLeftPadding
  );

  const navigate = useCallback(
    (next: AppView) => {
      const leavingSearch = isSearchView(view) && !isSearchView(next);
      const enteringSearch = isSearchView(next) && view !== next;
      if (leavingSearch || enteringSearch) resetSearch();
      if (enteringSearch) setActiveResultId(null);
      setView(next);
    },
    [view, resetSearch, setActiveResultId]
  );

  const runQuickSearch = useCallback(
    (planner: PlannerState) => {
      clearPoint();
      setActiveResultId(null);
      setView("find");
      void runSearch(buildSearchRequest(planner, { now: Date.now(), origin: userLocation }));
    },
    [runSearch, userLocation, clearPoint, setActiveResultId]
  );

  const handleNavigate = useCallback(
    (next: AppView) => {
      if (next === view) return;
      if (isSearchView(view) && !isSearchView(next) && scrubbedRef.current) {
        scrubbedRef.current = false;
        goNow();
      }
      if (next !== "explore") clearPoint();
      navigate(next);
    },
    [view, navigate, goNow, clearPoint]
  );

  /** Si se previsualizó el mejor momento en la línea de tiempo, al salir se vuelve a «ahora». */
  const restoreTime = useCallback(() => {
    if (scrubbedRef.current) {
      scrubbedRef.current = false;
      goNow();
    }
  }, [goNow]);

  /**
   * Cambiar de día (o volver a «Ahora»): la línea de tiempo se sitúa en la hora presente de ese
   * día, así que se descarta cualquier instantánea elegida arrastrando.
   */
  const selectDay = useCallback(
    (next: number) => {
      scrubbedRef.current = false;
      setDayOffset(next);
      goNow();
    },
    [goNow]
  );

  /** Lleva el mapa a un lugar y lo selecciona, saliendo de la búsqueda si hacía falta. */
  const focusPlace = useCallback(
    (p: { longitude: number; latitude: number; name: string }, zoom: number, leaveSearch = true) => {
      setView("explore");
      if (leaveSearch) resetSearch();
      setActiveResultId(null);
      selectPoint({ lng: p.longitude, lat: p.latitude, name: p.name });
      mapController.current?.flyToPoint(p.longitude, p.latitude, zoom);
    },
    [resetSearch, selectPoint, setActiveResultId]
  );

  const handleSelect = useCallback((p: SelectedPoint) => {
    setActiveResultId(null);
    selectPoint(p);
    setView("explore");
    resetSearch();
  }, [resetSearch, selectPoint, setActiveResultId]);

  const closeSelection = clearPoint;

  const pickResult = useCallback(
    (r: SunSearchResult) => {
      setActiveResultId(r.placeId);
      selectPoint({ lng: r.spot.longitude, lat: r.spot.latitude, name: r.place.name });
      mapController.current?.flyToPoint(r.spot.longitude, r.spot.latitude, 16);
      // Se muestra el mapa en el mejor momento de ese lugar (si cae dentro del día de la línea de tiempo).
      const t = (r.bestWindow ?? r.searchWindow).start;
      const rg = rangeRef.current;
      if (t >= rg.start && t <= rg.end) {
        scrub(t);
        scrubbedRef.current = true;
      }
    },
    [scrub, selectPoint, setActiveResultId]
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
  }, [closeSelection, restoreTime, setActiveResultId]);

  const closeFind = useCallback(() => {
    setView("explore");
    resetSearch();
    setActiveResultId(null);
    closeSelection();
    restoreTime();
  }, [resetSearch, closeSelection, restoreTime, setActiveResultId]);

  const pickSaved = useCallback((p: SavedPlace) => focusPlace(p, 16), [focusPlace]);
  const selectPlace = useCallback((p: SunPlace) => focusPlace(p, 15.8), [focusPlace]);
  const selectSaved = useCallback((p: SavedPlace) => focusPlace(p, 15.8, false), [focusPlace]);

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


  const hasSectionPanel = isSectionView(view);
  const sheetOnMobile = isMobile && (findOpen || hasSectionPanel || !!selection);
  const provenance = PROVENANCE_WORD[light.summary.kind];
  const exploring = view === "explore";

  const details: ResultDetailsProps | null =
    activeResult && outcome
      ? {
          result: activeResult,
          peers: displayed,
          request: outcome.request,
          saved: isSaved(activeResult.placeId),
          onToggleSave: () => handleToggleSave(activeResult),
          onShare: () => void handleShare(activeResult),
          onClose: closeDetails,
        }
      : null;
  const pointDetails: PointDetailsProps | null = selection
    ? { point: selection, timeline: pointTimeline, sunlight: pointSunlight, now, time: selectedTime, onClose: closeSelection }
    : null;

  const searchPanel = (compact: boolean) => (
    <Suspense fallback={PANEL_SUSPENSE}>
      <FindSunSheet
        key={view === "plan" ? "plan" : "find"}
        mode={view === "plan" ? "plan" : "find"}
        compact={compact}
        now={now}
        origin={userLocation}
        search={search}
        inventory={inventory}
        activeId={activeResultId}
        saved={saved}
        onClose={closeFind}
        onRequestLocation={requestUserLocation}
        onPick={pickResult}
        onPickSaved={pickSaved}
      />
    </Suspense>
  );
  const exploreActions = (
    <ExploreActions
      onFind={() => navigate("find")}
      onShade={() => runQuickSearch({ ...oneHourOfSun(60, userLocation !== null), intent: "shade" })}
    />
  );
  const sectionPanel = hasSectionPanel ? (
    <SectionPanel
      view={view}
      light={light}
      inventory={inventory}
      saved={saved}
      onSelectPlace={selectPlace}
      onSelectSaved={selectSaved}
      onRemoveSaved={removeSaved}
      onNavigate={navigate}
    />
  ) : null;

  /** Línea de tiempo (escritorio, móvil y bajo el punto), con las franjas del punto si lo hay. */
  const timeline = timelineHidden ? (
    <TimelineCollapsed
      selectedTime={selectedTime}
      dayLabel={dayChoiceLabel(dayStartFor(now, dayOffset), now)}
      onShow={() => setTimelineHidden(false)}
    />
  ) : (
    <TimeSlider
      selectedTime={selectedTime}
      now={now}
      range={range}
      mode={clock.mode}
      dayOffset={dayOffset}
      isNight={!up}
      zones={light.zones}
      provenance={provenance}
      onScrub={scrub}
      onNow={() => selectDay(0)}
      onSelectDay={selectDay}
      onHide={() => setTimelineHidden(true)}
      intervals={pointTimeline && selection ? pointTimeline.intervals : null}
    />
  );
  const mobileSheetOpen = findOpen || hasSectionPanel || (!!selection && exploring);

  return (
    <div className="relative h-dvh w-screen overflow-hidden bg-paper text-ink">
      <MapStage
        theme={theme}
        loaded={loaded}
        layers={layers}
        time={selectedTime}
        dayStart={dayStart}
        selection={selection}
        userLocation={userLocation}
        highlights={highlights}
        activeSpotId={activeResultId}
        debugSource={debugSource}
        onSelect={handleSelect}
        onReady={handleMapReady}
        onLoaded={handleLoaded}
        onToast={handleToast}
        onCamera={handleCamera}
        onUserLocation={handleUserLocation}
        onStats={handleStats}
        onPointTimeline={handleTimeline}
        onPointSunlight={handlePointSunlight}
        onPickSpot={handlePickSpot}
      />

      {/* La interfaz aparece cuando el mapa ya es visible. */}
      {loaded && (
        <>
          <Sidebar view={view} collapsed={compactRail} onCollapsedChange={setSidebarCollapsed} onNavigate={handleNavigate} />
          <Header
            now={now}
            desktopSidebar={!isMobile && !compactRail}
            brandOffset={!isMobile && compactRail ? SIDEBAR_COLLAPSED + 18 : 0}
            onSettings={() => navigate("settings")}
          />

          {exploring && !selection && (
            <ExploreOverlay
              isMobile={isMobile}
              hidden={sheetOnMobile}
              panelLeft={panelLeft}
              stats={stats}
              time={selectedTime}
              sunTimes={sunTimes}
              up={up}
              altitudeDeg={sunPos.altitudeDeg}
              azimuthDeg={sunPos.azimuthDeg}
              light={light}
              layers={layers}
              camera={camera}
            />
          )}

          {!isMobile && (
            <DesktopPanels
              panelLeft={panelLeft}
              searchPanel={findOpen ? searchPanel(!!activeResult) : null}
              sectionPanel={sectionPanel}
              details={details}
              point={activeResult ? null : pointDetails}
            />
          )}

          <MapControlsDock layers={layers} camera={camera} controller={mapController} />

          {!isMobile && exploring && <DesktopExploreBar actions={exploreActions} timeline={timeline} panelLeft={panelLeft} />}

          {isMobile && mobileSheetOpen && (
            <MobileSheet
              details={details}
              searchPanel={findOpen ? searchPanel(false) : null}
              sectionPanel={sectionPanel}
              point={pointDetails}
              pointTimeline={exploring ? timeline : null}
            />
          )}
          {isMobile && exploring && !selection && (
            <MobileExploreBar
              actions={exploreActions}
              timeline={timeline}
              onPlaces={() => navigate("places")}
              onRecommended={() => navigate("recommended")}
            />
          )}

          <MobileNavigation view={view} onNavigate={handleNavigate} />
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

      {loaded && <Welcome />}
      <Toast message={toast} onDone={clearToast} />
      <Splash visible={!loaded} />
    </div>
  );
}
