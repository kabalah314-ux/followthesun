import { useEffect, useRef, useState, useSyncExternalStore } from "react";
import { placeMediaRegistry, type PlaceMediaResult, type PlaceMediaSubject, type PlacePanorama, type PlacePhoto } from "../../lib/placeMedia";
import { cn } from "../../utils/cn";
import { tr } from "../../i18n";

/**
 * La imagen de la ficha (guía maestra 2, «Ficha de lugar inmersiva»): pestañas 3D · Foto · 360°.
 *
 *  · 3D: el propio mapa (vuelo cinematográfico de espaldas al sol). En el móvil, con la hoja
 *    completa, la hoja deja una ventana transparente y el sitio se ve dentro de la ficha.
 *  · Foto y 360°: las pone el módulo de imágenes abiertas (`lib/placeMedia.ts`); mientras no haya
 *    ninguna, un estado amable que lleva al 3D. Siempre con autor, licencia y fuente.
 */

export type MediaTab = "3d" | "photo" | "360";
export const MEDIA_TABS: readonly MediaTab[] = ["3d", "photo", "360"];

const TAB_LABEL: Record<MediaTab, "media.tab_3d" | "media.tab_foto" | "media.tab_360"> = {
  "3d": "media.tab_3d",
  photo: "media.tab_foto",
  "360": "media.tab_360",
};

type MediaState =
  | { status: "unavailable" }
  | { status: "loading" }
  | { status: "ready"; result: PlaceMediaResult }
  | { status: "error" };

const cache = new Map<string, PlaceMediaResult>();

/** Imágenes de un lugar (con caché en memoria); sin módulo de imágenes, «unavailable». */
export function usePlaceMedia(subject: PlaceMediaSubject | null): MediaState {
  const version = useSyncExternalStore(placeMediaRegistry.subscribe, placeMediaRegistry.version, placeMediaRegistry.version);
  const [state, setState] = useState<MediaState>({ status: "unavailable" });
  const id = subject?.id ?? null;
  const subjectRef = useRef(subject);
  subjectRef.current = subject;

  useEffect(() => {
    const loader = placeMediaRegistry.loader();
    const s = subjectRef.current;
    if (!s || !loader) {
      setState({ status: "unavailable" });
      return;
    }
    const hit = cache.get(s.id);
    if (hit) {
      setState({ status: "ready", result: hit });
      return;
    }
    const ctrl = new AbortController();
    setState({ status: "loading" });
    loader(s, ctrl.signal).then(
      (result) => {
        cache.set(s.id, result);
        if (!ctrl.signal.aborted) setState({ status: "ready", result });
      },
      () => {
        if (!ctrl.signal.aborted) setState({ status: "error" });
      }
    );
    return () => ctrl.abort();
  }, [id, version]);

  return state;
}

function Attribution({ a, dark }: { a: PlacePhoto["attribution"]; dark?: boolean }) {
  const text = `${a.author} · ${a.license} · ${a.source}`;
  return (
    <p className={cn("truncate text-[12px] leading-snug", dark ? "text-white/90" : "text-ink-faint")}>
      {a.url ? (
        <a href={a.url} target="_blank" rel="noopener noreferrer" className="underline-offset-2 hover:underline">
          {text}
        </a>
      ) : (
        text
      )}
    </p>
  );
}

function Empty({ text, on3D }: { text: string; on3D(): void }) {
  return (
    <div className="flex aspect-video w-full flex-col items-center justify-center gap-2 rounded-[18px] border border-dashed border-line bg-ink/[0.025] px-6 text-center">
      <svg width="26" height="26" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.4" strokeLinejoin="round" aria-hidden className="text-ink-faint">
        <rect x="3.5" y="5.5" width="17" height="13" rx="2" />
        <circle cx="9" cy="10.5" r="1.6" />
        <path d="M5 17l4.5-4 3 2.5 3-3.5 3.5 5" />
      </svg>
      <p className="text-[13.5px] leading-snug text-ink-soft">{text}</p>
      <button
        type="button"
        onClick={on3D}
        className="min-h-[44px] rounded-full px-3 text-[13.5px] font-semibold text-sun-deep underline-offset-4 outline-none hover:underline focus-visible:ring-2 focus-visible:ring-sun/60"
      >
        {tr("media.ver_en_3d")}
      </button>
    </div>
  );
}

function Panorama({ pano }: { pano: PlacePanorama }) {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const viewer = placeMediaRegistry.viewer();
    const el = ref.current;
    if (!viewer || !el) return;
    return viewer(el, pano);
  }, [pano]);
  return (
    <div>
      <div ref={ref} className="aspect-video w-full overflow-hidden rounded-[18px] bg-ink/10" />
      <div className="mt-1.5">
        <Attribution a={pano.attribution} />
      </div>
    </div>
  );
}

export default function PlaceMedia({
  subject,
  tab,
  onTab,
  variant,
  device,
  on3D,
}: {
  subject: PlaceMediaSubject;
  tab: MediaTab;
  onTab(t: MediaTab): void;
  /** «tabs»: solo las pestañas (la imagen es la ventana al mapa de la hoja completa). */
  variant: "inline" | "tabs";
  device: "mobile" | "desktop";
  /** Ver el sitio en 3D (vuelo; en el móvil la hoja baja para dejarlo a la vista). */
  on3D(): void;
}) {
  const media = usePlaceMedia(subject);
  const photo = media.status === "ready" ? media.result.photo : null;
  const pano = media.status === "ready" ? media.result.panorama : null;

  const tabs = (
    <div role="tablist" aria-label={tr("media.imagen_del_sitio")} className="flex gap-1 rounded-full bg-ink/[0.05] p-1">
      {MEDIA_TABS.map((t) => (
        <button
          key={t}
          type="button"
          role="tab"
          aria-selected={tab === t}
          onClick={() => {
            onTab(t);
            if (t === "3d") on3D();
          }}
          className={cn(
            "h-11 flex-1 rounded-full text-[13.5px] font-semibold outline-none transition-colors focus-visible:ring-2 focus-visible:ring-sun/60",
            tab === t ? "bg-paper text-ink shadow-sm" : "text-ink-soft hover:text-ink"
          )}
        >
          {tr(TAB_LABEL[t])}
        </button>
      ))}
    </div>
  );

  if (variant === "tabs") return tabs;

  return (
    <div>
      {tabs}
      <div className="mt-2.5" role="tabpanel" aria-label={tr(TAB_LABEL[tab])}>
        {tab === "3d" && (
          <div className="flex items-center gap-3 rounded-[18px] bg-ink/[0.035] px-3.5 py-2.5">
            <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.4" strokeLinejoin="round" aria-hidden className="shrink-0 text-sun-deep">
              <path d="M12 3l8 4.5v9L12 21l-8-4.5v-9z" />
              <path d="M12 12l8-4.5M12 12v9M12 12L4 7.5" />
            </svg>
            <p className="min-w-0 flex-1 text-[13.5px] leading-snug text-ink-soft">
              {device === "mobile" ? tr("media.el_3d_esta_en_el_mapa_arriba") : tr("media.el_3d_esta_en_el_mapa_derecha")}
            </p>
            <button
              type="button"
              onClick={on3D}
              className="min-h-[44px] shrink-0 rounded-full px-3 text-[13.5px] font-semibold text-sun-deep outline-none hover:bg-sun-soft focus-visible:ring-2 focus-visible:ring-sun/60"
            >
              {device === "mobile" ? tr("media.ver_en_grande") : tr("media.volar_otra_vez")}
            </button>
          </div>
        )}
        {tab === "photo" &&
          (media.status === "loading" ? (
            <div className="fts-shimmer aspect-video w-full rounded-[18px]" aria-label={tr("media.cargando_la_foto")} />
          ) : photo ? (
            <figure className="relative overflow-hidden rounded-[18px] bg-ink/10">
              <img src={photo.url} alt={photo.alt ?? subject.name} loading="lazy" decoding="async" className="aspect-video w-full object-cover" />
              <figcaption className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/60 to-transparent px-3 pb-2 pt-6">
                <Attribution a={photo.attribution} dark />
              </figcaption>
            </figure>
          ) : (
            <Empty text={tr("media.sin_foto_abierta")} on3D={() => { onTab("3d"); on3D(); }} />
          ))}
        {tab === "360" &&
          (media.status === "loading" ? (
            <div className="fts-shimmer aspect-video w-full rounded-[18px]" />
          ) : pano && placeMediaRegistry.viewer() ? (
            <Panorama pano={pano} />
          ) : (
            <Empty text={tr("media.sin_360")} on3D={() => { onTab("3d"); on3D(); }} />
          ))}
      </div>
    </div>
  );
}
