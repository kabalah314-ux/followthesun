import { useEffect } from "react";

export default function Toast({ message, onDone }: { message: string | null; onDone(): void }) {
  useEffect(() => {
    if (!message) return;
    const t = window.setTimeout(onDone, 4200);
    return () => window.clearTimeout(t);
  }, [message, onDone]);

  if (!message) return null;
  return (
    <div className="pointer-events-none absolute inset-x-0 top-24 z-40 flex justify-center px-4 sm:top-28">
      <div
        role="status"
        className="fts-glass fts-slide-up rounded-full px-5 py-3 text-[12px] font-medium tracking-wide text-ink"
      >
        {message}
      </div>
    </div>
  );
}
