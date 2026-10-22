import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import "../index.css";
import SunWidget from "./SunWidget";

/**
 * Widget «Sol de hoy» para la web de un local (guía maestra 2, E4 y utilidad 25): una tarjeta
 * pequeña, sin mapa, pensada para un <iframe> de 340 × 170 px. Entrada propia de Vite: no
 * descarga el mapa ni el resto de la app.
 */
createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <SunWidget />
  </StrictMode>
);
