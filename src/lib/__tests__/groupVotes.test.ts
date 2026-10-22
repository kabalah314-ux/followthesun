import { describe, expect, it } from "vitest";
import type { GroupPlan } from "../groupPlan";
import { addVote, decodeVote, encodeVote, planKey, tally } from "../groupVotes";

const plan: GroupPlan = {
  title: "Vermut",
  options: [
    { id: "osm:way/1", name: "Plaça del Sol", type: "square", lat: 41.4, lng: 2.15, time: null },
    { id: "osm:way/2", name: "Parc de la Ciutadella", type: "park", lat: 41.39, lng: 2.18, time: null },
  ],
};

describe("votos del plan en grupo", () => {
  it("el voto viaja en el enlace y se rechaza si no encaja con el plan", () => {
    const code = encodeVote({ voter: "Núria", option: 1 });
    expect(decodeVote(code, 2)).toEqual({ voter: "Núria", option: 1 });
    expect(decodeVote(code, 1)).toBeNull();
    expect(decodeVote("roto", 2)).toBeNull();
  });

  it("cada persona cuenta una vez (su último voto) y el recuento cuadra", () => {
    const k = planKey(plan);
    let book = addVote({}, k, { voter: "Ana", option: 0 }, 1000);
    book = addVote(book, k, { voter: "Marc", option: 1 }, 2000);
    book = addVote(book, k, { voter: "ana", option: 1 }, 3000);
    expect(tally(book[k], 2)).toEqual([0, 2]);
    // El mismo voto anónimo abierto dos veces seguidas no suma dos.
    book = addVote(book, k, { voter: "", option: 0 }, 4000);
    book = addVote(book, k, { voter: "", option: 0 }, 4500);
    expect(tally(book[k], 2)).toEqual([1, 2]);
  });

  it("la huella del plan no depende de la hora propuesta, sí de los sitios", () => {
    const timed = { ...plan, options: plan.options.map((o) => ({ ...o, time: 1 })) };
    expect(planKey(timed)).toBe(planKey(plan));
    expect(planKey({ ...plan, options: plan.options.slice(0, 1) })).not.toBe(planKey(plan));
  });
});
