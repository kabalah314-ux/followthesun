import { describe, expect, it } from "vitest";
import { overpass, overpassBreaker } from "../overpass";

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });

describe("cliente de Overpass", () => {
  it("salta al siguiente servidor si uno falla y lo aparta en la sesión", async () => {
    const calls: string[] = [];
    const fetchImpl = (async (url: string) => {
      calls.push(url);
      return url.includes("uno") ? json({}, 503) : json({ elements: [{ id: 1 }] });
    }) as unknown as typeof fetch;
    const endpoints = ["https://uno.test/api", "https://dos.test/api"];

    expect(await overpass<{ id: number }>("[out:json];", { timeoutMs: 1000, endpoints, fetchImpl })).toEqual([{ id: 1 }]);
    expect(calls).toEqual(endpoints);
    expect(overpassBreaker.isCooling("https://uno.test/api")).toBe(true);

    calls.length = 0;
    await overpass("[out:json];", { timeoutMs: 1000, endpoints, fetchImpl });
    expect(calls).toEqual(["https://dos.test/api"]);
  });

  it("un «remark» de tiempo agotado cuenta como fallo", async () => {
    const fetchImpl = (async () => json({ elements: [], remark: "runtime error: Query timed out" })) as unknown as typeof fetch;
    await expect(
      overpass("[out:json];", { timeoutMs: 1000, endpoints: ["https://tres.test/api"], fetchImpl })
    ).rejects.toThrow(/incompleta/);
  });

  it("con todos los servidores apartados falla al momento", async () => {
    overpassBreaker.fail("https://cuatro.test/api");
    let called = false;
    const fetchImpl = (async () => {
      called = true;
      return json({ elements: [] });
    }) as unknown as typeof fetch;
    await expect(
      overpass("[out:json];", { timeoutMs: 1000, endpoints: ["https://cuatro.test/api"], fetchImpl })
    ).rejects.toThrow(/no disponible/);
    expect(called).toBe(false);
  });
});
