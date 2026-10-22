import { useEffect, useState } from "react";
import { tr } from "../../i18n";

/**
 * Aviso de «tu vídeo del día está listo»: compartir (menú del sistema, con el toque de la persona,
 * que es lo que exigen los navegadores) o guardar el archivo.
 */
export default function VideoReady({ file, onClose }: { file: File | null; onClose(): void }) {
  const [url, setUrl] = useState<string | null>(null);
  useEffect(() => {
    if (!file) {
      setUrl(null);
      return;
    }
    const u = URL.createObjectURL(file);
    setUrl(u);
    return () => URL.revokeObjectURL(u);
  }, [file]);

  if (!file || !url) return null;
  let canShare = false;
  try {
    canShare = typeof navigator.canShare === "function" && navigator.canShare({ files: [file] });
  } catch {
    canShare = false;
  }
  const share = async () => {
    try {
      await navigator.share({ files: [file], title: "I Follow the Sun" });
      onClose();
    } catch {
      /* cancelado o no permitido: queda «Guardar» */
    }
  };

  return (
    <div className="pointer-events-none absolute inset-x-0 top-24 z-40 flex justify-center px-4 sm:top-28">
      <div
        role="dialog"
        aria-label={tr("dayVideo.listo")}
        className="fts-glass fts-slide-up pointer-events-auto flex items-center gap-1.5 rounded-full py-1.5 pl-4 pr-1.5 text-[13px] font-medium text-ink"
      >
        <span className="pr-1">{tr("dayVideo.listo")}</span>
        {canShare && (
          <button
            type="button"
            onClick={share}
            className="min-h-[40px] rounded-full bg-sun px-3.5 text-[13px] font-semibold text-ink outline-none focus-visible:ring-2 focus-visible:ring-sun-deep/60"
          >
            {tr("dayVideo.compartir")}
          </button>
        )}
        <a
          href={url}
          download={file.name}
          onClick={() => window.setTimeout(onClose, 800)}
          className="inline-flex min-h-[40px] items-center rounded-full px-3.5 text-[13px] font-semibold text-ink outline-none hover:bg-ink/[0.05] focus-visible:ring-2 focus-visible:ring-sun/60"
        >
          {tr("dayVideo.guardar")}
        </a>
        <button
          type="button"
          onClick={onClose}
          aria-label={tr("dayVideo.cerrar")}
          className="flex h-10 w-10 items-center justify-center rounded-full text-ink-soft outline-none hover:bg-ink/[0.05] focus-visible:ring-2 focus-visible:ring-sun/60"
        >
          <svg width="12" height="12" viewBox="0 0 12 12" aria-hidden>
            <path d="M2 2l8 8M10 2l-8 8" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
          </svg>
        </button>
      </div>
    </div>
  );
}
