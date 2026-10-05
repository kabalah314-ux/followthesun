import { useEffect, useLayoutEffect, useState } from "react";
import { BARCELONA } from "../config";
import { solarService } from "../services/solarService";
import type { Theme } from "../types";

const themeFor = (altDeg: number, prev?: Theme): Theme => {
  if (!prev) return altDeg < -2 ? "night" : "day";
  return prev === "day" ? (altDeg < -3 ? "night" : "day") : altDeg > -1 ? "day" : "night";
};

/** Tema día / noche según la altura del sol, con histéresis para no parpadear en el crepúsculo. */
export function useAppTheme(altitudeDeg: number): Theme {
  const [theme, setTheme] = useState<Theme>(() =>
    themeFor(solarService.getPosition(Date.now(), BARCELONA.lat, BARCELONA.lng).altitudeDeg)
  );
  useEffect(() => {
    setTheme((prev) => themeFor(altitudeDeg, prev));
  }, [altitudeDeg]);
  useLayoutEffect(() => {
    document.documentElement.dataset.theme = theme;
    document
      .querySelector('meta[name="theme-color"]')
      ?.setAttribute("content", theme === "night" ? "#0f1428" : "#f6f1e8");
  }, [theme]);
  return theme;
}
