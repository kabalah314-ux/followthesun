import { useMemo, useState, useSyncExternalStore, type ReactNode } from "react";
import { cloudService } from "../services/cloudService";
import { lightFusionService } from "../services/lightFusionService";
import { formatAge, formatClock } from "../services/timeService";
import type { LightSourceMode } from "../types";
import { cn } from "../utils/cn";
import { useNow } from "../hooks/useNow";

/**
 * Módulo de validación (`?debug=weather`). No es para el usuario final: sirve para calibrar el
 * sistema comparando, en un punto y un instante, lo que dicen el modelo y el satélite y por qué la
 * fusión llegó a su conclusión.
 */

interface Props {
  latitude: number;
  longitude: number;
  time: number;
  source: LightSourceMode;
  onSourceChange(mode: LightSourceMode): void;
}

const f = (v: number | null | undefined, d = 2) =>
  v === null || v === undefined || !Number.isFinite(v) ? "—" : v.toFixed(d);
const pct = (v: number | null | undefined) =>
  v === null || v === undefined || !Number.isFinite(v) ? "—" : `${Math.round(v * 100)} %`;
const wm2 = (v: number | null | undefined) =>
  v === null || v === undefined || !Number.isFinite(v) ? "—" : `${Math.round(v)} W/m²`;

function Section({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section className="border-t border-white/10 pt-2.5">
      <h3 className="mb-1.5 text-[9px] font-bold uppercase tracking-[0.22em] text-amber-300/90">{title}</h3>
      <div className="space-y-0.5">{children}</div>
    </section>
  );
}

function L({ k, v }: { k: string; v: ReactNode }) {
  return (
    <div className="flex justify-between gap-3">
      <span className="text-white/45">{k}</span>
      <span className="text-right text-white/90">{v}</span>
    </div>
  );
}

function Big({ label, value, tone }: { label: string; value: number | null; tone: string }) {
  return (
    <div className="flex-1 rounded-lg bg-white/[0.06] px-2.5 py-2 text-center">
      <p className="text-[8.5px] font-bold uppercase tracking-[0.18em] text-white/45">{label}</p>
      <p className={cn("mt-1 text-[20px] font-semibold tabular-nums", tone)}>{f(value)}</p>
    </div>
  );
}

const W = 336;
const H = 84;

export default function DebugPanel({ latitude, longitude, time, source, onSourceChange }: Props) {
  const [open, setOpen] = useState(true);
  const version = useSyncExternalStore(
    lightFusionService.subscribe,
    lightFusionService.getVersion,
    lightFusionService.getVersion
  );
  const now = useNow(30_000);
  const minute = Math.round(time / 60_000);

  const report = useMemo(
    () => ({ ...lightFusionService.debugReport(latitude, longitude, minute * 60_000, now), version }),
    [latitude, longitude, minute, now, version]
  );

  const { sun, model, satellite, clearSky, fusion, series } = report;
  const meta = cloudService.getMeta();

  const chart = useMemo(() => {
    if (series.length < 2) return null;
    const t0 = series[0].t;
    const t1 = series[series.length - 1].t;
    const x = (t: number) => ((t - t0) / (t1 - t0)) * (W - 8) + 4;
    const y = (v: number) => H - 6 - v * (H - 14);
    const path = (key: "model" | "satellite" | "fused") => {
      let d = "";
      let pen = false;
      for (const p of series) {
        const v = p[key];
        if (v === null) {
          pen = false;
          continue;
        }
        d += `${pen ? "L" : "M"}${x(p.t).toFixed(1)},${y(v).toFixed(1)} `;
        pen = true;
      }
      return d;
    };
    const dots = series
      .filter((p) => p.satellite !== null && p.satelliteOrigin === "observed")
      .map((p) => [x(p.t), y(p.satellite as number)] as const);
    return {
      model: path("model"),
      satellite: path("satellite"),
      fused: path("fused"),
      dots,
      sel: t0 <= time && time <= t1 ? x(time) : null,
      now: t0 <= now && now <= t1 ? x(now) : null,
    };
  }, [series, time, now]);

  return (
    <aside
      className={cn(
        "fixed bottom-3 left-3 z-[60] max-h-[calc(100dvh-1.5rem)] w-[min(94vw,380px)] overflow-y-auto rounded-2xl border border-white/10 bg-[#0d1226]/95 p-3.5 font-mono text-[10.5px] leading-[1.5] text-white/90 shadow-2xl backdrop-blur",
        !open && "overflow-hidden"
      )}
    >
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="flex w-full items-center justify-between text-[10px] font-bold uppercase tracking-[0.22em] text-amber-300"
      >
        <span>debug · weather</span>
        <span>{open ? "—" : "+"}</span>
      </button>

      {open && (
        <div className="mt-3 space-y-2.5">
          <Section title="Time">
            <L k="selected" v={`${formatClock(time)} (${f((time - now) / 60_000, 0)} min vs ahora)`} />
            <L k="solar elevation" v={`${f(sun.altitudeDeg, 1)}°`} />
            <L k="solar azimuth" v={`${f(sun.azimuthDeg, 0)}°`} />
            <L k="point" v={`${f(latitude, 4)}, ${f(longitude, 4)}`} />
          </Section>

          <Section title="Model">
            {model ? (
              <>
                <L k="cloud total / low / mid / high" v={`${pct(model.cloudCover)} / ${pct(model.lowCloudCover)} / ${pct(model.mediumCloudCover)} / ${pct(model.highCloudCover)}`} />
                <L k="sunshine duration (est.)" v={pct(model.sunshineFraction)} />
                <L k="DNI / GHI (instant)" v={`${wm2(model.modelDni)} / ${wm2(model.modelGhi)}`} />
                <L
                  k="signals rad / layers / sun"
                  v={`${f(model.transmissionSignals?.radiation)} / ${f(model.transmissionSignals?.layers)} / ${f(model.transmissionSignals?.sunshine)}`}
                />
                <L k="signal consistency" v={f(model.signalConsistency)} />
                <L k="direct transmission" v={f(model.directBeamTransmission)} />
                <L k="confidence · resolution" v={`${f(model.confidence)} · ${model.resolutionKm} km`} />
                <L k="updated" v={formatAge(now - model.updatedAt.getTime())} />
                {meta && <L k="sunshine semantics" v={<span className="text-white/60">{meta.sunshineSemantics}</span>} />}
              </>
            ) : (
              <L k="status" v="no data" />
            )}
          </Section>

          <Section title="Satellite">
            {satellite ? (
              <>
                <L k="GHI / direct / diffuse" v={`${wm2(satellite.shortwaveRadiation)} / ${wm2(satellite.directRadiation)} / ${wm2(satellite.diffuseRadiation)}`} />
                <L k="DNI" v={wm2(satellite.directNormalIrradiance)} />
                <L k="clear-sky GHI (sat)" v={wm2(satellite.clearSkyShortwave)} />
                <L k="clear-sky index · direct T" v={`${f(satellite.clearSkyIndex)} · ${f(satellite.directTransmission)}`} />
                <L k="origin" v={satellite.origin} />
                <L k="observation" v={`${formatClock(satellite.sampleTime.getTime())} (lead ${f(satellite.leadMinutes, 0)} min)`} />
                <L k="latency · resolution" v={`${satellite.delayMinutes ?? "—"} min · ${satellite.nativeResolution ?? "—"}`} />
                <L k="consistency (direct↔GHI)" v={f(satellite.consistency)} />
                <L k="direct provenance" v={<span className="text-white/60">unverified (may be derived from GHI)</span>} />
              </>
            ) : (
              <L k="status" v="no observation" />
            )}
            <L k="clear-sky ref DNI / GHI" v={`${wm2(clearSky.dni)} / ${wm2(clearSky.ghi)}`} />
            <L k="clear-sky source" v={`${clearSky.source} (×${f(clearSky.calibrationFactor)})`} />
          </Section>

          <Section title="Fusion">
            <div className="mb-1.5 flex gap-1.5">
              <Big label="Model" value={fusion.model?.transmission ?? null} tone="text-sky-300" />
              <Big label="Satellite" value={fusion.satellite?.transmission ?? null} tone="text-amber-300" />
              <Big label="Fused" value={fusion.directTransmission} tone="text-white" />
            </div>
            <L k="winner · satellite share" v={`${fusion.winner} · ${pct(fusion.satelliteShare)}`} />
            <L k="weights sat / model" v={`${f(fusion.satellite?.weight)} / ${f(fusion.model?.weight)}`} />
            <L k="in current window" v={fusion.inCurrentWindow ? "yes" : "no"} />
            <L k="conflict" v={fusion.conflict ? `YES (Δ ${f(fusion.conflictMagnitude)})` : `no (Δ ${f(fusion.conflictMagnitude)})`} />
            <L k="origin · data origin" v={`${fusion.origin ?? "—"} · ${fusion.dataOrigin}`} />
            <L k="confidence sat / model / weather" v={`${f(fusion.confidence.satellite)} / ${f(fusion.confidence.model)} / ${f(fusion.confidence.weather)}`} />
          </Section>

          <Section title="Decision log">
            <ol className="list-decimal space-y-1 pl-4 text-white/75">
              {fusion.decision.map((line) => (
                <li key={line}>{line}</li>
              ))}
            </ol>
          </Section>

          <Section title="Day · model vs satellite vs fused">
            {chart ? (
              <svg viewBox={`0 0 ${W} ${H}`} className="w-full" role="img" aria-label="Transmisión directa a lo largo del día">
                {[0, 0.5, 1].map((g) => (
                  <line key={g} x1="4" x2={W - 4} y1={H - 6 - g * (H - 14)} y2={H - 6 - g * (H - 14)} stroke="white" strokeOpacity="0.08" />
                ))}
                {chart.now !== null && <line x1={chart.now} x2={chart.now} y1="2" y2={H - 4} stroke="white" strokeOpacity="0.35" strokeDasharray="2 3" />}
                {chart.sel !== null && <line x1={chart.sel} x2={chart.sel} y1="2" y2={H - 4} stroke="#fbbf24" strokeOpacity="0.8" />}
                <path d={chart.model} fill="none" stroke="#7dd3fc" strokeWidth="1.4" strokeDasharray="3 3" />
                <path d={chart.satellite} fill="none" stroke="#fbbf24" strokeWidth="1.6" />
                {chart.dots.map(([cx, cy]) => (
                  <circle key={`${cx}:${cy}`} cx={cx} cy={cy} r="1.4" fill="#fbbf24" />
                ))}
                <path d={chart.fused} fill="none" stroke="white" strokeWidth="2" />
              </svg>
            ) : (
              <L k="series" v="—" />
            )}
            <p className="text-white/40">azul = modelo · ámbar = satélite (puntos = observadas) · blanco = fusión · punteada = ahora</p>
          </Section>

          <Section title="Map layer source">
            <div className="flex gap-1.5">
              {(["fused", "model", "satellite"] as const).map((m) => (
                <button
                  key={m}
                  type="button"
                  onClick={() => onSourceChange(m)}
                  className={cn(
                    "flex-1 rounded-md px-2 py-1.5 text-[10px] font-bold uppercase tracking-wider transition-colors",
                    source === m ? "bg-amber-300 text-black" : "bg-white/[0.07] text-white/70 hover:bg-white/[0.12]"
                  )}
                >
                  {m}
                </button>
              ))}
            </div>
          </Section>
        </div>
      )}
    </aside>
  );
}
