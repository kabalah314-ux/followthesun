import type { LightSourceState } from "../../hooks/useLightSource";
import { CloseIcon } from "../Navigation/NavIcons";
import { Caps } from "../FindSun/ui";

interface Props {
  light: LightSourceState;
  onAbout(): void;
  onClose(): void;
}

/** Preferencias y claridad de datos; las capas del mapa se controlan en Layers, no aquí también. */
export default function SettingsPanel({ light, onAbout, onClose }: Props) {
  const satellite = light.satellite.resolutionKm;
  const model = light.weather.resolutionKm;
  return (
    <section className="fts-glass fts-context-panel fts-slide-in">
      <div className="fts-section-head">
        <div>
          <Caps>Tu experiencia</Caps>
          <h2 className="mt-1 font-serif text-[23px] leading-none text-ink">Ajustes</h2>
        </div>
        <button type="button" aria-label="Cerrar" onClick={onClose} className="fts-close-button">
          <CloseIcon className="h-4 w-4" />
        </button>
      </div>

      <div className="mt-4 space-y-4">
        <div>
          <Caps>Formato</Caps>
          <dl className="mt-2 divide-y divide-line text-[12px]">
            <div className="flex items-center justify-between py-2.5">
              <dt className="text-ink-soft">Hora local</dt>
              <dd className="font-medium text-ink">24 h · Europe/Madrid</dd>
            </div>
            <div className="flex items-center justify-between py-2.5">
              <dt className="text-ink-soft">Temperatura · distancia</dt>
              <dd className="font-medium text-ink">°C · km</dd>
            </div>
          </dl>
        </div>

        <div className="border-t border-line pt-3.5">
          <Caps>Capas del mapa</Caps>
          <p className="mt-2 text-[11.5px] leading-relaxed text-ink-soft">
            Abre <span className="font-medium text-ink">Capas</span> junto al mapa para mostrar u
            ocultar edificios, sombras, nubes y la trayectoria del Sol.
          </p>
        </div>

        <div className="border-t border-line pt-3.5">
          <Caps>Escala de los datos</Caps>
          <p className="mt-2 text-[11.5px] leading-relaxed text-ink-soft">
            La geometría solar es astronómica y las sombras usan edificios. El satélite
            {satellite ? ` (≈ ${String(satellite).replace(".", ",")} km)` : ""} y la previsión
            {model ? ` (≈ ${String(model).replace(".", ",")} km)` : ""} describen la luz de una zona,
            no de cada calle.
          </p>
          <p className="mt-2 text-[10.5px] text-ink-faint">La ubicación solo se solicita si buscas cerca de ti.</p>
        </div>
      </div>

      <button
        type="button"
        onClick={onAbout}
        className="mt-4 flex w-full items-center justify-between border-t border-line pt-3.5 text-left text-[12px] font-medium text-ink-soft transition-colors hover:text-ink"
      >
        <span>Acerca de Follow the Sun</span>
        <span aria-hidden className="text-ink-faint">→</span>
      </button>
    </section>
  );
}