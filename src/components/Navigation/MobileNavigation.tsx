import { cn } from "../../utils/cn";
import { ExploreIcon, FindIcon, PlanIcon, SavedIcon } from "./NavIcons";
import type { AppView } from "./viewTypes";

type MobileTab = "explore" | "find" | "plan" | "saved";

const ITEMS = [
  { id: "explore" as const, label: "Mapa", icon: ExploreIcon },
  { id: "find" as const, label: "Sol/sombra", icon: FindIcon },
  { id: "plan" as const, label: "Planificar", icon: PlanIcon },
  { id: "saved" as const, label: "Favoritos", icon: SavedIcon },
];

export function mobileTabFor(view: AppView): MobileTab {
  // En móvil hay cuatro acciones principales. Lugares y Recomendados se abren desde Explorar;
  // ajustes y acerca de también son secundarios y vuelven al mapa.
  return view === "places" || view === "recommended" || view === "settings" || view === "about"
    ? "explore"
    : view;
}

/** Cuatro acciones principales; el mapa permanece como fondo en todas. */
export default function MobileNavigation({
  view,
  onNavigate,
}: {
  view: AppView;
  onNavigate(view: MobileTab): void;
}) {
  const active = mobileTabFor(view);
  return (
    <nav
      aria-label="Navegación principal"
      className="fts-glass fts-mobile-nav fixed inset-x-3 bottom-[max(10px,env(safe-area-inset-bottom))] z-40 grid grid-cols-4 rounded-[23px] p-1.5 md:hidden"
    >
      {ITEMS.map(({ id, label, icon: Icon }) => (
        <button
          key={id}
          type="button"
          aria-current={active === id ? "page" : undefined}
          aria-label={label}
          onClick={() => onNavigate(id)}
          className={cn(
            "relative flex min-h-[52px] flex-col items-center justify-center gap-1 rounded-[17px] transition-all duration-300",
            active === id ? "bg-ink/[0.07] text-ink" : "text-ink-faint hover:text-ink"
          )}
        >
          {active === id && <i className="absolute top-1.5 h-[2px] w-5 rounded-full bg-sun" />}
          <Icon className={cn("h-[19px] w-[19px]", active === id && "text-sun-deep")} />
          <span className="text-[9px] font-semibold tracking-[0.02em]">{label}</span>
        </button>
      ))}
    </nav>
  );
}