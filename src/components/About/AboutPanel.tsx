import { Fragment, type ReactNode } from "react";
import { APP_NAME, APP_VERSION } from "../../config";
import { Caps } from "../FindSun/ui";
import { PanelHeader } from "../Layout/ContextPanel";
import { LogoMark } from "../Logo";
import { tr, useLang } from "../../i18n";

function Block({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section className="border-t border-line pt-3.5">
      <Caps className="mb-2">{title}</Caps>
      <div className="space-y-1.5 text-[13px] leading-relaxed text-ink-soft">{children}</div>
    </section>
  );
}

/** Acerca de — breve y honesto: qué es, de dónde salen los datos y hasta dónde llega su precisión. */
export default function AboutPanel({ onClose }: { onClose(): void }) {
  const { lang, setLang, langs } = useLang();
  return (
    <>
      <PanelHeader title={tr("aboutPanel.acerca_de")} onClose={onClose} />
      <div className="space-y-4">
        <div className="flex items-start gap-3.5">
          <LogoMark size={44} className="shrink-0 text-ink" />
          <div>
            <p className="font-serif text-[22px] leading-none text-ink">{APP_NAME}</p>
            <p className="mt-2 text-[13.5px] leading-relaxed text-ink-soft">
              {tr("aboutPanel.un_mapa_solar_de_barcelona")}
            </p>
          </div>
        </div>

        <Block title={tr("aboutPanel.datos")}>
          <p>{tr("aboutPanel.sol_calculo_astronomico_posicion_orto")}</p>
          <p>{tr("aboutPanel.edificios_lugares_y_mapa_openstreetmap")}</p>
          <p>{tr("aboutPanel.vista_real_icgc")}</p>
          <p>{tr("aboutPanel.fotos_abiertas")}</p>
          <p>
            {tr("aboutPanel.terrazas_con_licencia_areas_de")}
          </p>
          <p>{tr("aboutPanel.prevision_meteo_france_arome_y")}</p>
          <p>{tr("aboutPanel.observacion_radiacion_solar_por_satelite")}</p>
          <p>{tr("aboutPanel.mar_open_meteo")}</p>
        </Block>

        <Block title={tr("aboutPanel.precision")}>
          <p>{tr("aboutPanel.la_sombra_de_los_edificios")}</p>
          <p>
            {tr("aboutPanel.las_nubes_tanto_observadas_como")}
          </p>
        </Block>

        <Block title={tr("aboutPanel.como_ordenamos")}>
          <p>{tr("aboutPanel.como_ordenamos_parametros")}</p>
          <p>{tr("aboutPanel.como_ordenamos_sin_pago")}</p>
        </Block>
        <Block title={tr("aboutPanel.limites")}>
          <p>{tr("aboutPanel.las_alturas_de_algunos_edificios")}</p>
          <p>{tr("aboutPanel.el_tiempo_a_pie_es")}</p>
          <p>{tr("aboutPanel.mas_alla_de_manana_no")}</p>
        </Block>

        <div className="space-y-1.5 border-t border-line pt-3 text-[12px] text-ink-faint">
          <p>{tr("aboutPanel.version_openstreetmap_contributors_open_meteo", { p0: APP_NAME, p1: APP_VERSION })}</p>
          <p>
            {tr("settingsPanel.idioma")}:{" "}
            {langs.map((l, i) => (
              <Fragment key={l.id}>
                {i > 0 && " · "}
                {l.id === lang ? (
                  <span lang={l.id} className="font-medium text-ink-soft">
                    {l.label}
                  </span>
                ) : (
                  <button
                    type="button"
                    lang={l.id}
                    onClick={() => setLang(l.id)}
                    className="rounded-sm underline underline-offset-2 outline-none transition-colors hover:text-ink focus-visible:ring-2 focus-visible:ring-sun/60"
                  >
                    {l.label}
                  </button>
                )}
              </Fragment>
            ))}
          </p>
        </div>
      </div>
    </>
  );
}
