import { useSyncExternalStore } from "react";
import type { LocalStore } from "../lib/localStore";

/** Valor actual de un almacén local; la interfaz se actualiza al cambiar (en cualquier componente). */
export function useLocalStore<T>(store: LocalStore<T>): T {
  return useSyncExternalStore(store.subscribe, store.get, store.get);
}
