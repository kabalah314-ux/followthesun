import { useEffect, useRef } from "react";
import type { MarkerLike } from "../../services/mapService";
import type { Highlight, LngLat, SelectedPoint } from "../../types";
import { useMapContext } from "./MapContext";
import {
  createFindElement,
  createPinElement,
  createUserElement,
  updateFindElement,
} from "./markerElements";

/** Marcadores sobre el mapa: punto seleccionado, ubicación del usuario y lugares destacados. */
export interface MapMarkersProps {
  selection: SelectedPoint | null;
  userLocation: LngLat | null;
  highlights: Highlight[];
  activeSpotId: string | null;
  onPickSpot(id: string): void;
}

export default function MapMarkers(props: MapMarkersProps) {
  const { map, provider } = useMapContext();
  const propsRef = useRef(props);
  propsRef.current = props;

  const pinRef = useRef<MarkerLike | null>(null);
  const userRef = useRef<MarkerLike | null>(null);
  const findRef = useRef<Map<string, MarkerLike>>(new Map());

  // Al cambiar de mapa, los marcadores anteriores desaparecen con él.
  useEffect(() => {
    const finds = findRef.current;
    return () => {
      pinRef.current?.remove();
      userRef.current?.remove();
      finds.forEach((m) => m.remove());
      finds.clear();
      pinRef.current = null;
      userRef.current = null;
    };
  }, [map]);

  // Punto seleccionado.
  const selId = props.selection?.id;
  const selLng = props.selection?.lng;
  const selLat = props.selection?.lat;
  useEffect(() => {
    if (!map || !provider) return;
    if (selId !== undefined && selLng !== undefined && selLat !== undefined) {
      if (!pinRef.current) {
        pinRef.current = provider.createMarker(map, createPinElement(), [selLng, selLat]);
      } else {
        pinRef.current.setLngLat([selLng, selLat]);
      }
    } else {
      pinRef.current?.remove();
      pinRef.current = null;
    }
  }, [map, provider, selId, selLng, selLat]);

  // Ubicación del usuario.
  const userLng = props.userLocation?.lng;
  const userLat = props.userLocation?.lat;
  useEffect(() => {
    if (!map || !provider) return;
    if (userLng !== undefined && userLat !== undefined) {
      if (!userRef.current) {
        userRef.current = provider.createMarker(map, createUserElement(), [userLng, userLat]);
      } else {
        userRef.current.setLngLat([userLng, userLat]);
      }
    } else {
      userRef.current?.remove();
      userRef.current = null;
    }
  }, [map, provider, userLng, userLat]);

  // Lugares destacados por Find the Sun.
  useEffect(() => {
    if (!map || !provider) return;
    const markers = findRef.current;
    const wanted = new Set(props.highlights.map((h) => h.id));

    markers.forEach((marker, id) => {
      if (!wanted.has(id)) {
        marker.remove();
        markers.delete(id);
      }
    });

    for (const h of props.highlights) {
      let marker = markers.get(h.id);
      if (!marker) {
        const el = createFindElement(() => propsRef.current.onPickSpot(h.id));
        marker = provider.createMarker(map, el, [h.lng, h.lat]);
        markers.set(h.id, marker);
      }
      updateFindElement(marker.getElement(), {
        rank: h.rank,
        name: h.name,
        score: h.label,
        active: h.id === props.activeSpotId,
        primary: h.primary ?? false,
      });
    }
  }, [map, provider, props.highlights, props.activeSpotId]);

  return null;
}
