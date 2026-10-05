import { useEffect, useState } from "react";
import { cn } from "../utils/cn";
import { LogoMark, Wordmark } from "./Logo";

/** Pantalla de bienvenida que se disuelve cuando el mapa está listo. */
export default function Splash({ visible }: { visible: boolean }) {
  const [mounted, setMounted] = useState(true);

  useEffect(() => {
    if (visible) return;
    const t = window.setTimeout(() => setMounted(false), 1400);
    return () => window.clearTimeout(t);
  }, [visible]);

  if (!mounted) return null;

  return (
    <div
      className={cn(
        "fixed inset-0 z-50 flex flex-col items-center justify-center bg-paper transition-opacity duration-[1200ms] ease-out",
        visible ? "opacity-100" : "pointer-events-none opacity-0"
      )}
    >
      <div className={cn("transition-all duration-[1200ms]", visible ? "scale-100" : "scale-[1.06]")}>
        <LogoMark size={84} animate className="mx-auto text-ink" />
        <h1 className="mt-8 pl-[0.5em] text-center text-[15px] font-semibold tracking-[0.5em] text-ink sm:text-[19px]">
          <Wordmark />
        </h1>
        <p className="mt-3 text-center font-serif text-[15px] italic text-ink-soft">Barcelona</p>
        <div className="mx-auto mt-10 h-px w-28 overflow-hidden bg-line">
          <div className="fts-loadbar h-full w-1/3 bg-sun" />
        </div>
      </div>
    </div>
  );
}
