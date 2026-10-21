import { useEffect, useState, type ReactNode } from "react";
import type { LightSourceState } from "../../hooks/useLightSource";
import type { Preferences } from "../../lib/preferences";
import { Caps, GhostButton, Segmented, Switch } from "../FindSun/ui";
import { PanelHeader } from "../Layout/ContextPanel";
import SourceStatusLine from "../SourceStatusLine";
import { LANG_STORAGE_KEY, tr, useLang } from "../../i18n";

type Permission = "granted" | "denied" | "prompt" | "unknown";

const PERMISSION_TEXT: Record<Permission, string> = {
  granted: tr("settingsPanel.permitida"),
  denied: tr("settingsPanel.bloqueada_en_el_navegador"),
  prompt: tr("settingsPanel.se_pedira_solo_cuando_la"),
  unknown: tr("settingsPanel.se_pedira_solo_cuando_la"),
};

function Section({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section className="border-t border-line pt-3.5 first:border-t-0 first:pt-0">
      <Caps className="mb-2.5">{title}</Caps>
      <div className="space-y-2.5">{children}</div>
    </section>
  );
}

function Row({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="flex items-center justify-between gap-3">
      <span className="text-[14px] text-ink">{label}</span>
      {children}
    </div>
  );
}

interface Props {
  prefs: Preferences;
  onChange(patch: Partial<Preferences>): void;
  light: LightSourceState;
  onRequestLocation(): void;
  onClose(): void;
}

/** Ajustes de la persona. Nada técnico del motor solar: solo lo que cambia cómo usa la app. */
export default function SettingsPanel({ prefs, onChange, light, onRequestLocation, onClose }: Props) {
  const [permission, setPermission] = useState<Permission>("unknown");
  const { lang, setLang, langs } = useLang();

  useEffect(() => {
    let alive = true;
    navigator.permissions
      ?.query({ name: "geolocation" as PermissionName })
      .then((s) => {
        if (!alive) return;
        setPermission(s.state as Permission);
        s.onchange = () => setPermission(s.state as Permission);
      })
      .catch(() => undefined);
    return () => {
      alive = false;
    };
  }, []);

  const clearData = () => {
    if (!window.confirm(tr("settingsPanel.borrar_los_sitios_guardados_y"))) return;
    try {
      const keys: string[] = [];
      for (let i = 0; i < window.localStorage.length; i++) {
        const k = window.localStorage.key(i);
        // El idioma no es un dato guardado: se queda.
        if (k && k.startsWith("fts:") && k !== LANG_STORAGE_KEY) keys.push(k);
      }
      keys.forEach((k) => window.localStorage.removeItem(k));
    } catch {
      /* noop */
    }
    window.location.reload();
  };

  return (
    <>
      <PanelHeader title={tr("navItems.ajustes")} onClose={onClose} />
      <div className="space-y-4">
        <Section title={tr("settingsPanel.idioma")}>
          <Segmented
            label={tr("settingsPanel.idioma")}
            value={lang}
            onChange={setLang}
            options={langs.map((l) => ({ id: l.id, label: l.label }))}
          />
          <p className="text-[12px] text-ink-faint">{tr("settingsPanel.la_app_se_recarga_en")}</p>
        </Section>

        <Section title={tr("settingsPanel.unidades")}>
          <Row label={tr("settingsPanel.temperatura")}>
            <Segmented
              label={tr("settingsPanel.temperatura")}
              value={prefs.temperatureUnit}
              onChange={(v) => onChange({ temperatureUnit: v })}
              options={[
                { id: "c", label: "°C" },
                { id: "f", label: "°F" },
              ]}
            />
          </Row>
          <Row label={tr("sunDetails.distancia")}>
            <Segmented
              label={tr("sunDetails.distancia")}
              value={prefs.distanceUnit}
              onChange={(v) => onChange({ distanceUnit: v })}
              options={[
                { id: "km", label: "km" },
                { id: "mi", label: "mi" },
              ]}
            />
          </Row>
          <Row label={tr("settingsPanel.formato_de_hora")}>
            <Segmented
              label={tr("settingsPanel.formato_de_hora")}
              value={prefs.timeFormat}
              onChange={(v) => onChange({ timeFormat: v })}
              options={[
                { id: "24h", label: "24 h" },
                { id: "12h", label: "12 h" },
              ]}
            />
          </Row>
        </Section>

        <Section title={tr("layerControl.mapa")}>
          <Row label={tr("settingsPanel.tema")}>
            <Segmented
              label={tr("settingsPanel.tema_del_mapa")}
              value={prefs.mapTheme}
              onChange={(v) => onChange({ mapTheme: v })}
              options={[
                { id: "auto", label: tr("settingsPanel.auto") },
                { id: "light", label: tr("settingsPanel.claro") },
                { id: "dark", label: tr("settingsPanel.oscuro") },
              ]}
            />
          </Row>
          <p className="text-[12px] text-ink-faint">{tr("settingsPanel.auto_pasa_a_oscuro_cuando")}</p>
          <div className="-mx-2">
            <Switch checked={prefs.showBuildings} onChange={(v) => onChange({ showBuildings: v })} label={tr("settingsPanel.mostrar_edificios")} />
            <Switch
              checked={prefs.buildings3D}
              onChange={(v) => onChange({ buildings3D: v })}
              label={tr("layerControl.relieve_3d")}
              hint={tr("settingsPanel.al_acercarte_los_edificios_con")}
            />
            <Switch
              checked={prefs.autoTilt}
              onChange={(v) => onChange({ autoTilt: v })}
              label={tr("settingsPanel.inclinar_al_acercarse")}
              hint={tr("settingsPanel.el_mapa_se_inclina_solo")}
            />
            <Switch checked={prefs.showShadows} onChange={(v) => onChange({ showShadows: v })} label={tr("sunDetails.sombra_urbana")} />
            <Switch checked={prefs.showClouds} onChange={(v) => onChange({ showClouds: v })} label={tr("sunDetails.nubes")} />
            <Switch checked={prefs.showSunPath} onChange={(v) => onChange({ showSunPath: v })} label={tr("layerControl.trayectoria_del_sol")} />
          </div>
        </Section>

        <Section title={tr("settingsPanel.ubicacion")}>
          <Row label={tr("settingsPanel.permiso")}>
            <span className="text-right text-[12.5px] text-ink-soft">{PERMISSION_TEXT[permission]}</span>
          </Row>
          <p className="text-[12px] leading-snug text-ink-faint">
            {tr("settingsPanel.la_ubicacion_solo_se_usa")}
          </p>
          {permission !== "denied" && <GhostButton onClick={onRequestLocation}>{tr("nearbyStrip.usar_mi_ubicacion")}</GhostButton>}
        </Section>

        <Section title={tr("settingsPanel.datos_meteorologicos")}>
          <SourceStatusLine light={light} />
        </Section>

        <Section title={tr("settingsPanel.este_dispositivo")}>
          <GhostButton onClick={clearData}>{tr("settingsPanel.borrar_datos_guardados")}</GhostButton>
        </Section>
      </div>
    </>
  );
}
