import { PLACES_CONFIG } from "../config";
import type { PlaceLinkRef } from "../lib/deepLinks";
import type { SunPlace } from "../types";
import { createCoordinatePlace, placeService } from "./placeService";
import { venueService, venueToSunPlace } from "./venueService";

/**
 * El lugar real al que apunta un enlace profundo: primero el inventario de lugares (OpenStreetMap,
 * con caché semanal), después los bares y cafés con terraza; un punto del mapa se recrea desde sus
 * coordenadas. null si ya no existe.
 */
export async function resolvePlaceRef(ref: PlaceLinkRef): Promise<SunPlace | null> {
  if (ref.point) return createCoordinatePlace(ref.point.lat, ref.point.lng, ref.name);
  try {
    const inventory = await placeService.load();
    const hit = inventory.places.find((p) => p.id === ref.id);
    if (hit) return hit;
  } catch {
    /* sin inventario: se prueba con los negocios */
  }
  try {
    const { venues } = await venueService.loadVenues(PLACES_CONFIG.bbox);
    const venue = venues.find((v) => v.id === ref.id);
    if (venue) return venueToSunPlace(venue);
  } catch {
    /* sin negocios */
  }
  return null;
}
