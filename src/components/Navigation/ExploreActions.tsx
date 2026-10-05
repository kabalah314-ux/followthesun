/**
 * Acciones inmediatas de Explorar. No importa el planificador completo: la búsqueda y sus datos se
 * descargan solo cuando la persona elige una acción.
 */
export default function ExploreActions({
  onFind,
  onOneHour,
}: {
  onFind(): void;
  onOneHour(): void;
}) {
  return (
    <div className="flex items-center justify-center gap-2.5">
      <button
        type="button"
        onClick={onFind}
        className="fts-cta group inline-flex items-center gap-3 rounded-full bg-ink px-6 py-3.5 text-[11px] font-semibold uppercase tracking-[0.31em] text-paper transition-all duration-400 hover:-translate-y-0.5 active:scale-[0.98] sm:px-8 sm:py-4 sm:text-[12px]"
      >
        <span className="relative flex h-5 w-5 items-center justify-center">
          <span className="fts-breathe absolute inset-0 rounded-full bg-[#ffb94d]/50 blur-[7px]" />
          <span className="relative h-[9px] w-[9px] rounded-full bg-[#ffc45e]" />
        </span>
        <span className="pl-[0.2em]">Find the Sun</span>
      </button>
      <button
        type="button"
        onClick={onOneHour}
        className="fts-glass hidden rounded-full px-4 py-3.5 text-[11px] font-medium text-ink transition-all duration-300 hover:-translate-y-0.5 hover:bg-ink/[0.05] active:scale-[0.97] sm:block"
      >
        1 h de sol
      </button>
    </div>
  );
}