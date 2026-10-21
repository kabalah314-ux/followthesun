import { describe, expect, it } from "vitest";
import { destinationOf, matchRoute, pathOf, searchForView } from "../routing";

describe("rutas de los cuatro destinos", () => {
  it("entiende las rutas nuevas", () => {
    expect(matchRoute("", null)).toEqual({ view: "now", legacy: false });
    expect(matchRoute("mapa", null)).toEqual({ view: "explore", legacy: false });
    expect(matchRoute("lugar/placa-del-sol--w123", null)).toEqual({ view: "explore", legacy: false });
    expect(matchRoute("buscar", null)).toEqual({ view: "find", legacy: false });
    expect(matchRoute("buscar/", "mas-tarde")).toEqual({ view: "plan", legacy: false });
    expect(matchRoute("buscar", "lugares")).toEqual({ view: "places", legacy: false });
    expect(matchRoute("buscar", "sorprendeme")).toEqual({ view: "recommended", legacy: false });
    expect(matchRoute("buscar", "otra-cosa")).toEqual({ view: "find", legacy: false });
    expect(matchRoute("mis-sitios", null)).toEqual({ view: "saved", legacy: false });
    expect(matchRoute("ajustes", null)).toEqual({ view: "settings", legacy: false });
    expect(matchRoute("acerca-de", null)).toEqual({ view: "about", legacy: false });
    expect(matchRoute("no-existe", null)).toBeNull();
  });

  it("marca las rutas antiguas para redirigirlas", () => {
    expect(matchRoute("find", null)).toEqual({ view: "find", legacy: true });
    expect(matchRoute("plan", null)).toEqual({ view: "plan", legacy: true });
    expect(matchRoute("places", null)).toEqual({ view: "places", legacy: true });
    expect(matchRoute("recomendados", null)).toEqual({ view: "recommended", legacy: true });
    expect(matchRoute("saved", null)).toEqual({ view: "saved", legacy: true });
    expect(matchRoute("settings", null)).toEqual({ view: "settings", legacy: true });
  });

  it("escribe la pestaña de Buscar en la query y conserva el resto", () => {
    expect(searchForView("?hora=17%3A30&dia=2026-10-24", "plan")).toBe("?hora=17%3A30&dia=2026-10-24&pestana=mas-tarde");
    expect(searchForView("?pestana=lugares&debug=weather", "find")).toBe("?debug=weather");
    expect(searchForView("?pestana=lugares", "explore")).toBe("");
    expect(searchForView("", "recommended")).toBe("?pestana=sorprendeme");
  });

  it("agrupa las vistas en sus destinos", () => {
    expect(destinationOf("now")).toBe("now");
    expect(destinationOf("explore")).toBe("map");
    expect(destinationOf("places")).toBe("search");
    expect(destinationOf("saved")).toBe("mine");
    expect(destinationOf("about")).toBeNull();
    expect(pathOf("plan")).toBe("buscar");
    expect(pathOf("now")).toBe("");
  });
});
