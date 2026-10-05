import { Suspense, lazy } from "react";
import type { AppView } from "./Navigation/viewTypes";
import type { LightSourceState } from "../hooks/useLightSource";
import type { PlaceInventoryStatus, SavedPlace, SunPlace } from "../types";

const AboutPanel = lazy(() => import("./Sections/AboutPanel"));
const PlacesPanel = lazy(() => import("./Sections/PlacesPanel"));
const RecommendedPanel = lazy(() => import("./Sections/RecommendedPanel"));
const SavedPanel = lazy(() => import("./Sections/SavedPanel"));
const SettingsPanel = lazy(() => import("./Sections/SettingsPanel"));

export const PANEL_SUSPENSE = (
  <div className="fts-glass w-[min(calc(100vw-1.5rem),370px)] rounded-[24px] p-4" aria-busy="true">
    <div className="fts-shimmer h-5 w-32 rounded-full" />
    <div className="fts-shimmer mt-3 h-10 w-full rounded-2xl" />
  </div>
);

export const isSectionView = (view: AppView) =>
  view === "places" ||
  view === "recommended" ||
  view === "saved" ||
  view === "settings" ||
  view === "about";

interface Props {
  view: AppView;
  light: LightSourceState;
  inventory: PlaceInventoryStatus;
  saved: SavedPlace[];
  onSelectPlace(p: SunPlace): void;
  onSelectSaved(p: SavedPlace): void;
  onRemoveSaved(p: SavedPlace): void;
  onNavigate(view: AppView): void;
}

/** Paneles de sección (Sitios, Recomendados, Favoritos, Ajustes, Acerca de): mismos en móvil y escritorio. */
export default function SectionPanel({ view, light, inventory, saved, onSelectPlace, onSelectSaved, onRemoveSaved, onNavigate }: Props) {
  const close = () => onNavigate("explore");
  const panel =
    view === "places" ? (
      <PlacesPanel inventory={inventory} onSelect={onSelectPlace} onClose={close} />
    ) : view === "recommended" ? (
      <RecommendedPanel onSelect={onSelectPlace} onClose={close} />
    ) : view === "saved" ? (
      <SavedPanel saved={saved} onSelect={onSelectSaved} onRemove={onRemoveSaved} onClose={close} />
    ) : view === "settings" ? (
      <SettingsPanel light={light} onClose={close} onAbout={() => onNavigate("about")} />
    ) : view === "about" ? (
      <AboutPanel light={light} onClose={close} />
    ) : null;
  return panel ? <Suspense fallback={PANEL_SUSPENSE}>{panel}</Suspense> : null;
}
