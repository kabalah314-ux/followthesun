import { useState, type ReactElement } from "react";
import { log } from "../lib/log";

const KEY = "fts:welcome-v1";

interface WelcomeStep {
  title: string;
  text: string;
}

const STEPS: WelcomeStep[] = [
  {
    title: "Dónde da el sol en Barcelona, ahora.",
    text: "El mapa calcula la sombra de cada edificio y las nubes de hoy. Las zonas doradas tienen sol.",
  },
  {
    title: "Mueve la barra para ver otra hora.",
    text: "Abajo tienes el día que queda, desde ahora hasta la puesta de sol, y puedes cambiar de día: mira cómo giran las sombras.",
  },
  {
    title: "Pulsa «Buscar sol/sombra» y te decimos adónde ir.",
    text: "Parques, plazas, playas, terrazas y miradores con sol (o sombra) durante el rato que quieras.",
  },
];

const seen = (): boolean => {
  try {
    return window.localStorage.getItem(KEY) === "1";
  } catch (error) {
    log.warn("no se pudo leer la bienvenida", error);
    return true;
  }
};

/** Guía rápida de 3 pasos la primera vez que se abre la app. Se puede saltar. */
export default function Welcome(): ReactElement | null {
  const [open, setOpen] = useState(() => !seen());
  const [step, setStep] = useState(0);
  if (!open) return null;

  const close = (): void => {
    try {
      window.localStorage.setItem(KEY, "1");
    } catch (error) {
      log.warn("no se pudo recordar la bienvenida", error);
    }
    setOpen(false);
  };
  const s = STEPS[step];
  const last = step === STEPS.length - 1;

  return (
    <div className="pointer-events-auto absolute inset-0 z-[60] flex items-end justify-center bg-ink/25 p-3 backdrop-blur-[2px] sm:items-center" data-testid="welcome-overlay">
      <section className="fts-glass fts-slide-up w-full max-w-[400px] rounded-[28px] p-5 sm:p-6" role="dialog" aria-label="Bienvenida">
        <p className="fts-caps">I Follow the Sun · {step + 1}/{STEPS.length}</p>
        <h2 key={step} className="fts-fade-in mt-2 font-serif text-[26px] leading-[1.1] text-ink">{s.title}</h2>
        <p className="mt-2.5 text-[13px] leading-relaxed text-ink-soft">{s.text}</p>
        <div className="mt-4 flex gap-1.5" aria-hidden>
          {STEPS.map((item, i) => (
            <i key={item.title} className={`block h-1 flex-1 rounded-full ${i <= step ? "bg-sun" : "bg-line"}`} />
          ))}
        </div>
        <div className="mt-5 flex items-center justify-between">
          <button type="button" data-testid="welcome-skip-btn" onClick={close} className="text-[11px] font-semibold text-ink-faint hover:text-ink">
            Saltar
          </button>
          <button
            type="button"
            data-testid="welcome-next-btn"
            onClick={() => (last ? close() : setStep(step + 1))}
            className="rounded-full bg-ink px-5 py-2.5 text-[11px] font-semibold uppercase tracking-[0.16em] text-paper transition-transform active:scale-[0.97]"
          >
            {last ? "Empezar" : "Siguiente"}
          </button>
        </div>
      </section>
    </div>
  );
}
