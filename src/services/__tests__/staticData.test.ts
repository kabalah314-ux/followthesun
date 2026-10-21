import { describe, expect, it } from "vitest";
import { STATIC_DATA_VERSION, acceptStatic, generatedAtMs, isFreshStatic } from "../staticData";

const DAY = 86_400_000;
const base = (kind: string, extra: Record<string, unknown>) => ({
  v: STATIC_DATA_VERSION,
  kind,
  generatedAt: "2026-10-19T05:17:00.000Z",
  sources: [],
  ...extra,
});

describe("acceptStatic", () => {
  it("acepta ficheros válidos de cada tipo", () => {
    expect(acceptStatic(base("places", { bbox: {}, places: [] }), "places")).not.toBeNull();
    expect(acceptStatic(base("venues", { bbox: {}, venues: [] }), "venues")).not.toBeNull();
    expect(acceptStatic(base("opendata", { sections: {} }), "opendata")).not.toBeNull();
  });

  it("rechaza versión, tipo, fecha o forma distintos", () => {
    expect(acceptStatic({ ...base("places", { places: [] }), v: 99 }, "places")).toBeNull();
    expect(acceptStatic(base("venues", { venues: [] }), "places")).toBeNull();
    expect(acceptStatic({ ...base("places", { places: [] }), generatedAt: "ayer" }, "places")).toBeNull();
    expect(acceptStatic(base("places", { places: "no" }), "places")).toBeNull();
    expect(acceptStatic(null, "places")).toBeNull();
  });
});

describe("isFreshStatic", () => {
  const at = generatedAtMs({ generatedAt: "2026-10-19T05:17:00.000Z" });

  it("es reciente durante 21 días", () => {
    expect(isFreshStatic({ generatedAt: "2026-10-19T05:17:00.000Z" }, at + 10 * DAY)).toBe(true);
    expect(isFreshStatic({ generatedAt: "2026-10-19T05:17:00.000Z" }, at + 22 * DAY)).toBe(false);
  });

  it("desconfía de fechas futuras o ausentes", () => {
    expect(isFreshStatic({ generatedAt: "2026-10-19T05:17:00.000Z" }, at - 2 * 3_600_000)).toBe(false);
    expect(isFreshStatic({}, at)).toBe(false);
    expect(isFreshStatic(null, at)).toBe(false);
  });
});
