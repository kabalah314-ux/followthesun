import { useSyncExternalStore } from "react";
import { preferences, type Preferences } from "../lib/preferences";

export function usePreferences(): [Preferences, (patch: Partial<Preferences>) => void] {
  const prefs = useSyncExternalStore(preferences.subscribe, preferences.get, preferences.get);
  return [prefs, preferences.set];
}
