import { describe, expect, it } from "vitest";
import { buildIcs, icsDate, icsEscape, icsFloatingDate, icsFold } from "../ics";

describe("iCalendar", () => {
  it("formatea las fechas en UTC", () => {
    expect(icsDate(Date.UTC(2026, 9, 22, 11, 40, 5))).toBe("20261022T114005Z");
  });

  it("escapa comas, puntos y coma, barras y saltos de línea", () => {
    expect(icsEscape("Sol, sombra; a\\b\nc")).toBe("Sol\\, sombra\\; a\\\\b\\nc");
  });

  it("pliega las líneas largas a 75 octetos sin partir caracteres", () => {
    const line = `DESCRIPTION:${"Plaça del Sol · ".repeat(10)}`;
    const folded = icsFold(line);
    const parts = folded.split("\r\n");
    expect(parts.length > 1).toBe(true);
    for (const p of parts) expect(new TextEncoder().encode(p).length <= 75).toBe(true);
    expect(parts.slice(1).every((p) => p.startsWith(" "))).toBe(true);
    expect(parts.map((p, i) => (i === 0 ? p : p.slice(1))).join("")).toBe(line);
  });

  it("crea un evento con alarma, lugar y enlace", () => {
    const start = Date.UTC(2026, 9, 22, 11, 40);
    const ics = buildIcs(
      {
        uid: "a1@ifollowthesun",
        start,
        end: start + 90 * 60_000,
        title: "Sol en Plaça del Sol",
        description: "Según I Follow the Sun",
        location: "Plaça del Sol, Barcelona",
        url: "https://example.com/lugar/placa-del-sol?hora=12:40",
        geo: { lat: 41.4, lng: 2.15 },
        alarmMinutesBefore: 20,
      },
      start - 3_600_000
    );
    expect(ics.startsWith("BEGIN:VCALENDAR\r\n")).toBe(true);
    expect(ics.endsWith("END:VCALENDAR\r\n")).toBe(true);
    expect(ics).toContain("DTSTART:20261022T114000Z");
    expect(ics).toContain("DTEND:20261022T131000Z");
    expect(ics).toContain("TRIGGER:-PT20M");
    expect(ics).toContain("LOCATION:Plaça del Sol\\, Barcelona");
    expect(ics).toContain("GEO:41.400000;2.150000");
  });
});

describe("evento diario en hora flotante", () => {
  it("escribe la hora de Barcelona sin zona y la regla de repetición", () => {
    // 23/10/2026 06:55 UTC = 08:55 en Barcelona (CEST).
    const start = Date.UTC(2026, 9, 23, 6, 55);
    const txt = buildIcs({ uid: "d@x", start, end: start + 300_000, title: "Sol", rrule: "FREQ=DAILY", floating: true }, start);
    expect(txt).toContain("DTSTART:20261023T085500\r\n");
    expect(txt).toContain("DTEND:20261023T090000\r\n");
    expect(txt).toContain("RRULE:FREQ=DAILY\r\n");
    expect(icsFloatingDate(Date.UTC(2026, 11, 1, 7, 55))).toBe("20261201T085500");
  });
});

