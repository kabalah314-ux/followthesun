import { describe, expect, it } from "vitest";
import { addOption, decodeGroupPlan, encodeGroupPlan, GROUP_MAX, removeOption, type GroupPlan } from "../groupPlan";

const plan: GroupPlan = {
  title: "Vermut del sábado ☀️",
  options: [
    { id: "osm:way/1", name: "Plaça del Sol", type: "square", lat: 41.40112, lng: 2.15714, time: Date.UTC(2026, 9, 24, 10, 30) },
    { id: "osm:node/2", name: "Café Niño Ñandú", type: "terrace", lat: 41.38, lng: 2.18, time: null },
  ],
};

describe("plan en grupo por enlace", () => {
  it("el enlace se abre igual en otro móvil (ida y vuelta, con acentos y emojis)", () => {
    const code = encodeGroupPlan(plan);
    expect(code).toMatch(/^[A-Za-z0-9_-]+$/);
    expect(decodeGroupPlan(code)).toEqual(plan);
  });

  it("como mucho cinco opciones y sin repetir sitio", () => {
    let p: GroupPlan = { title: "", options: [] };
    for (let i = 0; i < 7; i++) p = addOption(p, { id: `id${i}`, name: `S${i}`, type: "park", lat: 41.39, lng: 2.17, time: null });
    expect(p.options).toHaveLength(GROUP_MAX);
    expect(addOption(p, p.options[0]).options).toHaveLength(GROUP_MAX);
    expect(removeOption(p, "id0").options).toHaveLength(GROUP_MAX - 1);
    expect(decodeGroupPlan(encodeGroupPlan(p))!.options).toHaveLength(GROUP_MAX);
  });

  it("un enlace roto no rompe nada", () => {
    expect(decodeGroupPlan("")).toBeNull();
    expect(decodeGroupPlan("%%%")).toBeNull();
    expect(decodeGroupPlan("eyJ0IjoxfQ")).toBeNull();
    expect(decodeGroupPlan(null)).toBeNull();
  });
});
