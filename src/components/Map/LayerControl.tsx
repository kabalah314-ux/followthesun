import { useEffect, useRef, type CSSProperties, type ReactNode } from "react";
import { SUN_RAMP_CSS } from "../../engine/layers/SolarHeatmap";
import type { QualityLevel, QualityState } from "../../graphics/quality";
import { useQuality } from "../../graphics/useQuality";
import type { GraphicsQualityPreference, Preferences } from "../../lib/preferences";
import { Caps, Segmented, Switch } from "../FindSun/ui";
import { tr } from "../../i18n";

type LayerKey =
  | "satelliteView"
  | "showBuildings"
  | "buildings3D"
  | "showShadows"
  | "showClouds"
  | "showSunPath";

const dot = (cls: string, style?: CSSProperties) => (
  <i className={`block h-[9px] w-[9px] rounded-full ${cls}`} style={style} />
);

const SatelliteIcon = () => (
  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" className="text-ink-soft" aria-hidden>
    <rect x="3.5" y="5" width="17" height="14" rx="2" />
    <circle cx="9" cy="10" r="1.6" />
    <path d="M4.5 17l4.5-4.5 3.5 3.5 3-2.5 4 3.5" />
  </svg>
);

const CubeIcon = () => (
  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinejoin="round" className="text-ink-soft" aria-hidden>
    <path d="M12 3l8 4.5v9L12 21l-8-4.5v-9L12 3z" />
    <path d="M4 7.5l8 4.5 8-4.5M12 12v9" />
  </svg>
);

const LAYERS: Array<{ key: LayerKey; label: string; hint: string; swatch: ReactNode }> = [
  {
    // Ortofoto del ICGC (hasta zoom 20, CC BY 4.0).
    key: "satelliteView",
    label: tr("layerControl.vista_real"),
    hint: tr("layerControl.ortofoto_del_icgc_con"),
    swatch: <SatelliteIcon />,
  },
  { key: "showBuildings", label: tr("searchProgress.edificios"), hint: tr("layerControl.huellas_de_los_edificios"), swatch: dot("border border-ink/30 bg-ink/10") },
  { key: "buildings3D", label: tr("layerControl.relieve_3d"), hint: tr("layerControl.al_acercarte_los_edificios_con"), swatch: <CubeIcon /> },
  { key: "showShadows", label: tr("sunDetails.sombra_urbana"), hint: tr("layerControl.sombra_de_los_edificios_calle"), swatch: dot("bg-shade/80") },
  { key: "showClouds", label: tr("sunDetails.nubes"), hint: tr("layerControl.lo_que_las_nubes_tapan"), swatch: dot("bg-ink/30") },
  {
    key: "showSunPath",
    label: tr("layerControl.trayectoria_del_sol"),
    hint: tr("layerControl.el_recorrido_del_sol_hoy"),
    swatch: (
      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" aria-hidden>
        <path d="M4 18a8 8 0 0 1 16 0" stroke="var(--sun-deep)" strokeWidth="2" strokeDasharray="2 3" strokeLinecap="round" />
      </svg>
    ),
  },
];

/** Leyenda de la luz: escala de intensidad del sol + nubes + sombra. */
export function SunLegend() {
  return (
    <div>
      <div className="h-[10px] w-full rounded-full ring-1 ring-ink/10" style={{ background: SUN_RAMP_CSS }} />
      <div className="mt-1.5 flex justify-between text-[12px] text-ink-soft">
        <span>{tr("layerControl.sol_suave")}</span>
        <span>{tr("layerControl.sol_fuerte")}</span>
      </div>
      <div className="mt-2 flex flex-wrap gap-x-3.5 gap-y-1.5 text-[12px] text-ink-soft">
        <span className="flex items-center gap-1.5">{dot("", { background: "#c9ced6" })}{tr("sunDetails.nubes")}</span>
        <span className="flex items-center gap-1.5">{dot("", { background: "#24345e" })}{tr("findSunPanel.sombra")}</span>
      </div>
    </div>
  );
}

const QUALITY_LABEL: Record<QualityLevel, string> = {
  alta: tr("layerControl.calidad_alta"),
  media: tr("layerControl.calidad_media"),
  ahorro: tr("layerControl.calidad_ahorro"),
};

const QUALITY_HINT: Record<QualityLevel, string> = {
  alta: tr("layerControl.calidad_hint_alta"),
  media: tr("layerControl.calidad_hint_media"),
  ahorro: tr("layerControl.calidad_hint_ahorro"),
};

/** Una línea que explica el nivel en uso (y por qué, si bajó solo). */
function qualityHint(q: QualityState): string {
  if (q.reason === "gl-error") return tr("layerControl.calidad_sin_gpu");
  if (q.reason === "fps") return tr("layerControl.calidad_reducida_por_fluidez");
  if (q.preference === "auto") {
    return `${tr("layerControl.calidad_automatica_ahora", { p0: QUALITY_LABEL[q.level].toLowerCase() })} · ${QUALITY_HINT[q.level]}`;
  }
  return QUALITY_HINT[q.level];
}

/** Con `?debug`: cómo se está dibujando (para soporte y pruebas en previsualizaciones). */
const SHOW_DEBUG = (() => {
  try {
    return new URLSearchParams(window.location.search).has("debug");
  } catch {
    return false;
  }
})();

function debugLine(q: QualityState): string {
  const c = q.capabilities;
  const parts = [
    q.settings.webgl ? "GPU" : "canvas",
    q.level,
    q.reason,
    c?.gpuMs != null ? `${c.gpuMs} ms` : null,
    c?.maxSamples != null ? `MSAA ${c.maxSamples}` : null,
    c?.renderer || null,
    q.lastError,
  ];
  return parts.filter(Boolean).join(" · ");
}

/** Calidad gráfica: Auto (según el dispositivo), Alta, Media o Ahorro. */
function QualityPicker({ value, onChange }: { value: GraphicsQualityPreference; onChange(v: GraphicsQualityPreference): void }) {
  const q = useQuality();
  return (
    <div className="mx-2 mt-2 border-t border-line pt-2.5">
      <Caps className="mb-2">{tr("layerControl.calidad_grafica")}</Caps>
      <Segmented<GraphicsQualityPreference>
        value={value}
        label={tr("layerControl.calidad_grafica")}
        onChange={onChange}
        options={[
          { id: "auto", label: tr("layerControl.calidad_auto") },
          { id: "alta", label: QUALITY_LABEL.alta },
          { id: "media", label: QUALITY_LABEL.media },
          { id: "ahorro", label: QUALITY_LABEL.ahorro },
        ]}
      />
      <p className="mt-1.5 text-[12px] leading-snug text-ink-faint">{qualityHint(q)}</p>
      {SHOW_DEBUG && <p className="mt-1 break-words font-mono text-[11px] leading-snug text-ink-faint">{debugLine(q)}</p>}
    </div>
  );
}

interface Props {
  prefs: Preferences;
  onChange(patch: Partial<Preferences>): void;
  onClose(): void;
}

/**
 * Capas del mapa: solo aparecen cuando se piden. Incluye la leyenda de la luz, para que nadie tenga
 * que adivinar qué significa cada tono.
 */
export default function LayerControl({ prefs, onChange, onClose }: Props) {
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const onDown = (e: PointerEvent) => {
      const target = e.target as HTMLElement;
      if (ref.current?.contains(target) || target.closest("[data-layers-toggle]")) return;
      onClose();
    };
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("pointerdown", onDown);
    window.addEventListener("keydown", onKey);
    return () => {
      window.removeEventListener("pointerdown", onDown);
      window.removeEventListener("keydown", onKey);
    };
  }, [onClose]);

  return (
    <div ref={ref} role="dialog" aria-label={tr("layerControl.capas_del_mapa")} className="fts-glass fts-pop-in w-[280px] rounded-[22px] p-3">
      <Caps className="px-2 pb-1 pt-1">{tr("layerControl.mapa")}</Caps>
      {LAYERS.map((l) => {
        const disabled = l.key === "buildings3D" && !prefs.showBuildings;
        return (
          <div key={l.key} className={disabled ? "pointer-events-none opacity-40" : undefined}>
            <Switch
              checked={prefs[l.key]}
              onChange={(v) => onChange({ [l.key]: v } as Partial<Preferences>)}
              label={l.label}
              hint={l.hint}
              swatch={l.swatch}
            />
          </div>
        );
      })}
      <QualityPicker value={prefs.graphicsQuality ?? "auto"} onChange={(v) => onChange({ graphicsQuality: v })} />
      <div className="mx-2 mt-2 border-t border-line pt-2.5">
        <Caps className="mb-2">{tr("layerControl.luz_del_sol")}</Caps>
        <SunLegend />
      </div>
    </div>
  );
}
