import type { ChipId, CollectionDef, ExploreSpec } from "../../lib/explore";
import { PLACE_TYPE_LABEL } from "../../lib/placeTypes";
import { dayChoiceLabel, dayStartFor, hhmm } from "../../lib/planningTime";
import type { SunPlaceType } from "../../types";
import { tr, type MessageKey } from "../../i18n";

/** Textos de los chips, las colecciones y las búsquedas de Explorar. */

export const CHIP_LABEL: Record<ChipId, MessageKey> = {
  sun: "chips.sol_ahora",
  shade: "chips.sombra_ahora",
  terraces: "chips.terrazas",
  parks: "chips.parques",
  beach: "chips.playa",
  kids: "chips.ninos",
  sunset: "chips.atardecer",
  work: "chips.trabajar",
  dog: "chips.con_perro",
};

export const COLLECTION_TEXT: Record<string, { title: MessageKey; hint: MessageKey }> = {
  breakfast: { title: "collections.desayunos_al_sol", hint: "collections.desayunos_al_sol_hint" },
  "terraces-late": { title: "collections.terrazas_con_sol_hasta_tarde", hint: "collections.terrazas_con_sol_hasta_tarde_hint" },
  "kids-shade": { title: "collections.parques_con_sombra_para_ninos", hint: "collections.parques_con_sombra_para_ninos_hint" },
  "kids-sun": { title: "collections.parques_al_sol_para_ninos", hint: "collections.parques_al_sol_para_ninos_hint" },
  sunsets: { title: "collections.atardeceres", hint: "collections.atardeceres_hint" },
  lunch: { title: "collections.comer_al_sol", hint: "collections.comer_al_sol_hint" },
  "cool-refuges": { title: "collections.refugios_y_fuentes", hint: "collections.refugios_y_fuentes_hint" },
  "shade-walks": { title: "collections.paseos_a_la_sombra", hint: "collections.paseos_a_la_sombra_hint" },
  "beach-early": { title: "collections.playa_a_primera_hora", hint: "collections.playa_a_primera_hora_hint" },
  "beach-winter": { title: "collections.playa_de_invierno", hint: "collections.playa_de_invierno_hint" },
  "read-square": { title: "collections.leer_al_sol", hint: "collections.leer_al_sol_hint" },
  "views-afternoon": { title: "collections.miradores_de_tarde", hint: "collections.miradores_de_tarde_hint" },
};

export const collectionTitle = (c: Pick<CollectionDef, "id">) => tr(COLLECTION_TEXT[c.id]?.title ?? "collections.coleccion");
export const collectionHint = (c: Pick<CollectionDef, "id">) => tr(COLLECTION_TEXT[c.id]?.hint ?? "collections.coleccion");

function typesLabel(types: SunPlaceType[] | null): string | null {
  if (!types || types.length === 0) return null;
  const set = new Set(types);
  if (set.has("viewpoint") && set.has("beach") && set.size >= 3) return tr("spec.miradores_y_playas");
  const names = types.slice(0, 2).map((t) => PLACE_TYPE_LABEL[t]?.plural ?? t);
  const text = names.join(tr("spec.y"));
  return text.charAt(0).toUpperCase() + text.slice(1);
}

/** «mañana 11:00», «sáb, 24 oct», «en 30 min», «al atardecer». */
export function whenLabel(spec: ExploreSpec, now: number): string | null {
  const w = spec.when;
  switch (w.kind) {
    case "now":
      return null;
    case "in":
      return tr("spec.en_min", { p0: w.minutes });
    case "at":
      return `${dayChoiceLabel(dayStartFor(now, w.dayOffset), now)} ${hhmm(w.minutes)}`;
    case "day":
      return dayChoiceLabel(dayStartFor(now, w.dayOffset), now);
    case "sunset":
      return w.dayOffset ? `${tr("spec.al_atardecer")} · ${dayChoiceLabel(dayStartFor(now, w.dayOffset), now)}` : tr("spec.al_atardecer");
  }
}

/** Título de una búsqueda de Explorar («Terrazas con sol · mañana 11:00 · Gràcia»). */
export function specTitle(spec: ExploreSpec, mode: "sun" | "shade", now: number): string {
  if (spec.source === "home") {
    return spec.area ? tr("forYou.para_ti_en", { p0: spec.area.name }) : tr("forYou.para_ti_ahora");
  }
  if (spec.source === "chip" && spec.chip) {
    return spec.area ? `${tr(CHIP_LABEL[spec.chip])} · ${spec.area.name}` : tr(CHIP_LABEL[spec.chip]);
  }
  if (spec.source === "collection" && spec.collection) return collectionTitle({ id: spec.collection });
  const parts: string[] = [];
  const types = typesLabel(spec.types);
  const m = spec.mode ?? mode;
  parts.push(types ? `${types} ${m === "shade" ? tr("spec.con_sombra") : tr("spec.con_sol")}` : m === "shade" ? tr("chips.sombra_ahora") : tr("chips.sol_ahora"));
  const when = whenLabel(spec, now);
  if (when) parts.push(when);
  if (spec.area) parts.push(spec.area.name);
  return parts.join(" · ");
}
