import { describe, expect, it } from "vitest";
import { EndpointBreaker, HttpError, isRetryable, settlePair, settleWithin, withRetry } from "../net";

const later = <T>(ms: number, value: T) => new Promise<T>((resolve) => setTimeout(() => resolve(value), ms));
const fails = (ms: number, msg = "x") => new Promise<never>((_, reject) => setTimeout(() => reject(new Error(msg)), ms));

describe("isRetryable", () => {
  it("reintenta lo pasajero y no lo definitivo", () => {
    expect(isRetryable(new HttpError(503, "x"))).toBe(true);
    expect(isRetryable(new HttpError(429, "x"))).toBe(true);
    expect(isRetryable(new HttpError(404, "x"))).toBe(false);
    const abort = new Error("aborted");
    abort.name = "AbortError";
    expect(isRetryable(abort)).toBe(true);
    expect(isRetryable("texto")).toBe(false);
  });
});

describe("withRetry", () => {
  const noWait = () => Promise.resolve();

  it("reintenta ante 503 hasta conseguirlo", async () => {
    let calls = 0;
    const v = await withRetry(
      async () => {
        calls++;
        if (calls < 3) throw new HttpError(503, "ocupado");
        return "ok";
      },
      { retries: 2, wait: noWait }
    );
    expect(v).toBe("ok");
    expect(calls).toBe(3);
  });

  it("no reintenta un 404 y no pasa del máximo", async () => {
    let calls = 0;
    await expect(
      withRetry(async () => {
        calls++;
        throw new HttpError(404, "no existe");
      }, { wait: noWait })
    ).rejects.toThrow("no existe");
    expect(calls).toBe(1);

    calls = 0;
    await expect(
      withRetry(async () => {
        calls++;
        throw new HttpError(503, "ocupado");
      }, { retries: 2, wait: noWait })
    ).rejects.toThrow("ocupado");
    expect(calls).toBe(3);
  });
});

describe("EndpointBreaker", () => {
  it("aparta un servidor que falló y lo recupera pasado el enfriamiento", () => {
    let t = 0;
    const b = new EndpointBreaker(1000, () => t);
    const urls = ["a", "b", "c"];
    b.fail("a");
    expect(b.order(urls)).toEqual(["b", "c"]);
    expect(b.order(urls, true)).toEqual(["b", "c", "a"]);
    t = 1500;
    expect(b.order(urls)).toEqual(["a", "b", "c"]);
    b.fail("b");
    b.ok("b");
    expect(b.isCooling("b")).toBe(false);
  });

  it("con todos apartados devuelve vacío salvo que se pidan igualmente", () => {
    const b = new EndpointBreaker(1000, () => 0);
    b.fail("a");
    b.fail("b");
    expect(b.order(["a", "b"])).toEqual([]);
    expect(b.order(["a", "b"], true)).toHaveLength(2);
  });
});

describe("settleWithin / settlePair", () => {
  it("settleWithin devuelve null si sigue pendiente", async () => {
    expect(await settleWithin(later(80, 1), 10)).toBeNull();
    expect(await settleWithin(later(1, 2), 80)).toEqual({ status: "fulfilled", value: 2 });
  });

  it("si la primera llega bien, la segunda solo tiene el margen", async () => {
    const [a, b] = await settlePair(later(5, "lic"), later(300, "osm"), 30);
    expect(a).toEqual({ status: "fulfilled", value: "lic" });
    expect(b).toBeNull();
  });

  it("si la primera falla, se espera a la segunda entera", async () => {
    const [a, b] = await settlePair(fails(5, "caída"), later(80, "osm"), 10);
    expect(a?.status).toBe("rejected");
    expect(b).toEqual({ status: "fulfilled", value: "osm" });
  });

  it("funciona igual si llega antes la segunda", async () => {
    const [a, b] = await settlePair(later(300, "lento"), later(5, "rápido"), 30);
    expect(a).toBeNull();
    expect(b).toEqual({ status: "fulfilled", value: "rápido" });
  });
});
