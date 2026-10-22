import { readFileSync, readdirSync, statSync } from "node:fs";
import { join, relative } from "node:path";
import { describe, expect, it } from "vitest";
import { createAffiliateService, wantsTickets } from "../affiliateService";

/** Almacenamiento en memoria para las pruebas. */
function memoryStorage(): Storage {
  const m = new Map<string, string>();
  return {
    get length() {
      return m.size;
    },
    clear: () => m.clear(),
    getItem: (k: string) => (m.has(k) ? m.get(k)! : null),
    key: (i: number) => [...m.keys()][i] ?? null,
    removeItem: (k: string) => void m.delete(k),
    setItem: (k: string, v: string) => void m.set(k, String(v)),
  };
}

const FULL = {
  civitatisAid: "123",
  getYourGuidePartnerId: "ABC",
  amazonTag: "fts-21",
  viatorUrlTemplate: "https://www.viator.com/searchResults/all?text={q}&pid=P1",
  tiqetsUrlTemplate: "https://www.tiqets.com/{lang}/search?q={q}&partner=fts",
  bookingUrlTemplate: "https://example-network.com/click?url=https%3A%2F%2Fwww.booking.com%2Fsearchresults.html%3Fss%3D{q}",
};

describe("affiliateService", () => {
  it("sin identificadores no ofrece nada", () => {
    const s = createAffiliateService({}, memoryStorage());
    expect(s.isConfigured()).toBe(false);
    expect(s.offers({ slot: "activity", locale: "es" })).toEqual([]);
  });

  it("marca cada enlace como afiliado, con quién paga y rel=sponsored", () => {
    const s = createAffiliateService(FULL, memoryStorage());
    const offers = s.offers({ slot: "activity", locale: "es" });
    expect(offers.map((o) => o.program)).toEqual(["civitatis", "getyourguide"]);
    for (const o of offers) {
      expect(o.badge).toBe("Enlace de afiliado");
      expect(o.rel).toContain("sponsored");
      expect(o.label).toContain(o.sponsor);
      expect(o.url.startsWith("https://")).toBe(true);
    }
    expect(offers[0].url).toBe("https://www.civitatis.com/es/barcelona/?aid=123");
    expect(offers[1].url).toContain("partner_id=ABC");
  });

  it("solo ofrece protección solar con UV muy alto o con calor, y con la frase de Amazon", () => {
    const s = createAffiliateService(FULL, memoryStorage());
    expect(s.offers({ slot: "sun_protection", locale: "es", uvIndex: 5 })).toEqual([]);
    const [o] = s.offers({ slot: "sun_protection", locale: "es", uvIndex: 9 });
    expect(o.url).toBe("https://www.amazon.es/s?k=protector%20solar%20SPF%2050&tag=fts-21");
    expect(o.disclosure).toContain("Afiliado de Amazon");
    expect(s.offers({ slot: "sun_protection", locale: "en", heatAlert: true })[0].disclosure).toContain("Amazon Associate");
  });

  it("solo ofrece entradas para monumentos con entrada", () => {
    expect(wantsTickets({ name: "Park Güell" })).toBe(true);
    expect(wantsTickets({ name: "Bunkers del Carmel" })).toBe(true);
    expect(wantsTickets({ name: "Plaça Reial" })).toBe(false);
    const s = createAffiliateService(FULL, memoryStorage());
    const offers = s.offers({ slot: "tickets", locale: "ca", place: { name: "Park Güell", type: "park" } });
    expect(offers.map((o) => o.program)).toEqual(["getyourguide", "tiqets"]);
    expect(offers[0].label).toBe("Entrades per a Park Güell a GetYourGuide");
    expect(offers[1].url).toBe("https://www.tiqets.com/es/search?q=Park%20G%C3%BCell%20Barcelona&partner=fts");
  });

  it("se puede ocultar y lo recuerda", () => {
    const storage = memoryStorage();
    const s = createAffiliateService(FULL, storage);
    s.setHidden(true);
    expect(s.offers({ slot: "activity", locale: "es" })).toEqual([]);
    expect(createAffiliateService(FULL, storage).isHidden()).toBe(true);
  });

  it("ignora plantillas que no son https", () => {
    const s = createAffiliateService({ bookingUrlTemplate: "javascript:alert(1)" }, memoryStorage());
    expect(s.isConfigured()).toBe(false);
  });
});

describe("el orden por sol no depende de la afiliación", () => {
  // Vitest se ejecuta desde la raíz del proyecto.
  const SRC = join(process.cwd(), "src");
  const walk = (dir: string): string[] =>
    readdirSync(dir).flatMap((name) => {
      const p = join(dir, name);
      return statSync(p).isDirectory() ? (name === "__tests__" ? [] : walk(p)) : /\.(ts|tsx)$/.test(name) ? [p] : [];
    });

  it("ningún servicio ni cálculo importa el módulo de afiliación", () => {
    const offenders = walk(SRC)
      .map((f) => relative(SRC, f).replace(/\\/g, "/"))
      .filter((f) => !f.startsWith("services/affiliate/") && !f.startsWith("components/"))
      .filter((f) => /from\s+["'][^"']*affiliate[^"']*["']/.test(readFileSync(join(SRC, f), "utf8")));
    expect(offenders).toEqual([]);
  });
});
