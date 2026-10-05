import { useMemo, useState } from "react";
import { BARCELONA_PLACES } from "../../data/barcelonaPlaces";
import { PLACE_TYPE_LABEL, PLACE_TYPE_ORDER } from "../../lib/placeTypes";
import type { SunPlace, SunPlaceType } from "../../types";
import { ArrowRightIcon, CloseIcon, ShuffleIcon, StarIcon } from "../Navigation/NavIcons";
import { Caps } from "../FindSun/ui";

/** Sitios que se muestran por categoría en cada sorteo. */
const PER_CATEGORY = 9;

const BY_TYPE: Record<SunPlaceType, SunPlace[]> = BARCELONA_PLACES.reduce(
  (acc, place) => {
    acc[place.type].push(place);
    return acc;
  },
  {
    beach: [],
    park: [],
    square: [],
    terrace: [],
    viewpoint: [],
    open_space: [],
  } as Record<SunPlaceType, SunPlace[]>
);

type Picks = Record<SunPlaceType, SunPlace[]>;

/** Fisher-Yates sobre una copia: cada sorteo reparte los sitios sin repetir dentro de la categoría. */
function shuffle<T>(items: T[]): T[] {
  const out = [...items];
  for (let i = out.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    const tmp = out[i];
    out[i] = out[j];
    out[j] = tmp;
  }
  return out;
}

function draw(): Picks {
  const picks = {} as Picks;
  for (const type of PLACE_TYPE_ORDER) picks[type] = shuffle(BY_TYPE[type]).slice(0, PER_CATEGORY);
  return picks;
}

interface Props {
  onSelect(place: SunPlace): void;
  onClose(): void;
}

/**
 * Selección recomendada, agrupada por categoría (playas, parques, plazas…) con 9 sitios por tipo.
 * Los sitios salen siempre del inventario curado (`barcelonaPlaces`) y el sorteo se renueva con
 * «Otros sitios»: no depende de la red ni del inventario de OpenStreetMap.
 */
export default function RecommendedPanel({ onSelect, onClose }: Props) {
  const [picks, setPicks] = useState<Picks>(() => draw());

  const categories = useMemo(
    () => PLACE_TYPE_ORDER.map((type) => ({ type, places: picks[type] })).filter((c) => c.places.length > 0),
    [picks]
  );
  const total = useMemo(() => PLACE_TYPE_ORDER.reduce((n, t) => n + BY_TYPE[t].length, 0), []);

  return (
    <section className="fts-glass fts-context-panel fts-slide-in">
      <div className="fts-section-head">
        <div className="flex min-w-0 items-center gap-2.5">
          <StarIcon className="h-[19px] w-[19px] shrink-0 text-sun-deep" />
          <div className="min-w-0">
            <Caps>Nuestra selección</Caps>
            <h2 className="mt-1 font-serif text-[23px] leading-none text-ink">Recomendados</h2>
          </div>
        </div>
        <button type="button" aria-label="Cerrar" onClick={onClose} className="fts-close-button">
          <CloseIcon className="h-4 w-4" />
        </button>
      </div>

      <p className="mt-3 text-[12px] leading-relaxed text-ink-soft">
        {PER_CATEGORY} sitios por categoría, sorteados de entre los {total} de Barcelona. Elige uno
        para verlo en el mapa y comprobar cuándo recibe luz.
      </p>

      <button
        type="button"
        onClick={() => setPicks(draw())}
        className="fts-glass mt-3.5 flex w-full items-center justify-center gap-2 rounded-full border border-line bg-ink/[0.03] px-4 py-2.5 text-[11px] font-semibold uppercase tracking-[0.18em] text-ink transition-all duration-300 hover:bg-ink/[0.07] active:scale-[0.98]"
      >
        <ShuffleIcon className="h-[15px] w-[15px] text-sun-deep" />
        Otros sitios
      </button>

      <div className="fts-scroll-y mt-3 max-h-[min(52dvh,520px)] overflow-y-auto pr-1">
        {categories.map(({ type, places }) => (
          <section key={type} className="border-t border-line pt-3 first:border-0 first:pt-0">
            <div className="flex items-baseline justify-between gap-2 px-1">
              <h3 className="fts-caps !text-[9px] text-ink-soft">{PLACE_TYPE_LABEL[type].plural}</h3>
              <span className="text-[10px] font-medium text-ink-faint">
                {places.length} de {BY_TYPE[type].length}
              </span>
            </div>
            <ul className="mt-1 divide-y divide-line">
              {places.map((p) => {
                const barrio = p.metadata?.barrio as string | undefined;
                const tip = p.metadata?.tip as string | undefined;
                return (
                  <li key={p.id}>
                    <button type="button" onClick={() => onSelect(p)} className="fts-place-row group">
                      <span className="min-w-0 flex-1">
                        <span className="block truncate text-[13px] font-medium text-ink">{p.name}</span>
                        <span className="mt-1 block truncate text-[10px] font-medium uppercase tracking-[0.14em] text-ink-faint">
                          {barrio ?? PLACE_TYPE_LABEL[type].singular}
                          {tip ? ` · ${tip}` : ""}
                        </span>
                      </span>
                      <ArrowRightIcon className="h-4 w-4 shrink-0 text-ink-faint transition-transform group-hover:translate-x-0.5" />
                    </button>
                  </li>
                );
              })}
            </ul>
          </section>
        ))}
      </div>

      <div className="mt-3 flex items-center justify-between border-t border-line pt-3 text-[10px] text-ink-faint">
        <span>Selección propia · {BARCELONA_PLACES.length} sitios</span>
        <span>Cada visita, otra lista</span>
      </div>
    </section>
  );
}
