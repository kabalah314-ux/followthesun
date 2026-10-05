/**
 * Acciones de Explorar: una acción principal («Buscar sol cerca de mí») y el modo sombra.
 * La búsqueda y sus datos se descargan solo cuando la persona elige una acción.
 */
export default function ExploreActions({
  onFind,
  onShade,
}: {
  onFind(): void;
  onShade(): void;
}) {
  return (
    <div className="flex items-center justify-center gap-2.5">
      <button
        type="button"
        data-testid="explore-find-sun-btn"
        onClick={onFind}
        className="fts-cta group pointer-events-auto inline-flex items-center gap-3 whitespace-nowrap rounded-full bg-ink px-5 py-3.5 text-[11px] font-semibold uppercase tracking-[0.2em] text-paper transition-all duration-400 hover:-translate-y-0.5 active:scale-[0.98] sm:px-8 sm:py-4 sm:text-[12px]"
      >
        <span className="relative flex h-5 w-5 items-center justify-center">
          <span className="fts-breathe absolute inset-0 rounded-full bg-[#ffb94d]/50 blur-[7px]" />
          <span className="relative h-[9px] w-[9px] rounded-full bg-[#ffc45e]" />
        </span>
        <span>Buscar sol/sombra<span className="hidden sm:inline"> cerca de mí</span></span>
      </button>
      <button
        type="button"
        data-testid="explore-find-shade-btn"
        onClick={onShade}
        title="Sitios a la sombra durante 1 hora"
        className="fts-glass pointer-events-auto whitespace-nowrap rounded-full px-3.5 py-3.5 sm:px-4 text-[11px] font-medium text-ink transition-all duration-300 hover:-translate-y-0.5 hover:bg-ink/[0.05] active:scale-[0.97]"
      >
        <span className="sm:hidden">Sombra</span>
        <span className="hidden sm:inline">Busco sombra</span>
      </button>
    </div>
  );
}
