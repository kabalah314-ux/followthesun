import { describe, expect, it } from "vitest";
import type { SunWindow } from "../../types";
import { describeResult, nearbyLine, runsAround } from "../placeAnswer";

const H = 3_600_000;
const M = 60_000;
const T0 = Date.UTC(2026, 9, 22, 12, 0); // 14:00 en Barcelona (CEST)
const clock = (ms: number) => {
  const d = new Date(ms + 2 * H);
  return `${String(d.getUTCHours()).padStart(2, "0")}:${String(d.getUTCMinutes()).padStart(2, "0")}`;
};
const w = (kind: SunWindow["kind"], from: number, to: number): SunWindow => ({ kind, start: T0 + from * M, end: T0 + to * M });

// 14:00–14:40 sol, 14:40–15:00 sol suave, 15:00–15:30 sombra, 15:30–16:00 sol
const windows = [w("sun", 0, 40), w("partial", 40, 60), w("shadow", 60, 90), w("sun", 90, 120)];
const base = { windows, searchWindow: { start: T0, end: T0 + 60 * M } };

describe("runsAround", () => {
  it("une sol directo y sol suave en un solo tramo", () => {
    const { current, next } = runsAround(windows, T0 + 10 * M, ["sun", "partial"]);
    expect(current).toEqual({ start: T0, end: T0 + 60 * M });
    expect(next).toBeNull();
  });
  it("encuentra el siguiente tramo cuando ahora no hay sol", () => {
    const { current, next } = runsAround(windows, T0 + 70 * M, ["sun", "partial"]);
    expect(current).toBeNull();
    expect(next).toEqual({ start: T0 + 90 * M, end: T0 + 120 * M });
  });
});

describe("nearbyLine", () => {
  it("sol hasta la hora en que acaba el tramo", () => {
    expect(nearbyLine(base, T0 + 5 * M, "sun", { clock })).toEqual({ text: "Sol hasta las 15:00", tone: "sun" });
  });
  it("sombra desde la hora en que empieza", () => {
    expect(nearbyLine(base, T0 + 5 * M, "shade", { clock })).toEqual({ text: "Sombra desde las 15:00", tone: "shade" });
  });
  it("si el tramo llega al final de la franja, dice «al menos»", () => {
    expect(nearbyLine(base, T0 + 100 * M, "sun", { clock }).text).toBe("Sol al menos hasta las 16:00");
  });
});

describe("describeResult", () => {
  const r = { ...base, bestWindow: { start: T0, end: T0 + 60 * M }, sunlightMinutes: 60, weatherAvailable: true };
  it("ahora con sol: hasta cuándo y cuánto queda", () => {
    const a = describeResult(r, T0 + 8 * M, "sun", clock);
    expect(a.headline).toBe("Sol hasta las 15:00");
    expect(a.detail).toBe("Quedan 52 min");
  });
  it("ahora en sombra: cuándo vuelve el sol", () => {
    expect(describeResult(r, T0 + 70 * M, "sun", clock).headline).toBe("Ahora sin sol · vuelve a las 15:30");
  });
  it("franja futura: la mejor ventana", () => {
    expect(describeResult(r, T0 - 3 * H, "sun", clock).headline).toBe("Sol de 14:00 a 15:00");
  });
  it("modo sombra: hasta cuándo dura", () => {
    expect(describeResult(r, T0 + 65 * M, "shade", clock).headline).toBe("Sombra hasta las 15:30");
  });
});
