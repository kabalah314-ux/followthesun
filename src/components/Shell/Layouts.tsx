import type { ReactNode } from "react";
import { PlacesIcon, StarIcon } from "../Navigation/NavIcons";
import { PointDetails, ResultDetails, type PointDetailsProps, type ResultDetailsProps } from "./Details";

const ABOVE_NAV = "bottom-[calc(82px+env(safe-area-inset-bottom))]";

interface SheetProps {
  details: ResultDetailsProps | null;
  searchPanel: ReactNode | null;
  sectionPanel: ReactNode | null;
  point: PointDetailsProps | null;
  /** Línea de tiempo bajo el punto (solo en Explorar). */
  pointTimeline: ReactNode | null;
}

/** Panel inferior del móvil: detalle, búsqueda, sección o punto (en ese orden de prioridad). */
export function MobileSheet({ details, searchPanel, sectionPanel, point, pointTimeline }: SheetProps) {
  const content = details ? (
    <ResultDetails details={details} className="max-h-[58dvh] w-full" />
  ) : searchPanel ? (
    searchPanel
  ) : sectionPanel ? (
    sectionPanel
  ) : point ? (
    <div className="flex w-full flex-col gap-2">
      <PointDetails point={point} className="w-full" />
      {pointTimeline}
    </div>
  ) : null;
  if (!content) return null;
  return (
    <div className={`pointer-events-none absolute inset-x-3 ${ABOVE_NAV} z-30 flex max-h-[58dvh] justify-center`}>
      <div className="pointer-events-auto w-full max-w-[440px] overflow-y-auto fts-scroll-y">{content}</div>
    </div>
  );
}

/** Explorar en móvil: acción principal + acceso a Sitios y Recomendados, y la línea de tiempo encima. */
export function MobileExploreBar({
  actions,
  timeline,
  onPlaces,
  onRecommended,
}: {
  actions: ReactNode;
  timeline: ReactNode;
  onPlaces(): void;
  onRecommended(): void;
}) {
  return (
    <>
      <div className={`pointer-events-none absolute inset-x-0 ${ABOVE_NAV} z-20 flex justify-center px-3`}>
        <div className="pointer-events-auto flex w-full max-w-[520px] items-center justify-center gap-2">
          <div className="pointer-events-none min-w-0 flex-1 overflow-hidden">{actions}</div>
          <div className="flex shrink-0 gap-2">
            <button
              type="button"
              aria-label="Ver sitios recomendados"
              data-testid="mobile-recommended-btn"
              onClick={onRecommended}
              className="fts-glass flex h-11 w-11 shrink-0 items-center justify-center rounded-full text-sun-deep transition-transform active:scale-95"
            >
              <StarIcon className="h-[18px] w-[18px]" />
            </button>
            <button
              type="button"
              aria-label="Ver sitios de Barcelona"
              data-testid="mobile-places-btn"
              onClick={onPlaces}
              className="fts-glass flex h-11 w-11 shrink-0 items-center justify-center rounded-full text-sun-deep transition-transform active:scale-95"
            >
              <PlacesIcon className="h-[18px] w-[18px]" />
            </button>
          </div>
        </div>
      </div>
      <div
        className="pointer-events-none absolute inset-x-0 z-20 flex justify-center px-3"
        style={{ bottom: "calc(140px + env(safe-area-inset-bottom))" }}
      >
        <div className="pointer-events-auto w-full max-w-[620px]">{timeline}</div>
      </div>
    </>
  );
}

/** Explorar en escritorio: acción principal y línea de tiempo, a la derecha del menú lateral. */
export function DesktopExploreBar({ actions, timeline, panelLeft }: { actions: ReactNode; timeline: ReactNode; panelLeft: number }) {
  return (
    <div
      className="pointer-events-none absolute inset-x-0 bottom-0 z-20 flex flex-col items-center gap-3 pb-2 pr-6"
      style={{ paddingLeft: panelLeft }}
    >
      <div className="pointer-events-auto flex w-full max-w-[880px] items-center justify-center gap-3">
        <div className="pointer-events-none">{actions}</div>
      </div>
      <div className="pointer-events-auto w-full max-w-[880px]">{timeline}</div>
    </div>
  );
}

interface DesktopPanelsProps {
  panelLeft: number;
  searchPanel: ReactNode | null;
  sectionPanel: ReactNode | null;
  details: ResultDetailsProps | null;
  point: PointDetailsProps | null;
}

/** Paneles contextuales de escritorio: búsqueda o sección a la izquierda, detalle a la derecha. */
export function DesktopPanels({ panelLeft, searchPanel, sectionPanel, details, point }: DesktopPanelsProps) {
  return (
    <>
      {searchPanel && (
        <div
          className="pointer-events-none absolute top-[88px] z-30 w-[min(405px,calc(100vw-110px))]"
          style={{ left: `${panelLeft}px`, bottom: 112 }}
        >
          <div className="fts-scroll-y pointer-events-auto h-full overflow-y-auto pr-1">{searchPanel}</div>
        </div>
      )}
      {sectionPanel && (
        <div className="pointer-events-none absolute top-[88px] z-30" style={{ left: `${panelLeft}px` }}>
          <div className="pointer-events-auto">{sectionPanel}</div>
        </div>
      )}
      {(details || point) && (
        <div className="pointer-events-none absolute right-[92px] top-[116px] z-10">
          <div className="pointer-events-auto">
            {details ? (
              <ResultDetails details={details} className="max-h-[calc(100dvh-116px-250px)]" />
            ) : point ? (
              <PointDetails point={point} />
            ) : null}
          </div>
        </div>
      )}
    </>
  );
}
