import type { ReactNode } from "react";
import type { SunAnswer } from "../../lib/answer";
import { SunGlyph } from "../Icons";

/**
 * La frase-respuesta que se ve con la hoja asomada: de tu zona, de la búsqueda en curso o del sitio
 * elegido. Grande y corta, para leerla sin abrir nada.
 */
export default function SheetAnswer({
  answer,
  timeLabel,
  aside,
}: {
  answer: SunAnswer;
  /** «Ahora · 17:42» o «Mañana · 11:00». */
  timeLabel?: string;
  aside?: ReactNode;
}) {
  return (
    <div className="flex items-start gap-3">
      <SunGlyph state={answer.state} size={30} className="mt-0.5 shrink-0" />
      <div className="min-w-0 flex-1" aria-live="polite">
        {timeLabel && <p className="fts-caps !text-[11.5px]">{timeLabel}</p>}
        <p className="mt-0.5 text-[16.5px] font-semibold leading-snug text-ink">{answer.headline}</p>
        {answer.detail && <p className="mt-0.5 line-clamp-1 text-[13.5px] leading-snug text-ink-soft">{answer.detail}</p>}
      </div>
      {aside}
    </div>
  );
}
