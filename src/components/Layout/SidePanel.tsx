import type { CSSProperties, ReactNode } from "react";

/**
 * Escritorio y tableta: un único panel flotante a la izquierda con el mismo contenido que la hoja
 * del móvil (la ficha sustituye a la lista dentro del panel; no hay segundo panel).
 */
export default function SidePanel({
  label,
  width,
  top,
  children,
  style,
}: {
  label: string;
  width: number;
  /** Cabecera fija (marca, destinos, buscador y chips). */
  top: ReactNode;
  children: ReactNode;
  style?: CSSProperties;
}) {
  return (
    <aside
      aria-label={label}
      className="fts-glass fts-panel-left pointer-events-auto absolute bottom-3 left-3 top-3 z-20 flex flex-col overflow-hidden rounded-[26px]"
      style={{ width, ...style }}
    >
      <div className="shrink-0 px-4 pt-4">{top}</div>
      <div className="fts-scroll-y min-h-0 flex-1 overflow-y-auto overscroll-contain px-5 pb-6 pt-2">{children}</div>
    </aside>
  );
}
