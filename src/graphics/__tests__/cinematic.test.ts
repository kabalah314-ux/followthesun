import { describe, expect, it } from "vitest";
import { cinematicCamera, extraInsets, fitInsets, insetsOffset, normalizeBearing } from "../cinematic";
import { pickVideoMimeType, videoFileExtension } from "../recordDayVideo";

describe("cámara cinematográfica", () => {
  it("rumbo = azimut del sol + 180°, normalizado a (−180, 180]", () => {
    expect(cinematicCamera({ sunAzimuthDeg: 180 }, 14).bearing).toBe(0);
    expect(cinematicCamera({ sunAzimuthDeg: 90 }, 14).bearing).toBe(-90);
    expect(cinematicCamera({ sunAzimuthDeg: 250 }, 14).bearing).toBe(70);
    expect(normalizeBearing(540)).toBe(180);
    expect(normalizeBearing(-190)).toBe(170);
    expect(normalizeBearing(Number.NaN)).toBe(0);
  });

  it("inclinación 60° y zoom «terraza» por defecto, dentro de los límites del mapa", () => {
    const cam = cinematicCamera({ sunAzimuthDeg: 200 }, 13, { maxPitch: 60, maxZoom: 20 });
    expect(cam.pitch).toBe(60);
    expect(cam.zoom).toBeCloseTo(17.6, 5);
    expect(cinematicCamera({ sunAzimuthDeg: 200, pitch: 80 }, 13, { maxPitch: 60, maxZoom: 20 }).pitch).toBe(60);
    expect(cinematicCamera({ sunAzimuthDeg: 200 }, 18.5, { maxPitch: 60, maxZoom: 20 }).zoom).toBe(18.5);
    expect(cinematicCamera({ sunAzimuthDeg: 200, zoom: 22 }, 13, { maxPitch: 60, maxZoom: 19 }).zoom).toBe(19);
  });
});

describe("márgenes coherentes", () => {
  it("lo que ya cubre el padding no se vuelve a desplazar", () => {
    const insets = { top: 0, right: 0, bottom: 300, left: 0 };
    expect(extraInsets(insets, insets)).toEqual({ top: 0, right: 0, bottom: 0, left: 0 });
    expect(insetsOffset(extraInsets(insets, { top: 0, right: 0, bottom: 0, left: 0 }))).toEqual([0, -150]);
    expect(extraInsets(insets, { top: 0, right: 0, bottom: 200, left: 0 }).bottom).toBe(100);
  });

  it("los márgenes se reducen para dejar mapa visible", () => {
    const f = fitInsets({ top: 0, right: 0, bottom: 900, left: 400 }, 800, 1000, 120);
    expect(f.bottom).toBe(880);
    expect(f.left).toBe(400);
  });
});

describe("formato de vídeo", () => {
  it("MP4 si el navegador sabe grabarlo; si no, WebM", () => {
    expect(pickVideoMimeType((t) => t.startsWith("video/mp4"))).toBe("video/mp4;codecs=avc1.42E01E");
    expect(pickVideoMimeType((t) => t === "video/webm;codecs=vp9")).toBe("video/webm;codecs=vp9");
    expect(pickVideoMimeType(() => false)).toBeNull();
    expect(
      pickVideoMimeType(() => {
        throw new Error("x");
      })
    ).toBeNull();
    expect(videoFileExtension("video/mp4")).toBe("mp4");
    expect(videoFileExtension("video/webm;codecs=vp8")).toBe("webm");
  });
});
