import { useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { CITY_BOUNDS, MAP_CONFIG, forgetMapboxToken, getMapboxToken } from "../../config";
import { easeOutCubic } from "../../lib/coordinates";
import {
  locateUser,
  loadMapProvider,
  type MapLike,
  type MapProvider,
} from "../../services/mapService";
import type { CameraState, LngLat, SelectedPoint, Theme } from "../../types";
import { MapContext } from "./MapContext";
import { log } from "../../lib/log";

/**
 * BarcelonaMap — el mapa interactivo de Barcelona, sin ninguna lógica solar.
 *
 * Crea el mapa con el proveedor activo (Mapbox GL JS con token; mapa abierto sin él), configura
 * la navegación (zoom, desplazamiento, rotación, inclinación y gestos táctiles), gestiona la
 * entrada suave y publica la instancia por contexto para que los hijos se monten encima:
 *
 *   <BarcelonaMap …>
 *     <SolarOverlay … />   capa solar
 *     <BuildingLayer … />  edificios
 *     <MapMarkers … />     marcadores
 *   </BarcelonaMap>
 */

export interface MapController {
  zoomIn(): void;
  zoomOut(): void;
  locate(): void;
  resetNorth(): void;
  flyToPoint(lng: number, lat: number, zoom?: number): void;
  /** Espacio reservado por los paneles flotantes; deja los resultados en la zona visible del mapa. */
  fitPoints(points: LngLat[], leftInset?: number): void;
}

export interface BarcelonaMapProps {
  theme: Theme;
  onSelect(p: SelectedPoint): void;
  onReady(c: MapController): void;
  onLoaded(): void;
  onToast(message: string): void;
  onCamera(c: CameraState): void;
  onUserLocation(p: LngLat): void;
  children?: ReactNode;
}

let nextSelectionId = 1;
const isMobile = () => window.innerWidth < 768;
const OPEN_MAP_NOTICE = "fts:open-map-notice";

export default function BarcelonaMap(props: BarcelonaMapProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const propsRef = useRef(props);
  propsRef.current = props;

  const [provider, setProvider] = useState<MapProvider | null>(null);
  const [map, setMap] = useState<MapLike | null>(null);
  const [revealed, setRevealed] = useState(false);

  // Code-splitting: descarga y evalúa solo Mapbox o solo MapLibre, nunca ambos al inicio.
  useEffect(() => {
    let alive = true;
    loadMapProvider().then((p) => {
      if (alive) setProvider(p);
    }).catch(() => {
      if (alive) propsRef.current.onToast("No se pudo preparar el mapa. Comprueba la conexión.");
    });
    return () => {
      alive = false;
    };
  }, []);

  useEffect(() => {
    const container = containerRef.current;
    if (!container || !provider) return;

    const m = provider.create({ container, theme: propsRef.current.theme });
    let disposed = false;
    let ready = false;
    let raf = 0;
    let autoPitchApplied = false;
    let autoPitchInProgress = false;
    let userCameraIntent = false;
    let entranceStarted = false;
    const timers: number[] = [];
    const later = (fn: () => void, ms: number) => timers.push(window.setTimeout(fn, ms));

    const markReady = () => {
      if (disposed || ready) return;
      ready = true;
      provider.applyTheme(m, propsRef.current.theme);
      setMap(m);
      setRevealed(true);
    };

    /* ------------------------------ carga y entrada ------------------------------ */
    const beginMapEntrance = () => {
      if (disposed || entranceStarted) return;
      entranceStarted = true;
      markReady();
      // La hoja de estilo está lista: enseñamos el mapa sin esperar a que carguen todas las teselas.
      // Los barrios/calles terminan de aparecer mientras la entrada visual sigue su curso.
      m.easeTo({
        zoom: isMobile() ? MAP_CONFIG.zoomMobile : MAP_CONFIG.zoomDesktop,
        duration: 3000,
        easing: easeOutCubic,
      });
      later(() => propsRef.current.onLoaded(), 450);

      // Aviso discreto (una vez por sesión) cuando se usa el mapa abierto por falta de token.
      if (provider.id === "maplibre" && !getMapboxToken()) {
        try {
          if (window.sessionStorage.getItem(OPEN_MAP_NOTICE)) return;
          window.sessionStorage.setItem(OPEN_MAP_NOTICE, "1");
        } catch {
          /* sin sessionStorage */
        }
        // Sin aviso al usuario: el mapa abierto es equivalente. Solo se informa en la consola.
        log.info("sin VITE_MAPBOX_TOKEN, se usa el mapa abierto (OpenFreeMap).");
      }
    };
    // `style.load` deja entrar antes que `load` (que espera a las primeras teselas). `load` es un
    // respaldo para proveedores que no emitan el evento de estilo en la primera carga.
    m.once("style.load", beginMapEntrance);
    m.once("load", beginMapEntrance);

    /* ------------------------------ errores ------------------------------ */
    let fallbackInstalled = false;
    m.on("error", (e: any) => {
      if (disposed) return;
      const status = e?.error?.status;
      if (provider.id === "mapbox" && (status === 401 || status === 403)) {
        forgetMapboxToken();
        propsRef.current.onToast("El token de Mapbox no es válido · usando el mapa abierto.");
        void loadMapProvider("maplibre").then(setProvider);
        return;
      }
      // Sin teselas vectoriales: mapa base simplificado para no dejar la capa solar en el vacío.
      if (!fallbackInstalled && e?.sourceId === provider.sourceId && !e?.tile) {
        fallbackInstalled = true;
        try {
          provider.installFallback(m, propsRef.current.theme);
        } catch {
          /* sin estilo */
        }
        markReady();
        later(() => propsRef.current.onLoaded(), 700);
        propsRef.current.onToast("Mapa base no disponible: mostrando una versión simplificada.");
      }
    });
    // Si la red tarda demasiado, no dejar la pantalla de bienvenida indefinidamente.
    later(() => {
      markReady();
      propsRef.current.onLoaded();
    }, 8000);

    /* ------------------------------ interacción ------------------------------ */
    m.on("click", (e: any) => {
      const { lng, lat } = e.lngLat as LngLat;
      propsRef.current.onSelect({
        id: nextSelectionId++,
        lng,
        lat,
        name: provider.getPlaceName(m, lng, lat),
      });
      const zoom = m.getZoom();
      const mobile = isMobile();
      if (zoom >= 14.2 && !mobile) return;
      m.easeTo({
        center: [lng, lat],
        zoom: Math.max(zoom, 15.2),
        offset: [0, mobile ? -container.clientHeight * 0.17 : 0],
        duration: zoom < 14.2 ? 1000 : 520,
        easing: easeOutCubic,
      });
    });

    // El mapa se mantiene plano a escala de ciudad. Al entrar a escala de manzana se inclina una
    // sola vez para revelar las alturas de los edificios; el usuario conserva el control manual
    // de pitch/rotación. Si aleja el zoom, el pitch automático vuelve al plano suavemente.
    const rememberManualCamera = (e: any) => {
      if (!autoPitchInProgress && e?.originalEvent) userCameraIntent = true;
    };
    const onZoomEnd = () => {
      if (disposed) return;
      const zoom = m.getZoom();
      const pitch = m.getPitch();
      if (zoom < MAP_CONFIG.buildings3DZoomOut) {
        if (autoPitchApplied && !userCameraIntent && pitch > 4) {
          autoPitchInProgress = true;
          m.easeTo({ pitch: 0, duration: 620, easing: easeOutCubic });
          m.once("moveend", () => {
            autoPitchInProgress = false;
            autoPitchApplied = false;
          });
        } else if (!autoPitchApplied) {
          userCameraIntent = false;
        }
        return;
      }
      if (
        zoom >= MAP_CONFIG.buildings3DZoom &&
        pitch < 5 &&
        !autoPitchApplied &&
        !autoPitchInProgress &&
        !userCameraIntent
      ) {
        autoPitchInProgress = true;
        m.easeTo({ pitch: MAP_CONFIG.buildings3DAutoPitch, duration: MAP_CONFIG.buildings3DPitchDurationMs, easing: easeOutCubic });
        m.once("moveend", () => {
          autoPitchInProgress = false;
          autoPitchApplied = true;
        });
      }
    };
    m.on("zoomend", onZoomEnd);
    m.on("pitchstart", rememberManualCamera);
    m.on("rotatestart", rememberManualCamera);

    // Cámara (rotación e inclinación) para la brújula y el indicador solar.
    const emitCamera = () => {
      raf = 0;
      propsRef.current.onCamera({ bearing: m.getBearing(), pitch: m.getPitch() });
    };
    m.on("move", () => {
      if (!raf) raf = requestAnimationFrame(emitCamera);
    });

    /* ------------------------------ controlador ------------------------------ */
    propsRef.current.onReady({
      zoomIn: () => m.zoomIn({ duration: 350 }),
      zoomOut: () => m.zoomOut({ duration: 350 }),
      resetNorth: () => m.easeTo({ bearing: 0, pitch: 0, duration: 700, easing: easeOutCubic }),
      flyToPoint: (lng, lat, zoom) =>
        m.flyTo({
          center: [lng, lat],
          zoom: zoom ?? Math.max(m.getZoom(), 15.4),
          offset: [0, isMobile() ? -container.clientHeight * 0.17 : 0],
          duration: 1400,
          essential: true,
          curve: 1.3,
        }),
      fitPoints: (points, leftInset) => {
        if (points.length === 0) return;
        let w = Infinity;
        let s = Infinity;
        let e = -Infinity;
        let n = -Infinity;
        for (const p of points) {
          w = Math.min(w, p.lng);
          e = Math.max(e, p.lng);
          s = Math.min(s, p.lat);
          n = Math.max(n, p.lat);
        }
        m.fitBounds(
          [
            [w, s],
            [e, n],
          ],
          {
            padding: isMobile()
              ? { top: 180, bottom: 270, left: 36, right: 36 }
              : { top: 150, bottom: 245, left: leftInset ?? 360, right: 100 },
            maxZoom: 16,
            easing: easeOutCubic,
            duration: 1500,
          }
        );
      },
      locate: async () => {
        try {
          const pos = await locateUser();
          const margin = 0.03;
          const inside =
            pos.lng > CITY_BOUNDS.west - margin &&
            pos.lng < CITY_BOUNDS.east + margin &&
            pos.lat > CITY_BOUNDS.south - margin &&
            pos.lat < CITY_BOUNDS.north + margin;
          if (!inside) {
            propsRef.current.onToast("Estás fuera de Barcelona — mostrando la ciudad.");
            return;
          }
          propsRef.current.onUserLocation(pos);
          propsRef.current.onSelect({
            id: nextSelectionId++,
            lng: pos.lng,
            lat: pos.lat,
            name: "Tu ubicación",
          });
          m.flyTo({
            center: [pos.lng, pos.lat],
            zoom: Math.max(m.getZoom(), 15.6),
            duration: 1600,
            essential: true,
          });
        } catch {
          propsRef.current.onToast("No se pudo obtener tu ubicación.");
        }
      },
    });
    emitCamera();

    return () => {
      disposed = true;
      timers.forEach((t) => window.clearTimeout(t));
      if (raf) cancelAnimationFrame(raf);
      m.off("zoomend", onZoomEnd);
      m.off("pitchstart", rememberManualCamera);
      m.off("rotatestart", rememberManualCamera);
      setMap(null);
      setRevealed(false);
      provider.destroy(m);
    };
  }, [provider]);

  // Paleta día / noche: transición suave gracias a `style.transition`.
  const theme = props.theme;
  useEffect(() => {
    if (map && provider) provider.applyTheme(map, theme);
  }, [map, provider, theme]);

  const context = useMemo(() => ({ map, provider }), [map, provider]);

  return (
    <MapContext.Provider value={context}>
      <div
        style={{
          position: "absolute",
          inset: 0,
          opacity: revealed ? 1 : 0,
          transition: "opacity 1800ms ease",
        }}
      >
        <div key={provider?.id ?? "map-provider"} ref={containerRef} style={{ position: "absolute", inset: 0 }} />
      </div>
      {props.children}
    </MapContext.Provider>
  );
}
