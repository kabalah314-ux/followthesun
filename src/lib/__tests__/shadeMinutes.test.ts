import { describe, expect, it } from "vitest";
import type { SunWindow } from "../../types";
import { shadeMinutesOf } from "../weekGrid";

const MIN = 60_000;
const w = (kind: SunWindow["kind"], a: number, b: number): SunWindow => ({ kind, start: a * MIN, end: b * MIN });

describe("shadeMinutesOf (Comparar dos sitios)", () => {
  it("la sombra es la luz de día que no es sol (la noche no cuenta)", () => {
    expect(shadeMinutesOf([w("sun", 0, 30), w("shadow", 30, 50), w("cloud", 50, 60), w("night", 60, 120)])).toBe(30);
    // El sol parcial cuenta como medio sol.
    expect(shadeMinutesOf([w("partial", 0, 20), w("shadow", 20, 40)])).toBe(30);
  });
});
