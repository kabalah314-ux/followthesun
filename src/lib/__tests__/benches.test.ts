import { describe, expect, it } from "vitest";
import { packBenches, unpackBenches } from "../benches";

describe("bancos", () => {
  it("empaqueta, quita duplicados y deshace el paquete como lugares de tipo banco", () => {
    const packed = packBenches([
      { id: 2, lat: 41.380001, lng: 2.170004, backrest: true },
      { id: 1, lat: 41.370001, lng: 2.160004, backrest: false },
      { id: 3, lat: 41.380001, lng: 2.170004, backrest: false },
    ]);
    expect(packed).toEqual([
      [41.37, 2.16, 1, 0],
      [41.38, 2.17, 2, 1],
    ]);
    const places = unpackBenches(packed);
    expect(places[1]).toMatchObject({ id: "osm:node/2", type: "bench", latitude: 41.38, metadata: { backrest: true } });
    expect(places[1].name).toBe("Banco con respaldo");
    expect(places[0].name).toBe("Banco");
  });
});
