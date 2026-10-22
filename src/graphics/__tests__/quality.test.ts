import { describe, expect, it } from "vitest";
import {
  QUALITY_SETTINGS,
  createFpsMonitor,
  decideQuality,
  lowerLevel,
  minLevel,
  type DeviceCapabilities,
} from "../quality";

const capable: DeviceCapabilities = {
  webgl2: true,
  maxSamples: 4,
  renderer: "ANGLE (Apple, Apple M2, OpenGL 4.1)",
  software: false,
  deviceMemory: 8,
  cores: 8,
  saveData: false,
  gpuMs: 6,
};

describe("decideQuality", () => {
  it("un dispositivo capaz va en Alta", () => {
    expect(decideQuality(capable)).toEqual({ level: "alta", reason: "ok" });
  });

  it("sin WebGL2, con ahorro de datos o sin GPU real → Ahorro (canvas)", () => {
    expect(decideQuality({ ...capable, webgl2: false }).level).toBe("ahorro");
    expect(decideQuality({ ...capable, saveData: true }).reason).toBe("save-data");
    expect(decideQuality({ ...capable, software: true }).reason).toBe("software");
    expect(decideQuality({ ...capable, deviceMemory: 2 }).reason).toBe("low-memory");
  });

  it("la prueba de GPU decide entre Alta, Media y Ahorro", () => {
    expect(decideQuality({ ...capable, gpuMs: 30 })).toEqual({ level: "media", reason: "gpu-mid" });
    expect(decideQuality({ ...capable, gpuMs: 120 })).toEqual({ level: "ahorro", reason: "gpu-slow" });
  });

  it("sin MSAA o con memoria justa → Media", () => {
    expect(decideQuality({ ...capable, maxSamples: 0 }).level).toBe("media");
    expect(decideQuality({ ...capable, deviceMemory: 3 }).level).toBe("media");
  });

  it("sin datos de memoria ni de GPU (Safari) no se penaliza", () => {
    expect(decideQuality({ ...capable, deviceMemory: null, gpuMs: null }).level).toBe("alta");
  });
});

describe("niveles", () => {
  it("bajar un nivel y el menor de dos", () => {
    expect(lowerLevel("alta")).toBe("media");
    expect(lowerLevel("media")).toBe("ahorro");
    expect(lowerLevel("ahorro")).toBe("ahorro");
    expect(minLevel("alta", "media")).toBe("media");
    expect(minLevel("ahorro", "alta")).toBe("ahorro");
  });

  it("solo Ahorro usa el canvas; Alta es la única con MSAA y antialias de la penumbra completa", () => {
    expect(QUALITY_SETTINGS.alta.webgl && QUALITY_SETTINGS.media.webgl).toBe(true);
    expect(QUALITY_SETTINGS.ahorro.webgl).toBe(false);
    expect(QUALITY_SETTINGS.alta.msaa).toBe(4);
    expect(QUALITY_SETTINGS.media.msaa).toBe(0);
    expect(QUALITY_SETTINGS.alta.penumbra).toBe("full");
    expect(QUALITY_SETTINGS.ahorro.maxPixelRatio).toBe(1);
  });

  it("3D realista: Alta árboles 3D + fachadas + relieve; Media solo la sombra de los árboles; Ahorro nada", () => {
    const { alta, media, ahorro } = QUALITY_SETTINGS;
    expect([alta.treeShadows, alta.trees3d, alta.facadeShadows, alta.hillshade]).toEqual([true, true, true, true]);
    expect(alta.shadowMapSize).toBe(2048);
    expect([media.treeShadows, media.trees3d, media.facadeShadows, media.hillshade]).toEqual([true, false, false, false]);
    expect([ahorro.treeShadows, ahorro.trees3d, ahorro.facadeShadows, ahorro.hillshade]).toEqual([false, false, false, false]);
    expect(alta.maxTrees > media.maxTrees && ahorro.maxTrees === 0).toBe(true);
  });
});

describe("createFpsMonitor", () => {
  const run = (fps: number, seconds: number, start = 0, monitor = createFpsMonitor({ minFps: 40, windowMs: 3000, onLow: () => lows.push(1) })) => {
    const step = 1000 / fps;
    for (let t = start; t <= start + seconds * 1000; t += step) monitor.frame(t);
    return monitor;
  };
  let lows: number[] = [];

  it("60 fps sostenidos no bajan la calidad", () => {
    lows = [];
    run(60, 10);
    expect(lows).toHaveLength(0);
  });

  it("30 fps durante 3 s avisan una vez por ventana", () => {
    lows = [];
    run(30, 3.2);
    expect(lows).toHaveLength(1);
  });

  it("menos de 3 s lentos no avisan", () => {
    lows = [];
    run(30, 2.5);
    expect(lows).toHaveLength(0);
  });

  it("un hueco (mapa quieto) reinicia la ventana", () => {
    lows = [];
    const m = run(30, 2);
    // 2 s lentos + pausa larga + 2 s lentos: nunca hay 3 s seguidos.
    run(30, 2, 5000, m);
    expect(lows).toHaveLength(0);
  });

  it("pause() también reinicia", () => {
    lows = [];
    const m = run(30, 2);
    m.pause();
    run(30, 2, 2100, m);
    expect(lows).toHaveLength(0);
  });
});
