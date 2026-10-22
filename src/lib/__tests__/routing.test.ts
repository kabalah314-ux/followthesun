import { describe, expect, it } from "vitest";
import { destinationOf, matchRoute, pathOf, searchFor, tabBelongs, tabFromParam } from "../routing";

describe("rutas de los tres destinos", () => {
  it("entiende las rutas nuevas", () => {
    expect(matchRoute("", "")).toEqual({ view: "explore", tab: null, legacy: false });
    expect(matchRoute("lugar/placa-del-sol--w123", "")).toEqual({ view: "explore", tab: null, legacy: false });
    expect(matchRoute("planes", "")).toEqual({ view: "plans", tab: "route", legacy: false });
    expect(matchRoute("planes/", "?vista=semana")).toEqual({ view: "plans", tab: "week", legacy: false });
    expect(matchRoute("planes", "?vista=grupo&g=abc")).toEqual({ view: "plans", tab: "group", legacy: false });
    expect(matchRoute("planes", "?vista=otra")).toEqual({ view: "plans", tab: "route", legacy: false });
    expect(matchRoute("mis-sitios", "")).toEqual({ view: "mine", tab: "lists", legacy: false });
    expect(matchRoute("mis-sitios", "?vista=mi-casa")).toEqual({ view: "mine", tab: "home", legacy: false });
    expect(matchRoute("ajustes", "")).toEqual({ view: "settings", tab: null, legacy: false });
    expect(matchRoute("acerca-de", "")).toEqual({ view: "about", tab: null, legacy: false });
    expect(matchRoute("no-existe", "")).toBeNull();
  });

  it("redirige las rutas antiguas a su destino nuevo", () => {
    expect(matchRoute("mapa", "?hora=17:30")).toEqual({ view: "explore", tab: null, legacy: true });
    expect(matchRoute("buscar", "")).toEqual({ view: "explore", tab: null, legacy: true });
    expect(matchRoute("buscar", "?pestana=lugares")).toEqual({ view: "explore", tab: null, legacy: true });
    expect(matchRoute("buscar", "?pestana=mas-tarde")).toEqual({ view: "plans", tab: "later", legacy: true });
    expect(matchRoute("find", "")).toEqual({ view: "explore", tab: null, legacy: true });
    expect(matchRoute("plan", "")).toEqual({ view: "plans", tab: "later", legacy: true });
    expect(matchRoute("places", "")).toEqual({ view: "explore", tab: null, legacy: true });
    expect(matchRoute("recomendados", "")).toEqual({ view: "explore", tab: null, legacy: true });
    expect(matchRoute("saved", "")).toEqual({ view: "mine", tab: "lists", legacy: true });
    expect(matchRoute("settings", "")).toEqual({ view: "settings", tab: null, legacy: true });
    expect(matchRoute("about", "")).toEqual({ view: "about", tab: null, legacy: true });
  });

  it("escribe la sección en la query y conserva el resto de parámetros", () => {
    expect(searchFor("?hora=17%3A30&dia=2026-10-24", "plans", "week")).toBe("?hora=17%3A30&dia=2026-10-24&vista=semana");
    expect(searchFor("?pestana=mas-tarde&hora=09%3A00", "plans", "later")).toBe("?hora=09%3A00&vista=mas-tarde");
    expect(searchFor("?vista=semana&debug=weather", "plans", "route")).toBe("?debug=weather");
    expect(searchFor("?vista=semana", "explore")).toBe("");
    expect(searchFor("?pestana=lugares&c=41.38,2.17", "explore")).toBe("?c=41.38%2C2.17");
    expect(searchFor("", "mine", "history")).toBe("?vista=historial");
  });

  it("solo conserva el plan en grupo en su sección", () => {
    expect(searchFor("?g=xyz", "plans", "group")).toBe("?g=xyz&vista=grupo");
    expect(searchFor("?g=xyz&vista=grupo", "plans", "route")).toBe("");
    expect(searchFor("?g=xyz", "explore")).toBe("");
  });

  it("agrupa las vistas en sus destinos y sabe qué sección es de cuál", () => {
    expect(destinationOf("explore")).toBe("explore");
    expect(destinationOf("plans")).toBe("plans");
    expect(destinationOf("mine")).toBe("mine");
    expect(destinationOf("about")).toBeNull();
    expect(pathOf("plans")).toBe("planes");
    expect(pathOf("explore")).toBe("");
    expect(tabFromParam("mine", "historial")).toBe("history");
    expect(tabFromParam("explore", "historial")).toBeNull();
    expect(tabBelongs("plans", "week")).toBe(true);
    expect(tabBelongs("plans", "home")).toBe(false);
    expect(tabBelongs("mine", "home")).toBe(true);
  });
});
