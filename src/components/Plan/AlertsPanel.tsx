import { useLocalStore } from "../../hooks/useLocalStore";
import { dayChoiceLabel } from "../../lib/planningTime";
import { alertsStore, downloadAlert, removeAlert, upcomingAlerts, ALERT_MINUTES_BEFORE } from "../../services/alertsService";
import { formatClock, startOfZoneDay } from "../../services/timeService";
import { tr } from "../../i18n";

/**
 * Alertas (guía maestra 2): cada aviso es un evento en el calendario de la persona con una alarma
 * antes del sol (o de la sombra). Sin servidor, sin cuentas y en cualquier móvil; aquí se ven los
 * avisos que vienen, se pueden volver a añadir al calendario o quitar.
 */
export default function AlertsPanel({ now, savedCount, onOpenSaved }: { now: number; savedCount: number; onOpenSaved(): void }) {
  const all = useLocalStore(alertsStore);
  const list = upcomingAlerts(all, now);
  return (
    <div>
      <div className="rounded-[20px] bg-sun-soft px-4 py-4">
        <p className="font-serif text-[21px] leading-tight text-ink">{tr("alerts.titulo_calendario")}</p>
        <p className="mt-1.5 text-[14px] leading-relaxed text-ink-soft">{tr("alerts.como_crear", { p0: ALERT_MINUTES_BEFORE })}</p>
      </div>

      {list.length === 0 ? (
        <p className="mt-4 rounded-[18px] border border-dashed border-line px-4 py-4 text-center text-[14px] leading-relaxed text-ink-soft">
          {tr("alerts.sin_avisos")}
        </p>
      ) : (
        <ul className="mt-4 space-y-2">
          {list.map((a) => (
            <li key={a.id} className="rounded-[18px] border border-line px-3.5 py-3">
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <p className="truncate text-[14.5px] font-semibold text-ink">{a.name}</p>
                  <p className="text-[13px] text-ink-soft">
                    {tr(a.kind === "sun" ? "alerts.sol_en_franja" : "alerts.sombra_en_franja", {
                      p0: dayChoiceLabel(startOfZoneDay(a.start), now),
                      p1: `${formatClock(a.start)}–${formatClock(a.end)}`,
                    })}
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() => removeAlert(a.id)}
                  aria-label={tr("alerts.quitar_aviso", { p0: a.name })}
                  className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full text-ink-soft outline-none hover:bg-ink/[0.05] focus-visible:ring-2 focus-visible:ring-sun/60"
                >
                  <svg width="12" height="12" viewBox="0 0 12 12" aria-hidden>
                    <path d="M2 2l8 8M10 2l-8 8" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
                  </svg>
                </button>
              </div>
              <button
                type="button"
                onClick={() => downloadAlert(a)}
                className="mt-1 min-h-[40px] text-[13.5px] font-semibold text-sun-deep underline-offset-4 outline-none hover:underline focus-visible:ring-2 focus-visible:ring-sun/60"
              >
                {tr("alerts.anadir_otra_vez")}
              </button>
            </li>
          ))}
        </ul>
      )}

      <p className="mt-4 text-[13px] leading-relaxed text-ink-soft">{tr("alerts.nubes_aviso")}</p>
      <p className="mt-2 text-[13px] leading-relaxed text-ink-soft">{tr("alerts.privacidad_calendario")}</p>
      <button
        type="button"
        onClick={onOpenSaved}
        className="mt-3 flex min-h-[44px] w-full items-center justify-center text-[13.5px] font-semibold text-sun-deep underline-offset-4 hover:underline"
      >
        {savedCount > 0 ? tr("alerts.tus_sitios_guardados_n", { p0: savedCount }) : tr("alerts.guarda_tus_sitios")}
      </button>
    </div>
  );
}
