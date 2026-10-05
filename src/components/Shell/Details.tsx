import { Suspense, lazy, type ComponentProps } from "react";
import { PANEL_SUSPENSE } from "../SectionPanel";

const SunDetails = lazy(() => import("../FindSun/SunDetails"));
const PointPanel = lazy(() => import("../PointPanel"));

export type ResultDetailsProps = Omit<ComponentProps<typeof SunDetails>, "className">;
export type PointDetailsProps = Omit<ComponentProps<typeof PointPanel>, "className">;

/** Detalle de un resultado de búsqueda (carga diferida). */
export function ResultDetails({ details, className }: { details: ResultDetailsProps; className?: string }) {
  return (
    <Suspense fallback={PANEL_SUSPENSE}>
      <SunDetails key={details.result.placeId} {...details} className={className} />
    </Suspense>
  );
}

/** Información solar del punto tocado en el mapa (carga diferida). */
export function PointDetails({ point, className }: { point: PointDetailsProps; className?: string }) {
  return (
    <Suspense fallback={PANEL_SUSPENSE}>
      <PointPanel key={point.point.id} {...point} className={className} />
    </Suspense>
  );
}
