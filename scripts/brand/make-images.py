#!/usr/bin/env python3
"""Genera los iconos de la app (PWA) y la imagen Open Graph a partir del logotipo.

    python3 scripts/brand/make-images.py

Dibuja la marca de I Follow the Sun (arco de la trayectoria solar en puntos, horizonte y disco del
sol) con Pillow, a 4x y reducida con Lanczos para que los bordes salgan suaves. Escribe en public/:

    icons/icon-192.png · icons/icon-512.png      icono «any», cuadrado redondeado
    icons/maskable-512.png                       icono «maskable» (Android), a sangre, zona segura
    icons/apple-touch-icon.png                   180 px, a sangre (iOS redondea las esquinas)
    og-image.png                                 1200×630 para compartir enlaces

Fuentes: Lora (titular, serif como Instrument Serif) y Poppins (texto), de /usr/share/fonts.
"""
from __future__ import annotations

import math
import os
from pathlib import Path

from PIL import Image, ImageDraw, ImageFilter, ImageFont

ROOT = Path(__file__).resolve().parents[2]
OUT = ROOT / "public"
FONTS = Path(os.environ.get("FTS_FONTS", "/usr/share/fonts/truetype/google-fonts"))

PAPER = (246, 241, 232)
INK = (31, 28, 38)
SUN = (232, 146, 58)
SUN_DEEP = (194, 109, 23)
SS = 4  # supermuestreo


def draw_mark(draw: ImageDraw.ImageDraw, ox: float, oy: float, u: float) -> None:
    """La marca en unidades del favicon (viewBox 48): arco r=15 centrado en (24, 33)."""
    stroke = 1.7 * u
    # Arco de la trayectoria: puntos redondos cada ~5 unidades (como el trazo discontinuo del SVG).
    cx, cy, r = 24.0, 33.0, 15.0
    steps = 19
    for i in range(steps):
        a = math.pi + (math.pi * i / (steps - 1))  # de 180° a 360°: el semicírculo de arriba
        x = ox + (cx + r * math.cos(a)) * u
        y = oy + (cy + r * math.sin(a)) * u
        d = stroke * 0.95
        draw.ellipse([x - d / 2, y - d / 2, x + d / 2, y + d / 2], fill=INK)
    # Horizonte.
    y = oy + 33.0 * u
    draw.rounded_rectangle([ox + 7 * u, y - stroke / 2, ox + 41 * u, y + stroke / 2], radius=stroke / 2, fill=INK)
    # Sol, a media mañana sobre el arco.
    sx, sy, sr = ox + 15.5 * u, oy + 21.5 * u, 5.9 * u
    draw.ellipse([sx - sr, sy - sr, sx + sr, sy + sr], fill=SUN)


def icon(size: int, *, rounded: bool, safe: float) -> Image.Image:
    """Icono cuadrado; `safe` = fracción del lado que puede ocupar la marca (34 × 18 unidades)."""
    S = size * SS
    img = Image.new("RGBA", (S, S), (0, 0, 0, 0))
    d = ImageDraw.Draw(img)
    if rounded:
        d.rounded_rectangle([0, 0, S - 1, S - 1], radius=S * 13 / 48, fill=PAPER + (255,))
    else:
        d.rectangle([0, 0, S, S], fill=PAPER + (255,))
    u = S * safe / 34.0
    # Centrar la caja de la marca: x 7..41, y 15.6..34.7 (arco, sol y horizonte).
    bw, by0, by1 = 34.0 * u, 15.6 * u, 34.7 * u
    ox = (S - bw) / 2 - 7 * u
    oy = (S - (by1 - by0)) / 2 - by0
    draw_mark(d, ox, oy, u)
    return img.resize((size, size), Image.LANCZOS)


def font(name: str, size: int, variation: str | None = None) -> ImageFont.FreeTypeFont:
    f = ImageFont.truetype(str(FONTS / name), size)
    if variation:
        try:
            f.set_variation_by_name(variation)
        except Exception:
            pass
    return f


def og_image() -> Image.Image:
    W, H = 1200 * SS // 2, 630 * SS // 2  # 2x basta para texto nítido
    k = SS // 2
    img = Image.new("RGB", (W, H), PAPER)
    # Fondo: papel arriba, ámbar muy suave abajo a la derecha, como la luz de la tarde.
    glow = Image.new("RGB", (W, H), PAPER)
    gd = ImageDraw.Draw(glow)
    for i in range(60, 0, -1):
        t = i / 60
        r = int(W * 0.62 * t)
        col = tuple(int(PAPER[c] + (255 - PAPER[c] if c == 0 else (214 - PAPER[c] if c == 1 else 150 - PAPER[c])) * (1 - t) * 0.55) for c in range(3))
        gd.ellipse([W * 0.82 - r, H * 0.95 - r, W * 0.82 + r, H * 0.95 + r], fill=col)
    img = Image.blend(img, glow.filter(ImageFilter.GaussianBlur(40 * k)), 1.0)
    d = ImageDraw.Draw(img)

    # Marca a la derecha, sin tocar el texto: x 880–1152 y arco desde y≈150 (px finales).
    u = 8 * k
    draw_mark(d, 880 * k - 7 * u, 150 * k - 15.6 * u, u)

    # Texto.
    x = 80 * k
    d.text((x, 92 * k), "BARCELONA", font=font("Poppins-Medium.ttf", 26 * k), fill=SUN_DEEP)
    title = font("Lora-Variable.ttf", 92 * k, "SemiBold")
    d.text((x, 136 * k), "I Follow", font=title, fill=INK)
    d.text((x, 236 * k), "the Sun", font=title, fill=INK)
    sub = font("Poppins-Medium.ttf", 40 * k)
    d.text((x, 372 * k), "Dónde da el sol en Barcelona, ahora", font=sub, fill=INK)
    body = font("Poppins-Regular.ttf", 28 * k)
    d.text((x, 432 * k), "Sombras de edificios, nubes y terrazas al sol,", font=body, fill=(74, 69, 83))
    d.text((x, 470 * k), "minuto a minuto. Y sombra cuando hace calor.", font=body, fill=(74, 69, 83))
    # Pastilla inferior.
    pill = font("Poppins-Medium.ttf", 24 * k)
    label = "Gratis · sin registro"
    tw = d.textlength(label, font=pill)
    d.rounded_rectangle([x, 540 * k, x + tw + 48 * k, 590 * k], radius=25 * k, fill=INK)
    d.text((x + 24 * k, 551 * k), label, font=pill, fill=PAPER)
    return img.resize((1200, 630), Image.LANCZOS)


def main() -> None:
    (OUT / "icons").mkdir(parents=True, exist_ok=True)
    icon(192, rounded=True, safe=0.74).save(OUT / "icons" / "icon-192.png", optimize=True)
    icon(512, rounded=True, safe=0.74).save(OUT / "icons" / "icon-512.png", optimize=True)
    # Maskable: la marca dentro del círculo seguro (80 % del lado).
    icon(512, rounded=False, safe=0.6).save(OUT / "icons" / "maskable-512.png", optimize=True)
    icon(180, rounded=False, safe=0.7).convert("RGB").save(OUT / "icons" / "apple-touch-icon.png", optimize=True)
    og_image().save(OUT / "og-image.png", optimize=True)
    for p in sorted((OUT / "icons").glob("*.png")) + [OUT / "og-image.png"]:
        print(f"{p.relative_to(ROOT)}  {p.stat().st_size // 1024} KB")


if __name__ == "__main__":
    main()
