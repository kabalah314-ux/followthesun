import { tr } from "../i18n";
import { buildIcs } from "../lib/ics";
import { timeParams } from "../lib/deepLinks";
import { createLocalStore } from "../lib/localStore";
import { formatClock } from "./timeService";

/**
 * Avisos de sol o de sombra (guía maestra 2, utilidad «Alertas»), sin servidor y sin cuentas: cada
 * aviso es un evento en el calendario de la persona con una alarma 20 minutos antes. Aquí se
 * guarda la lista de avisos creados, solo en este dispositivo, para volver a descargarlos o
 * quitarlos.
 */

export interface SunAlert {
  id: string;
  placeId: string;
  name: string;
  /** Para el enlace /lugar/<slug> del evento. */
  slug: string | null;
  kind: "sun" | "shade";
  start: number;
  end: number;
  latitude: number;
  longitude: number;
  createdAt: number;
}

export const ALERT_MINUTES_BEFORE = 20;
const MAX = 30;

const isAlert = (a: unknown): a is SunAlert => {
  const x = a as SunAlert;
  return (
    !!x &&
    typeof x === "object" &&
    typeof x.id === "string" &&
    typeof x.placeId === "string" &&
    typeof x.name === "string" &&
    (x.kind === "sun" || x.kind === "shade") &&
    typeof x.start === "number" &&
    typeof x.end === "number" &&
    typeof x.latitude === "number" &&
    typeof x.longitude === "number"
  );
};

export const alertsStore = createLocalStore<SunAlert[]>("fts:alerts:v1", [], (v) =>
  Array.isArray(v) ? v.filter(isAlert).slice(0, MAX) : []
);

/** Guarda un aviso (sustituye al del mismo sitio y la misma hora). */
export function addAlert(a: Omit<SunAlert, "id" | "createdAt">, now: number = Date.now()): SunAlert {
  const alert: SunAlert = { ...a, id: `${a.placeId}@${a.start}`, createdAt: now };
  alertsStore.set((list) => [alert, ...list.filter((x) => x.id !== alert.id)].slice(0, MAX));
  return alert;
}

export function removeAlert(id: string): void {
  alertsStore.set((list) => list.filter((x) => x.id !== id));
}

/** Avisos que aún no han pasado, del más próximo al más lejano. */
export function upcomingAlerts(list: readonly SunAlert[], now: number): SunAlert[] {
  return list.filter((a) => a.end > now).sort((a, b) => a.start - b.start);
}

/** El evento de calendario de un aviso, con el enlace al sitio y a esa hora. */
export function alertIcs(a: SunAlert, origin: string, now: number = Date.now()): string {
  const range = `${formatClock(a.start)}–${formatClock(a.end)}`;
  const t = timeParams(a.start);
  const url = a.slug ? `${origin}/lugar/${a.slug}?hora=${encodeURIComponent(t.hora)}&dia=${t.dia}` : origin;
  return buildIcs(
    {
      uid: `${a.id.replace(/[^a-zA-Z0-9@:._-]/g, "-")}@ifollowthesun`,
      start: a.start,
      end: a.end,
      title: a.kind === "sun" ? tr("alerts.ics_titulo_sol", { p0: a.name }) : tr("alerts.ics_titulo_sombra", { p0: a.name }),
      description: tr("alerts.ics_descripcion", { p0: range, p1: url }),
      location: `${a.name}, Barcelona`,
      url,
      geo: { lat: a.latitude, lng: a.longitude },
      alarmMinutesBefore: ALERT_MINUTES_BEFORE,
      alarmText:
        a.kind === "sun"
          ? tr("alerts.ics_alarma_sol", { p0: ALERT_MINUTES_BEFORE, p1: a.name })
          : tr("alerts.ics_alarma_sombra", { p0: ALERT_MINUTES_BEFORE, p1: a.name }),
    },
    now
  );
}

/** Descarga el evento: en el móvil se abre directamente en el calendario. */
export function downloadAlert(a: SunAlert, origin: string = window.location.origin): void {
  const blob = new Blob([alertIcs(a, origin)], { type: "text/calendar;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = `${a.slug ?? "aviso"}-${timeParams(a.start).dia}.ics`;
  document.body.appendChild(link);
  link.click();
  link.remove();
  window.setTimeout(() => URL.revokeObjectURL(url), 60_000);
}
