#!/usr/bin/env python3
"""Compose a sharp labeled before|after 16:9 PNG (Pillow; no qlmanage blur)."""

from __future__ import annotations

from pathlib import Path

from PIL import Image, ImageDraw, ImageFont

HERE = Path(__file__).resolve().parent
W, H = 2400, 1350  # 16:9 retina-ish for social
HALF = W // 2
HEADER = 110
FOOTER = 72
PAD = 48

BEFORE_BG = (255, 245, 245)
AFTER_BG = (245, 248, 255)
BEFORE_HEAD = (185, 28, 28)
AFTER_HEAD = (37, 99, 235)
FOOTER_BEFORE = (127, 29, 29)
FOOTER_AFTER = (30, 58, 138)
WHITE = (255, 255, 255)


def load_font(size: int, bold: bool = False) -> ImageFont.FreeTypeFont | ImageFont.ImageFont:
    candidates = [
        "/System/Library/Fonts/Supplemental/Arial Bold.ttf" if bold else "/System/Library/Fonts/Supplemental/Arial.ttf",
        "/Library/Fonts/Arial Unicode.ttf",
        "/System/Library/Fonts/Supplemental/Helvetica.ttc",
    ]
    for path in candidates:
        try:
            return ImageFont.truetype(path, size=size)
        except OSError:
            continue
    return ImageFont.load_default()


def fit_diagram(src: Path, box_w: int, box_h: int) -> Image.Image:
    im = Image.open(src).convert("RGBA")
    # Crop near-white margins so diagrams fill the panel.
    alpha = im.split()[-1]
    bbox = im.getbbox() or alpha.getbbox()
    if bbox:
        im = im.crop(bbox)
    scale = min(box_w / im.width, box_h / im.height)
    new_size = (max(1, int(im.width * scale)), max(1, int(im.height * scale)))
    return im.resize(new_size, Image.Resampling.LANCZOS)


def paste_centered(canvas: Image.Image, diagram: Image.Image, box: tuple[int, int, int, int]) -> None:
    x0, y0, x1, y1 = box
    bw, bh = x1 - x0, y1 - y0
    x = x0 + (bw - diagram.width) // 2
    y = y0 + (bh - diagram.height) // 2
    canvas.alpha_composite(diagram, (x, y))


def main() -> None:
    before_src = HERE / "before-invented.png"
    after_src = HERE / "after-honest.png"
    out = HERE / "before-after-side.png"

    canvas = Image.new("RGBA", (W, H), WHITE)
    draw = ImageDraw.Draw(canvas)

    draw.rectangle([0, 0, HALF, H], fill=BEFORE_BG)
    draw.rectangle([HALF, 0, W, H], fill=AFTER_BG)
    draw.rectangle([0, 0, HALF, HEADER], fill=BEFORE_HEAD)
    draw.rectangle([HALF, 0, W, HEADER], fill=AFTER_HEAD)

    title = load_font(52, bold=True)
    foot = load_font(26, bold=False)

    draw.text((PAD, 32), "BEFORE — invented", fill=WHITE, font=title)
    draw.text((HALF + PAD, 32), "AFTER — honest", fill=WHITE, font=title)

    draw.text(
        (PAD, H - FOOTER + 18),
        "No evidence. Looks complete. Guesswork.",
        fill=FOOTER_BEFORE,
        font=foot,
    )
    draw.text(
        (HALF + PAD, H - FOOTER + 18),
        "Verified path + labeled companions · github.com/albegosu/honest-arch-diagrams",
        fill=FOOTER_AFTER,
        font=foot,
    )

    # Subtle center divider
    draw.rectangle([HALF - 2, HEADER, HALF + 2, H - FOOTER], fill=(226, 232, 240))

    box_w = HALF - PAD * 2
    box_h = H - HEADER - FOOTER - PAD * 2
    before = fit_diagram(before_src, box_w, box_h)
    after = fit_diagram(after_src, box_w, box_h)
    paste_centered(canvas, before, (PAD, HEADER + PAD, HALF - PAD, H - FOOTER - PAD))
    paste_centered(canvas, after, (HALF + PAD, HEADER + PAD, W - PAD, H - FOOTER - PAD))

    rgb = canvas.convert("RGB")
    rgb.save(out, format="PNG", optimize=True)
    print(f"wrote {out} ({W}x{H})")


if __name__ == "__main__":
    main()
