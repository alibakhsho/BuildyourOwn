"""Writes the tinted glass house into the website and the phone app's source images.
Run from brandkit/logo-3d after finish.py:
  python install_brand.py <PlusJakartaSans-600.woff> <render_png.py>
Then regenerate the native icons from ../../assets with capacitor-assets.
"""
import os
import re
import sys

from PIL import Image

from finish import CLOUD, GRAPHITE, word_png

ROOT = os.path.abspath(os.path.join(os.path.dirname(os.path.abspath(__file__)), "..", ".."))
PUBLIC = os.path.join(ROOT, "public")
ASSETS = os.path.join(ROOT, "assets")


def place(house, canvas, fill, centre=None):
    """Draw the house on a canvas, scaled so its longest side is `fill` of the canvas."""
    size = min(canvas.size)
    r = size * fill / max(house.size)
    ho = house.resize((round(house.width * r), round(house.height * r)), Image.LANCZOS)
    cx, cy = centre or (canvas.width / 2, canvas.height / 2)
    canvas.alpha_composite(ho, (round(cx - ho.width / 2), round(cy - ho.height / 2)))
    return canvas


def tile(house, size, fill, bg=CLOUD):
    return place(house, Image.new("RGBA", (size, size), bg + (255,)), fill)


def splash(house, word, bg, name):
    size = 2732
    s = Image.new("RGBA", (size, size), bg + (255,))
    place(house, s, 0.24, (size / 2, size / 2 - 130))
    ww = 800
    wo = word.resize((ww, round(word.height * ww / word.width)), Image.LANCZOS)
    s.alpha_composite(wo, ((size - ww) // 2, size // 2 + 270))
    s.convert("RGB").save(os.path.join(ASSETS, name), optimize=True)


def share_card(house, word):
    """1200x630, the shape Facebook, LinkedIn and X expect."""
    W, H = 1200, 630
    s = Image.new("RGBA", (W, H), CLOUD + (255,))
    hh = 400
    hw = round(house.width * hh / house.height)
    s.alpha_composite(house.resize((hw, hh), Image.LANCZOS), (96, (H - hh) // 2))
    ww = W - 96 * 2 - hw - 56
    wo = word.resize((ww, round(word.height * ww / word.width)), Image.LANCZOS)
    s.alpha_composite(wo, (96 + hw + 56, (H - wo.height) // 2))
    s.convert("RGB").save(os.path.join(PUBLIC, "og-image.jpg"), quality=90)


def favicon(render):
    with open("final/house-flat.svg", encoding="utf8") as fh:
        svg = fh.read()
    svg = re.sub(r'viewBox="[^"]+" width="256" height="256"', 'viewBox="21 21 214 214" width="214" height="214"', svg)
    path = os.path.join(PUBLIC, "favicon.svg")
    with open(path, "w", encoding="utf8") as fh:
        fh.write(svg)
    import subprocess

    subprocess.run([sys.executable, render, path, "-o", os.path.join(PUBLIC, "favicon-32.png"), "--size", "32"], check=True, capture_output=True)


def main():
    font, render = sys.argv[1], sys.argv[2]
    house = Image.open("final/glass-house-cutout.png").convert("RGBA")
    dark_word = word_png(font, "#22262B", "_w1", render)
    light_word = word_png(font, "#F6F6F4", "_w2", render)

    # Website
    mark = Image.new("RGBA", (256, 256), (0, 0, 0, 0))
    place(house, mark, 1.0).save(os.path.join(PUBLIC, "logo-mark.png"), optimize=True)
    tile(house, 192, 0.74).convert("RGB").save(os.path.join(PUBLIC, "icon-192.png"), optimize=True)
    tile(house, 512, 0.74).convert("RGB").save(os.path.join(PUBLIC, "icon-512.png"), optimize=True)
    tile(house, 512, 0.58).convert("RGB").save(os.path.join(PUBLIC, "icon-maskable-512.png"), optimize=True)
    favicon(render)
    share_card(house, dark_word)

    # Phone app sources. Android insets the foreground to its safe zone, so it can fill most of its canvas.
    tile(house, 1024, 0.72).convert("RGB").save(os.path.join(ASSETS, "icon-only.png"), optimize=True)
    fg = Image.new("RGBA", (1024, 1024), (0, 0, 0, 0))
    place(house, fg, 0.86).save(os.path.join(ASSETS, "icon-foreground.png"), optimize=True)
    Image.new("RGB", (1024, 1024), CLOUD).save(os.path.join(ASSETS, "icon-background.png"), optimize=True)
    splash(house, dark_word, CLOUD, "splash.png")
    splash(house, light_word, GRAPHITE, "splash-dark.png")


if __name__ == "__main__":
    main()
