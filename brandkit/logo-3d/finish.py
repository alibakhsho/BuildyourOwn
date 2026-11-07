"""Finishes the tinted glass house from its raw renders: exact brand backgrounds, a cut-out,
wordmark lockups, icons and a flat small-size mark. Needs Pillow, numpy and fontTools.
Usage: python finish.py <PlusJakartaSans-600.woff> <render_png.py>
"""
import math
import os
import subprocess
import sys

import numpy as np
from PIL import Image, ImageDraw, ImageFilter

sys.path.insert(0, os.path.join(os.path.dirname(os.path.abspath(__file__)), "..", "logo-v3"))
from build import f, wordmark  # noqa: E402

CLOUD, GRAPHITE = (246, 246, 244), (34, 38, 43)
HOUSE = [(222, 1098), (222, 598), (478, 436), (1036, 129), (1311, 596), (1311, 1096), (755, 1394)]
OUT = "final"


def polygon_alpha(size, pts, scale=4):
    big = Image.new("L", (size[0] * scale, size[1] * scale), 0)
    ImageDraw.Draw(big).polygon([(x * scale, y * scale) for x, y in pts], fill=255)
    return big.resize(size, Image.LANCZOS)


def vibrance(a, amount):
    grey = a.mean(axis=2, keepdims=True)
    return np.clip(grey + (a - grey) * amount, 0, 255)


def cloud_hero():
    im = np.asarray(Image.open("glass/cloud-a.png").convert("RGB")).astype(np.float32)
    h, w, _ = im.shape
    house = np.asarray(polygon_alpha((w, h), HOUSE)).astype(np.float32) / 255
    chroma = im.max(axis=2) - im.min(axis=2)
    lum = im.mean(axis=2)
    bg_ref = np.median(im[(house == 0) & (chroma < 26) & (lum > 190)], axis=0)
    graded = np.clip(im * (np.array(CLOUD) / bg_ref), 0, 255)
    # Keep the object, its shadow and the coloured light on the floor; the rest becomes flat Cloud.
    away = np.abs(lum - bg_ref.mean()) > 34
    near = Image.fromarray((house * 255).astype(np.uint8)).filter(ImageFilter.GaussianBlur(120))
    near = (np.asarray(near).astype(np.float32) / 255) > 0.04  # ignore stray patches far from the house
    keep = np.maximum(house, (((chroma > 34) | away) & near).astype(np.float32))
    k = Image.fromarray((keep * 255).astype(np.uint8)).filter(ImageFilter.MedianFilter(9))
    k = k.filter(ImageFilter.GaussianBlur(34))
    k = np.clip(np.asarray(k).astype(np.float32) / 255 * 1.9, 0, 1)
    solid = Image.fromarray((house * 255).astype(np.uint8)).filter(ImageFilter.GaussianBlur(1))
    k = np.maximum(k, np.asarray(solid).astype(np.float32) / 255)[..., None]
    obj = vibrance(graded, 1.22)
    hmask = house[..., None]
    floor = np.minimum(graded, np.array(CLOUD, dtype=np.float32))  # the floor never glows brighter than Cloud
    graded = floor * (1 - hmask) + obj * hmask
    out = graded * k + np.array(CLOUD) * (1 - k)
    Image.fromarray(out.astype(np.uint8)).save(f"{OUT}/glass-hero-cloud.png")
    return obj


def cutout(obj):
    h, w, _ = obj.shape
    alpha = polygon_alpha((w, h), HOUSE)
    rgba = Image.fromarray(obj.astype(np.uint8)).convert("RGBA")
    rgba.putalpha(alpha)
    c = rgba.crop(alpha.getbbox())
    c.save(f"{OUT}/glass-house-cutout.png")
    return c


def dark_hero(obj):
    """The master house on exact Graphite, with a soft glow of its own colours behind it."""
    h, w, _ = obj.shape
    alpha = polygon_alpha((w, h), HOUSE)
    rgba = Image.fromarray(obj.astype(np.uint8)).convert("RGBA")
    rgba.putalpha(alpha)
    vivid = Image.fromarray(vibrance(obj, 2.6).astype(np.uint8)).convert("RGBA")
    vivid.putalpha(alpha)
    glow = vivid.filter(ImageFilter.GaussianBlur(95))
    glow.putalpha(glow.getchannel("A").point(lambda v: int(v * 0.24)))
    s = Image.new("RGBA", (w, h), GRAPHITE + (255,))
    s.alpha_composite(glow)
    s.alpha_composite(rgba)
    s.convert("RGB").save(f"{OUT}/glass-hero-dark.png")


def word_png(font, colour, name, render):
    d, w, cap = wordmark(font, cap_height=86, tracking=-8)
    pad = 6
    hgt = cap + 34
    svg = (
        f'<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 {f(w + 2 * pad)} {f(hgt)}" '
        f'width="{f(w + 2 * pad)}" height="{f(hgt)}">'
        f'<path fill="{colour}" transform="translate({pad} {f(cap + 6)})" d="{d}"/></svg>'
    )
    src = f"{OUT}/{name}.svg"
    with open(src, "w", encoding="utf8") as fh:
        fh.write(svg)
    png = f"{OUT}/{name}.png"
    wpx = 1500
    hpx = round(wpx * hgt / (w + 2 * pad))
    subprocess.run([sys.executable, render, src, "-o", png, "--width", str(wpx), "--height", str(hpx)], check=True, capture_output=True)
    img = Image.open(png).convert("RGBA")
    img.load()
    os.remove(src)
    os.remove(png)
    return img


def lockup(house, word, bg, name):
    W, H = 2400, 800
    s = Image.new("RGBA", (W, H), bg + (255,))
    hh = 600
    hw = round(house.width * hh / house.height)
    ho = house.resize((hw, hh), Image.LANCZOS)
    ww = W - hw - 120 * 2 - 90
    wo = word.resize((ww, round(word.height * ww / word.width)), Image.LANCZOS)
    s.alpha_composite(ho, (120, (H - hh) // 2))
    s.alpha_composite(wo, (120 + hw + 90, (H - wo.height) // 2))
    s.convert("RGB").save(f"{OUT}/{name}.png")


def square(house, bg, size, fill, name):
    s = Image.new("RGBA", (size, size), bg + (255,))
    t = round(size * fill)
    r = min(t / house.width, t / house.height)
    ho = house.resize((round(house.width * r), round(house.height * r)), Image.LANCZOS)
    s.alpha_composite(ho, ((size - ho.width) // 2, (size - ho.height) // 2))
    s.convert("RGB").save(f"{OUT}/{name}.png")


def flat_mark():
    c, s_ = math.cos(math.radians(30)), 0.5
    w = l = 104
    h = 84
    rise = math.tan(math.radians(60)) * (w / 2 * c) - w / 2 * s_
    B = (128, 236)
    P = (128, 236 - h)
    L = (P[0] - w * c, P[1] - w * s_)
    BL = (B[0] - w * c, B[1] - w * s_)
    R = ((P[0] + L[0]) / 2, (P[1] + L[1]) / 2 - rise)
    E = (P[0] + l * c, P[1] - l * s_)
    BE = (B[0] + l * c, B[1] - l * s_)
    R2 = (R[0] + l * c, R[1] - l * s_)
    off = 128 - (R2[1] + B[1]) / 2

    def wall(t, u):
        return (B[0] - t * w * c, B[1] - t * w * s_ - u)

    def poly(pts, col):
        return f'  <polygon fill="{col}" points="' + " ".join(f"{f(x)},{f(y + off)}" for x, y in pts) + '"/>'

    door = [wall(0.33, 0), wall(0.33, 58), wall(0.67, 58), wall(0.67, 0)]
    body = "\n".join([
        poly([B, P, R, L, BL], "#F2797A"),
        poly([B, BE, E, P], "#B9A5F5"),
        poly([P, E, R2, R], "#DAD0FA"),
        poly(door, "#B8141C"),
    ])
    svg = (
        '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 256 256" width="256" height="256" '
        'role="img" aria-labelledby="t">\n'
        f'  <title id="t">BuildYourOwn house mark</title>\n{body}\n</svg>\n'
    )
    with open(f"{OUT}/house-flat.svg", "w", encoding="utf8") as fh:
        fh.write(svg)


def main():
    font, render = sys.argv[1], sys.argv[2]
    os.makedirs(OUT, exist_ok=True)
    obj = cloud_hero()
    house = cutout(obj)
    dark_hero(obj)
    flat_mark()
    lockup(house, word_png(font, "#22262B", "_w1", render), CLOUD, "glass-lockup-cloud")
    lockup(house, word_png(font, "#F6F6F4", "_w2", render), GRAPHITE, "glass-lockup-dark")
    square(house, CLOUD, 1080, 0.62, "instagram-profile")
    square(house, CLOUD, 1024, 0.72, "app-icon")


if __name__ == "__main__":
    main()
