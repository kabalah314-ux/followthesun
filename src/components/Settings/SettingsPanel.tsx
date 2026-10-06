import { useEffect, useState, type ReactNode } from "react";
import type { LightSourceState } from "../../hooks/useLightSource";
import type { Preferences } from "../../lib/preferences";
import { Caps, GhostButton, Segmented, Switch } from "../FindSun/ui";
import { PanelHeader } from "../Layout/ContextPanel";
import SourceStatusLine from "../SourceStatusLine";

type Permission = "granted" | "denied" | "prompt" | "unknown";

const PERMISSION_TEXT: Record<Permission, string> = {
  granted: "Permitida",
  denied: "Bloqueada en el navegador",
  prompt: "Se pedirá solo cuando la necesites",
  unknown: "Se pedirá solo cuando la necesites",
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
      <span className="text-[13px] text-ink">{label}</span>
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
    if (!window.confirm("¿Borrar los sitios guardados y los datos descargados en este dispositivo?")) return;
    try {
      const keys: string[] = [];
      for (let i = 0; i < window.localStorage.length; i++) {
        const k = window.localStorage.key(i);
        if (k && k.startsWith("fts:")) keys.push(k);
      }
      keys.forEach((k) => window.localStorage.removeItem(k));
    } catch {
      /* noop */
    }
    window.location.reload();
  };

  return (
    <>
      <PanelHeader title="Ajustes" onClose={onClose} />
      <div className="space-y-4">
        <Section title="Unidades">
          <Row label="Temperatura">
            <Segmented
              label="Temperatura"
              value={prefs.temperatureUnit}
              onChange={(v) => onChange({ temperatureUnit: v })}
              options={[
                { id: "c", label: "°C" },
                { id: "f", label: "°F" },
              ]}
            />
          </Row>
          <Row label="Distancia">
            <Segmented
              label="Distancia"
              value={prefs.distanceUnit}
              onChange={(v) => onChange({ distanceUnit: v })}
              options={[
                { id: "km", label: "km" },
                { id: "mi", label: "mi" },
              ]}
            />
          </Row>
          <Row label="Formato de hora">
            <Segmented
              label="Formato de hora"
              value={prefs.timeFormat}
              onChange={(v) => onChange({ timeFormat: v })}
              options={[
                { id: "24h", label: "24 h" },
                { id: "12h", label: "12 h" },
              ]}
            />
          </Row>
        </Section>

        <Section title="Mapa">
          <Row label="Tema">
            <Segmented
              label="Tema del mapa"
              value={prefs.mapTheme}
              onChange={(v) => onChange({ mapTheme: v })}
              options={[
                { id: "auto", label: "Auto" },
                { id: "light", label: "Claro" },
                { id: "dark", label: "Oscuro" },
              ]}
            />
          </Row>
          <p className="text-[10.5px] text-ink-faint">«Auto» pasa a oscuro cuando el sol se pone a la hora elegida.</p>
          <div className="-mx-2">
            <Switch checked={prefs.showBuildings} onChange={(v) => onChange({ showBuildings: v })} label="Mostrar edificios" />
            <Switch
              checked={prefs.buildings3D}
              onChange={(v) => onChange({ buildings3D: v })}
              label="Relieve 3D"
              hint="Al acercarte, los edificios con su altura real, iluminados por el sol"
            />
            <Switch
              checked={prefs.autoTilt}
              onChange={(v) => onChange({ autoTilt: v })}
              label="Inclinar al acercarse"
              hint="El mapa se inclina solo para ver mejor el relieve"
            />
            <Switch checked={prefs.showShadows} onChange={(v) => onChange({ showShadows: v })} label="Sombra urbana" />
            <Switch checked={prefs.showClouds} onChange={(v) => onChange({ showClouds: v })} label="Nubes" />
            <Switch checked={prefs.showSunPath} onChange={(v) => onChange({ showSunPath: v })} label="Trayectoria del sol" />
          </div>
        </Section>

        <Section title="Ubicación">
          <Row label="Permiso">
            <span className="text-right text-[11.5px] text-ink-soft">{PERMISSION_TEXT[permission]}</span>
          </Row>
          <p className="text-[10.5px] leading-snug text-ink-faint">
            La ubicación solo se usa para buscar sol cerca de ti y nunca sale de tu dispositivo.
          </p>
          {permission !== "denied" && <GhostButton onClick={onRequestLocation}>Usar mi ubicación</GhostButton>}
        </Section>

        <Section title="Datos meteorológicos">
          <SourceStatusLine light={light} />
        </Section>

        <Section title="Este dispositivo">
          <GhostButton onClick={clearData}>Borrar datos guardados</GhostButton>
        </Section>
      </div>
    </>
  );
}
