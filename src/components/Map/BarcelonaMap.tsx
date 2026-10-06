import { useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { BUILDINGS_3D, CITY_BOUNDS, FEATURES, MAP_CONFIG } from "../../config";
import { easeOutCubic } from "../../lib/coordinates";
import { preferences } from "../../lib/preferences";
import {
  loadMapProvider,
  loadOpenMapProvider,
  locateUser,
  type MapLike,
  type MapProvider,
} from "../../services/mapService";
import type { CameraState, LngLat, SelectedPoint, Theme } from "../../types";
import { MapContext } from "./MapContext";

/**
 * BarcelonaMap — el mapa interactivo de Barcelona, sin ninguna lógica solar.
 *
 * Crea el mapa con el proveedor activo (Mapbox GL JS con token; mapa abierto sin él), configura la
 * navegación (zoom, desplazamiento, rotación, inclinación y gestos táctiles) y publica la instancia
 * por contexto para que los hijos se monten encima:
 *
 *   <BarcelonaMap …>
 *     <BuildingLayer … />  edificios y relieve 3D
 *     <SolarOverlay … />   capa solar
 *     <MapMarkers … />     marcadores
 *   </BarcelonaMap>
 *
 * Rendimiento: solo se descarga el proveedor de mapa que se usa (Mapbox desde su CDN, y únicamente
 * si hay token); la pantalla de bienvenida se levanta en cuanto el estilo está listo (`styledata`),
 * sin esperar a que carguen todas las teselas; un arrastre de más de 6 px no selecciona punto.
 * Cambiar a vista satélite es un `setStyle`, no un mapa nuevo: la cámara y la hora se conservan.
 */

export interface MapController {
  zoomIn(): void;
  zoomOut(): void;
  locate(): void;
  resetNorth(): void;
  flyToPoint(lng: number, lat: number, zoom?: number): void;
  fitPoints(points: LngLat[]): void;
  /** Zonas del mapa tapadas por la interfaz: encuadres y vuelos las respetan. */
  setInsets(insets: MapInsets): void;
}

export interface MapInsets {
  top: number;
  right: number;
  bottom: number;
  left: number;
}

export interface BarcelonaMapProps {
  theme: Theme;
  onSelect(p: SelectedPoint): void;
  onReady(c: MapController): void;
  onLoaded(): void;
  onToast(message: string): void;
  onCamera(c: CameraState): void;
  onUserLocation(p: LngLat): void;
  /** Inclinar el mapa al acercarse para ver los edificios en 3D. */
  autoTilt?: boolean;
  children?: ReactNode;
}

let nextSelectionId = 1;
const isMobile = () => window.innerWidth < 640;
const OPEN_MAP_NOTICE = "fts:open-map-notice";
/** Arrastre máximo que aún cuenta como pulsación (evita marcar punto al mover el mapa). */
const TAP_SLOP_PX = 6;

export default function BarcelonaMap(props: BarcelonaMapProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const propsRef = useRef(props);
  propsRef.current = props;

  const [provider, setProvider] = useState<MapProvider | null>(null);
  const [map, setMap] = useState<MapLike | null>(null);
  const [revealed, setRevealed] = useState(false);
  const insetsRef = useRef<MapInsets>({ top: 0, right: 0, bottom: 0, left: 0 });
  /** Desplazamiento que centra un punto en la parte VISIBLE del mapa. */
  const visibleOffset = (): [number, number] => {
    const i = insetsRef.current;
    return [(i.left - i.right) / 2, (i.top - i.bottom) / 2];
  };

  /* ------------------------------ proveedor bajo demanda ------------------------------ */
  useEffect(() => {
    let alive = true;
    loadMapProvider().then((p) => {
      if (alive) setProvider(p);
    });
    return () => {
      alive = false;
    };
  }, []);

  useEffect(() => {
    const container = containerRef.current;
    if (!container || !provider) return;

    let disposed = false;
    let m: MapLike | null = null;
    let raf = 0;
    const timers: number[] = [];
    const later = (fn: () => void, ms: number) => timers.push(window.setTimeout(fn, ms));
    const cleanups: Array<() => void> = [];

    const markReady = () => {
      if (disposed || !m) return;
      provider.applyTheme(m, propsRef.current.theme);
      setMap(m);
      setRevealed(true);
    };

    const onFail = (message: string) => {
      if (disposed) return;
      propsRef.current.onToast(message);
      void loadOpenMapProvider().then((open) => {
        if (!disposed) setProvider(open);
      });
    };

    void (async () => {
      /* 1 · Crear el mapa (puede implicar descargar la librería). */
      let created: MapLike;
      try {
        created = await provider.create({
          container,
          theme: propsRef.current.theme,
          satellite: preferences.get().satelliteView,
        });
      } catch {
        onFail("No se pudo cargar el mapa · usando el mapa abierto.");
        return;
      }
      if (disposed) {
        provider.destroy(created);
        return;
      }
      m = created;

      /* 2 · Bienvenida: el estilo listo basta, no la última tesela. */
      let styleReady = false;
      created.once("styledata", () => {
        if (disposed || styleReady) return;
        styleReady = true;
        markReady();
        later(() => propsRef.current.onLoaded(), 160);
      });
      created.once("load", () => {
        if (disposed) return;
        markReady();
        later(() => propsRef.current.onLoaded(), 160);
        // Acercamiento suave hasta una vista donde ya se leen las sombras.
        created.easeTo({
          zoom: isMobile() ? MAP_CONFIG.zoomMobile : MAP_CONFIG.zoomDesktop,
          duration: 1700,
          easing: easeOutCubic,
        });
        if (provider.id === "maplibre") {
          try {
            if (window.sessionStorage.getItem(OPEN_MAP_NOTICE)) return;
            window.sessionStorage.setItem(OPEN_MAP_NOTICE, "1");
          } catch {
            /* sin sessionStorage */
          }
          later(
            () =>
              propsRef.current.onToast(
                "Mapbox sin configurar · usando el mapa abierto. Añade VITE_MAPBOX_TOKEN en .env"
              ),
            3600
          );
        }
      });

      /* 3 · Errores de token o de teselas. */
      let fallbackInstalled = false;
      created.on("error", (e: any) => {
        if (disposed) return;
        if (provider.id === "mapbox" && (e?.error?.status === 401 || e?.error?.status === 403)) {
          onFail("El token de Mapbox no es válido · usando el mapa abierto.");
          return;
        }
        if (!fallbackInstalled && e?.sourceId === provider.sourceId && !e?.tile) {
          fallbackInstalled = true;
          try {
            provider.installFallback(created, propsRef.current.theme);
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

      /* 4 · Pulsación frente a arrastre. */
      const canvas = created.getCanvas();
      let down: { x: number; y: number } | null = null;
      let suppressTap = false;
      const onDown = (e: PointerEvent) => {
        down = { x: e.clientX, y: e.clientY };
      };
      const onUp = (e: PointerEvent) => {
        if (!down) return;
        suppressTap = Math.hypot(e.clientX - down.x, e.clientY - down.y) > TAP_SLOP_PX;
        down = null;
      };
      canvas.addEventListener("pointerdown", onDown);
      window.addEventListener("pointerup", onUp);
      cleanups.push(() => {
        canvas.removeEventListener("pointerdown", onDown);
        window.removeEventListener("pointerup", onUp);
      });

      created.on("click", (e: any) => {
        if (suppressTap) {
          suppressTap = false;
          return;
        }
        const { lng, lat } = e.lngLat as LngLat;
        propsRef.current.onSelect({
          id: nextSelectionId++,
          lng,
          lat,
          name: provider.getPlaceName(created, lng, lat),
        });
        const zoom = created.getZoom();
        const mobile = isMobile();
        if (zoom >= 14.2 && !mobile) return;
        created.easeTo({
          center: [lng, lat],
          zoom: Math.max(zoom, 15.2),
          offset: visibleOffset(),
          duration: zoom < 14.2 ? 900 : 500,
          easing: easeOutCubic,
        });
      });

      /* 5 · Cámara (rotación e inclinación). */
      const emitCamera = () => {
        raf = 0;
        propsRef.current.onCamera({ bearing: created.getBearing(), pitch: created.getPitch() });
      };
      created.on("move", () => {
        if (!raf) raf = requestAnimationFrame(emitCamera);
      });

      /* 6 · Relieve: inclinación automática. */
      // Al acercarse, el mapa se inclina para ver los edificios en 3D; al alejarse vuelve a la vista
      // cenital. Si la persona inclina o reorienta el mapa a mano, manda ella (hasta volver a alejarse).
      let tiltArmed = true;
      let autoTilted = false;
      created.on("pitchstart", (e: { originalEvent?: unknown }) => {
        if (e?.originalEvent) {
          tiltArmed = false;
          autoTilted = false;
        }
      });
      created.on("moveend", () => {
        if (disposed || !propsRef.current.autoTilt) return;
        const z = created.getZoom();
        const pitch = created.getPitch();
        if (z < BUILDINGS_3D.autoTiltResetZoom) {
          if (autoTilted && pitch > 1) created.easeTo({ pitch: 0, duration: 800, easing: easeOutCubic });
          autoTilted = false;
          tiltArmed = true;
          return;
        }
        if (tiltArmed && z >= BUILDINGS_3D.autoTiltZoom && pitch < 5) {
          tiltArmed = false;
          autoTilted = true;
          created.easeTo({ pitch: BUILDINGS_3D.autoTiltPitch, duration: 1100, easing: easeOutCubic });
        }
      });

      /* 7 · Controlador para la interfaz. */
      propsRef.current.onReady({
        zoomIn: () => created.zoomIn({ duration: 350 }),
        zoomOut: () => created.zoomOut({ duration: 350 }),
        resetNorth: () => {
          // Vista cenital pedida a mano: no se vuelve a inclinar hasta alejarse y acercarse de nuevo.
          tiltArmed = false;
          autoTilted = false;
          created.easeTo({ bearing: 0, pitch: 0, duration: 700, easing: easeOutCubic });
        },
        flyToPoint: (lng, lat, zoom) =>
          created.flyTo({
            center: [lng, lat],
            zoom: zoom ?? Math.max(created.getZoom(), 15.4),
            offset: visibleOffset(),
            duration: 1400,
            essential: true,
            curve: 1.3,
          }),
        fitPoints: (points) => {
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
          created.fitBounds(
            [
              [w, s],
              [e, n],
            ],
            {
              padding: (() => {
                // Lo que tapa la interfaz + margen, sin dejar menos de 120 px de mapa útil.
                const i = insetsRef.current;
                const W = container.clientWidth;
                const H = container.clientHeight;
                const sx = Math.min(1, Math.max(0, W - 120) / Math.max(1, i.left + i.right + 96));
                const sy = Math.min(1, Math.max(0, H - 120) / Math.max(1, i.top + i.bottom + 96));
                return {
                  top: (i.top + 48) * sy,
                  bottom: (i.bottom + 48) * sy,
                  left: (i.left + 48) * sx,
                  right: (i.right + 48) * sx,
                };
              })(),
              maxZoom: 16,
              easing: easeOutCubic,
              duration: 1500,
            }
          );
        },
        setInsets: (insets) => {
          insetsRef.current = insets;
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
            created.flyTo({
              center: [pos.lng, pos.lat],
              zoom: Math.max(created.getZoom(), 15.6),
              duration: 1600,
              essential: true,
            });
          } catch {
            propsRef.current.onToast("No se pudo obtener tu ubicación.");
          }
        },
      });
      emitCamera();
    })();

    return () => {
      disposed = true;
      timers.forEach((t) => window.clearTimeout(t));
      if (raf) cancelAnimationFrame(raf);
      cleanups.forEach((fn) => fn());
      if (m) provider.destroy(m);
      setMap(null);
      setRevealed(false);
    };
  }, [provider]);

  /* ------------------------------ vista satélite en caliente ------------------------------ */
  // Cambiar el estilo no recrea el mapa: se conservan la cámara, la hora y las capas activas.
  useEffect(() => {
    if (!map || !provider) return;
    let current = preferences.get().satelliteView;

    const restyle = () => {
      const p = preferences.get();
      provider.applyTheme(map, propsRef.current.theme);
      provider.setBuildingsVisible(map, p.showBuildings);
      provider.setBuildings3D(map, p.showBuildings && (p.buildings3D || FEATURES.buildings3D));
    };

    const unsubscribe = preferences.subscribe(() => {
      const next = preferences.get().satelliteView;
      if (next === current) return;
      current = next;
      map.setStyle(provider.createStyle(propsRef.current.theme, next));
      map.once("styledata", restyle);
    });

    return unsubscribe;
  }, [map, provider]);

  // Paleta día / noche: transición suave gracias a `style.transition`.
  const theme = props.theme;
  useEffect(() => {
    if (map) provider?.applyTheme(map, theme);
  }, [map, provider, theme]);

  const context = useMemo(() => ({ map, provider }), [map, provider]);

  return (
    <MapContext.Provider value={context}>
      <div
        style={{
          position: "absolute",
          inset: 0,
          opacity: revealed ? 1 : 0,
          transition: "opacity 700ms ease",
        }}
      >
        <div key={provider?.id ?? "loading"} ref={containerRef} style={{ position: "absolute", inset: 0 }} />
      </div>
      {props.children}
    </MapContext.Provider>
  );
}
