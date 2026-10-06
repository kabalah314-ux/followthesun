import type { ReactNode } from "react";
import { APP_NAME, APP_VERSION } from "../../config";
import { Caps } from "../FindSun/ui";
import { PanelHeader } from "../Layout/ContextPanel";
import { LogoMark } from "../Logo";

function Block({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section className="border-t border-line pt-3.5">
      <Caps className="mb-2">{title}</Caps>
      <div className="space-y-1.5 text-[12px] leading-relaxed text-ink-soft">{children}</div>
    </section>
  );
}

/** Acerca de — breve y honesto: qué es, de dónde salen los datos y hasta dónde llega su precisión. */
export default function AboutPanel({ onClose }: { onClose(): void }) {
  return (
    <>
      <PanelHeader title="Acerca de" onClose={onClose} />
      <div className="space-y-4">
        <div className="flex items-start gap-3.5">
          <LogoMark size={44} className="shrink-0 text-ink" />
          <div>
            <p className="font-serif text-[22px] leading-none text-ink">{APP_NAME}</p>
            <p className="mt-2 text-[12.5px] leading-relaxed text-ink-soft">
              Un mapa solar de Barcelona. Hecho para entender dónde está la luz del sol — y adónde ir para
              encontrarla.
            </p>
          </div>
        </div>

        <Block title="Datos">
          <p>Sol: cálculo astronómico (posición, orto y ocaso).</p>
          <p>Edificios, lugares y mapa: OpenStreetMap (OpenFreeMap / Mapbox).</p>
          <p>Previsión: Météo-France AROME y ARPEGE vía Open-Meteo.</p>
          <p>Observación: radiación solar por satélite EUMETSAT MTG (DWD) vía Open-Meteo.</p>
        </Block>

        <Block title="Precisión">
          <p>La sombra de los edificios se calcula a nivel de calle.</p>
          <p>
            Las nubes, tanto observadas como previstas, tienen una resolución de unos 2,5 km: indican la luz
            de la zona, no la de cada rincón. Por eso cada resultado lleva su confianza.
          </p>
        </Block>

        <Block title="Límites">
          <p>Las alturas de algunos edificios están estimadas y el relieve es aproximado.</p>
          <p>El tiempo a pie es una estimación en línea recta, no una ruta.</p>
          <p>Más allá de mañana no hay previsión: solo sol y sombras («sol posible»).</p>
        </Block>

        <p className="border-t border-line pt-3 text-[10.5px] text-ink-faint">
          {APP_NAME} · versión {APP_VERSION} · © OpenStreetMap contributors · Open-Meteo (CC BY 4.0)
        </p>
      </div>
    </>
  );
}
