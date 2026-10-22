import { describe, expect, it } from "vitest";
import { isOpenAt, isOpenNow, openStateOf, parseOpeningHours, zoneWeekMinutes } from "../openingHours";

const MO = 0;
const TU = 1;
const WE = 2;
const FR = 4;
const SA = 5;
const SU = 6;
const at = (h: number, m = 0) => h * 60 + m;

describe("horarios de OpenStreetMap", () => {
  it("24/7 siempre está abierto", () => {
    const s = parseOpeningHours("24/7")!;
    expect(s.alwaysOpen).toBe(true);
    expect(isOpenAt(s, SU, at(3))).toBe(true);
  });

  it("días laborables y sábado", () => {
    const s = parseOpeningHours("Mo-Fr 08:00-20:00; Sa 09:00-14:00")!;
    expect(isOpenAt(s, MO, at(8))).toBe(true);
    expect(isOpenAt(s, MO, at(7, 59))).toBe(false);
    expect(isOpenAt(s, FR, at(19, 59))).toBe(true);
    expect(isOpenAt(s, FR, at(20))).toBe(false);
    expect(isOpenAt(s, SA, at(13, 30))).toBe(true);
    expect(isOpenAt(s, SA, at(15))).toBe(false);
    expect(isOpenAt(s, SU, at(12))).toBe(false);
  });

  it("varios tramos y días sueltos", () => {
    const s = parseOpeningHours("Mo,We,Fr 10:00-14:00,17:00-20:00")!;
    expect(isOpenAt(s, WE, at(11))).toBe(true);
    expect(isOpenAt(s, WE, at(15))).toBe(false);
    expect(isOpenAt(s, WE, at(18))).toBe(true);
    expect(isOpenAt(s, TU, at(11))).toBe(false);
  });

  it("tramos separados por coma y espacio, con 24:00", () => {
    const s = parseOpeningHours("Tu-Su 12:00-16:00, 20:00-24:00")!;
    expect(isOpenAt(s, SU, at(23, 30))).toBe(true);
    expect(isOpenAt(s, MO, at(13))).toBe(false);
  });

  it("después de medianoche cuenta para el día siguiente", () => {
    const s = parseOpeningHours("Th-Sa 20:00-02:30")!;
    expect(isOpenAt(s, SA, at(1))).toBe(true);
    expect(isOpenAt(s, SU, at(2))).toBe(true);
    expect(isOpenAt(s, SU, at(3))).toBe(false);
    expect(isOpenAt(s, WE, at(1))).toBe(false);
  });

  it("off y closed cierran esos días (y una regla posterior manda)", () => {
    const s = parseOpeningHours("Mo-Su 09:00-21:00; Su off")!;
    expect(isOpenAt(s, SA, at(10))).toBe(true);
    expect(isOpenAt(s, SU, at(10))).toBe(false);
    const c = parseOpeningHours("Mo-Sa 08:00-15:00; Su closed")!;
    expect(isOpenAt(c, SU, at(9))).toBe(false);
  });

  it("los festivos se ignoran sin estropear el resto", () => {
    const s = parseOpeningHours("Mo-Fr 07:30-21:00; Sa,Su,PH 09:00-21:00; PH off")!;
    expect(isOpenAt(s, MO, at(7, 45))).toBe(true);
    expect(isOpenAt(s, SU, at(9, 30))).toBe(true);
  });

  it("sin días = todos los días; rangos que dan la vuelta", () => {
    expect(isOpenAt(parseOpeningHours("08:00-20:00")!, SU, at(12))).toBe(true);
    const s = parseOpeningHours("Fr-Mo 10:00-18:00")!;
    expect(isOpenAt(s, SU, at(12))).toBe(true);
    expect(isOpenAt(s, MO, at(12))).toBe(true);
    expect(isOpenAt(s, TU, at(12))).toBe(false);
  });

  it("acepta horas de una cifra y guiones largos", () => {
    const s = parseOpeningHours("Mo–Fr 8:00–15:00")!;
    expect(isOpenAt(s, TU, at(8, 30))).toBe(true);
  });

  it("lo que no entiende es desconocido (null), nunca «cerrado»", () => {
    expect(parseOpeningHours("")).toBeNull();
    expect(parseOpeningHours(undefined)).toBeNull();
    expect(parseOpeningHours("Jun-Sep Mo-Su 10:00-22:00")).toBeNull();
    expect(parseOpeningHours("Mo-Su sunrise-sunset")).toBeNull();
    expect(parseOpeningHours('Mo-Fr 09:00-14:00 "por la tarde con cita"')).toBeNull();
    expect(parseOpeningHours("Mo-Su 18:00+")).toBeNull();
    expect(parseOpeningHours("abierto todos los días")).toBeNull();
    expect(isOpenNow("whatever", Date.UTC(2026, 9, 21, 12))).toBeNull();
  });

  it("dice hasta cuándo está abierto y cuándo abre", () => {
    const s = parseOpeningHours("Mo-Fr 08:00-20:00; Sa 09:00-14:00")!;
    expect(openStateOf(s, MO, at(12))).toEqual({ open: true, closesAt: at(20), opensAt: null });
    expect(openStateOf(s, MO, at(21))).toEqual({ open: false, closesAt: null, opensAt: { dayOffset: 1, minutes: at(8) } });
    expect(openStateOf(s, SA, at(15))).toEqual({ open: false, closesAt: null, opensAt: { dayOffset: 2, minutes: at(8) } });
    expect(openStateOf(s, MO, at(7))).toEqual({ open: false, closesAt: null, opensAt: { dayOffset: 0, minutes: at(8) } });
    const late = parseOpeningHours("Th-Sa 20:00-02:30")!;
    expect(openStateOf(late, SA, at(1))).toEqual({ open: true, closesAt: at(2, 30), opensAt: null });
  });

  it("usa el día y la hora de Barcelona", () => {
    // Miércoles 21 de octubre de 2026, 10:30 UTC = 12:30 en Barcelona (CEST).
    expect(zoneWeekMinutes(Date.UTC(2026, 9, 21, 10, 30))).toEqual({ weekday: WE, minutes: at(12, 30) });
    // Domingo 25 de octubre, 23:30 UTC = lunes 00:30 en Barcelona (CET).
    expect(zoneWeekMinutes(Date.UTC(2026, 9, 25, 23, 30))).toEqual({ weekday: MO, minutes: at(0, 30) });
    expect(isOpenNow("Mo-Fr 08:00-20:00", Date.UTC(2026, 9, 21, 10, 30))).toBe(true);
  });
});
