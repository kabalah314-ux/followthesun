import { createLocalStore } from "../lib/localStore";

/**
 * Listas de Mis sitios («Terrazas de invierno», «Para ir con los niños»…), solo en este
 * dispositivo. Los sitios se guardan en `savedPlacesService`; una lista agrupa algunos de ellos.
 */

export interface PlaceList {
  id: string;
  name: string;
  placeIds: string[];
  createdAt: number;
}

const MAX_LISTS = 12;

const sanitize = (v: unknown): PlaceList[] =>
  Array.isArray(v)
    ? v
        .filter(
          (l): l is PlaceList =>
            !!l &&
            typeof l === "object" &&
            typeof (l as PlaceList).id === "string" &&
            typeof (l as PlaceList).name === "string" &&
            Array.isArray((l as PlaceList).placeIds)
        )
        .map((l) => ({ ...l, placeIds: l.placeIds.filter((x) => typeof x === "string"), createdAt: Number(l.createdAt) || 0 }))
        .slice(0, MAX_LISTS)
    : [];

export const listsStore = createLocalStore<PlaceList[]>("fts:lists:v1", [], sanitize);

export function createList(name: string): PlaceList | null {
  const clean = name.trim().slice(0, 40);
  if (!clean) return null;
  const list: PlaceList = { id: `l${Date.now().toString(36)}`, name: clean, placeIds: [], createdAt: Date.now() };
  listsStore.set((all) => [...all, list].slice(0, MAX_LISTS));
  return list;
}

export function renameList(id: string, name: string): void {
  const clean = name.trim().slice(0, 40);
  if (!clean) return;
  listsStore.set((all) => all.map((l) => (l.id === id ? { ...l, name: clean } : l)));
}

export function deleteList(id: string): void {
  listsStore.set((all) => all.filter((l) => l.id !== id));
}

/** Mete o saca un sitio de una lista. Devuelve true si queda dentro. */
export function toggleInList(listId: string, placeId: string): boolean {
  let inside = false;
  listsStore.set((all) =>
    all.map((l) => {
      if (l.id !== listId) return l;
      inside = !l.placeIds.includes(placeId);
      return { ...l, placeIds: inside ? [...l.placeIds, placeId] : l.placeIds.filter((x) => x !== placeId) };
    })
  );
  return inside;
}

/** Al dejar de guardar un sitio, sale de todas sus listas. */
export function forgetPlace(placeId: string): void {
  listsStore.set((all) => all.map((l) => (l.placeIds.includes(placeId) ? { ...l, placeIds: l.placeIds.filter((x) => x !== placeId) } : l)));
}
