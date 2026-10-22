import { tr } from "../../i18n";

/**
 * Alertas (guía maestra 2): «Sol en tu terraza en 20 min», «sombra en el parque a las 18:00».
 * Necesitan avisos push y un servidor gratuito: llegan en la siguiente fase. Aquí se explica qué
 * harán y cómo se activarán, sin pedir nada todavía.
 */
export default function AlertsPanel({ savedCount, onOpenSaved }: { savedCount: number; onOpenSaved(): void }) {
  const examples = [tr("alerts.ejemplo_terraza"), tr("alerts.ejemplo_parque"), tr("alerts.ejemplo_resumen")];
  return (
    <div>
      <div className="rounded-[20px] bg-sun-soft px-4 py-4">
        <p className="font-serif text-[21px] leading-tight text-ink">{tr("alerts.llegan_pronto")}</p>
        <p className="mt-1.5 text-[14px] leading-relaxed text-ink-soft">{tr("alerts.que_haran")}</p>
      </div>
      <ul className="mt-4 space-y-2">
        {examples.map((e) => (
          <li key={e} className="flex items-start gap-3 rounded-[18px] border border-line px-3.5 py-3">
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden className="mt-0.5 shrink-0 text-sun-deep">
              <path d="M6 16V11a6 6 0 1 1 12 0v5l1.5 2h-15z" />
              <path d="M10 20.5a2 2 0 0 0 4 0" />
            </svg>
            <span className="text-[14px] leading-snug text-ink">{e}</span>
          </li>
        ))}
      </ul>
      <p className="mt-4 text-[13px] leading-relaxed text-ink-soft">{tr("alerts.como_funcionaran")}</p>
      <p className="mt-2 text-[13px] leading-relaxed text-ink-soft">{tr("alerts.privacidad")}</p>
      <button
        type="button"
        disabled
        className="mt-4 flex min-h-[48px] w-full items-center justify-center rounded-full bg-ink/10 text-[14.5px] font-semibold text-ink-soft"
      >
        {tr("alerts.activar_pronto")}
      </button>
      <button
        type="button"
        onClick={onOpenSaved}
        className="mt-2 flex min-h-[44px] w-full items-center justify-center text-[13.5px] font-semibold text-sun-deep underline-offset-4 hover:underline"
      >
        {savedCount > 0 ? tr("alerts.tus_sitios_guardados_n", { p0: savedCount }) : tr("alerts.guarda_tus_sitios")}
      </button>
    </div>
  );
}
