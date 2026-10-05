import type { LightSourceState } from "../../hooks/useLightSource";
import { CloseIcon } from "../Navigation/NavIcons";
import { Caps } from "../FindSun/ui";

/** Transparencia sobre el origen y la escala de los datos, en lenguaje sencillo. */
export default function AboutPanel({ light, onClose }: { light: LightSourceState; onClose(): void }) {
  return (
    <section className="fts-glass fts-context-panel fts-slide-in">
      <div className="fts-section-head">
        <div>
          <Caps>Una herramienta para salir</Caps>
          <h2 className="mt-1 font-serif text-[25px] leading-none text-ink">I Follow the Sun</h2>
        </div>
        <button type="button" aria-label="Cerrar" onClick={onClose} className="fts-close-button">
          <CloseIcon className="h-4 w-4" />
        </button>
      </div>

      <p className="mt-4 font-serif text-[19px] leading-[1.3] text-ink">
        Un mapa para entender dónde llega la luz y elegir adónde ir.
      </p>
      <p className="mt-2.5 text-[12px] leading-[1.65] text-ink-soft">
        Sigue el recorrido del Sol, explora Barcelona y encuentra un lugar que reciba luz durante el
        tiempo que te apetece estar fuera.
      </p>

      <div className="mt-4 space-y-3 border-t border-line pt-4">
        <Caps>Los datos, sin adornos</Caps>
        <ul className="space-y-2.5 text-[11.5px] leading-[1.55] text-ink-soft">
          <li><span className="font-medium text-ink">El Sol</span> se calcula astronómicamente.</li>
          <li><span className="font-medium text-ink">Las sombras</span> usan edificios de OpenStreetMap; algunas alturas son estimadas.</li>
          <li><span className="font-medium text-ink">Las nubes</span> usan satélite y previsión a escala de kilómetros: indican la luz de la zona, no de cada calle.</li>
          <li><span className="font-medium text-ink">La ubicación</span> se pide solo cuando eliges buscar cerca de ti.</li>
        </ul>
      </div>

      <p className="mt-4 border-t border-line pt-3 text-[10px] leading-relaxed text-ink-faint">
        Mapa y lugares: © OpenStreetMap. Meteorología: {light.satellite.attribution ?? "Open-Meteo · Météo-France"}.
      </p>
    </section>
  );
}