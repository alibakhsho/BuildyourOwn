"""Builds the BuildYourOwn logo concepts as clean vector SVG (no live text, no strokes).

Run with fontTools on the path:  python build.py <path-to-PlusJakartaSans-800.woff> [out-dir]
Each concept is written as symbol + horizontal lockup, in one-colour black and in brand colour.
"""
import math
import os
import sys

from fontTools.pens.svgPathPen import SVGPathPen
from fontTools.pens.transformPen import TransformPen
from fontTools.ttLib import TTFont

GRAPHITE = "#22262B"
RED = "#E2483D"
BLACK = "#000000"


def f(n):
    s = f"{n:.2f}".rstrip("0").rstrip(".")
    return "0" if s in ("-0", "") else s


def rounded(points, radii):
    """Closed polygon path with true circular fillets. radii: one number or one per point."""
    n = len(points)
    if not isinstance(radii, (list, tuple)):
        radii = [radii] * n
    d = []
    for i in range(n):
        p0, p1, p2 = points[i - 1], points[i], points[(i + 1) % n]
        r = radii[i]
        v1 = (p0[0] - p1[0], p0[1] - p1[1])
        v2 = (p2[0] - p1[0], p2[1] - p1[1])
        l1, l2 = math.hypot(*v1), math.hypot(*v2)
        u1 = (v1[0] / l1, v1[1] / l1)
        u2 = (v2[0] / l2, v2[1] / l2)
        cos = max(-1, min(1, u1[0] * u2[0] + u1[1] * u2[1]))
        half = math.acos(cos) / 2
        if r <= 0 or half < 1e-6:
            d.append(f"{'M' if i == 0 else 'L'}{f(p1[0])} {f(p1[1])}")
            continue
        t = r / math.tan(half)
        a = (p1[0] + u1[0] * t, p1[1] + u1[1] * t)
        b = (p1[0] + u2[0] * t, p1[1] + u2[1] * t)
        sweep = 1 if (u1[0] * u2[1] - u1[1] * u2[0]) < 0 else 0
        d.append(f"{'M' if i == 0 else 'L'}{f(a[0])} {f(a[1])}")
        d.append(f"A{f(r)} {f(r)} 0 0 {sweep} {f(b[0])} {f(b[1])}")
    return "".join(d) + "Z"


def inset(points, w):
    """Mitred inset of a clockwise (on screen) polygon."""
    n = len(points)
    lines = []
    for i in range(n):
        a, b = points[i], points[(i + 1) % n]
        dx, dy = b[0] - a[0], b[1] - a[1]
        l = math.hypot(dx, dy)
        nx, ny = -dy / l, dx / l
        lines.append(((a[0] + nx * w, a[1] + ny * w), (dx, dy)))
    out = []
    for i in range(n):
        (p, r), (q, s) = lines[i - 1], lines[i]
        den = r[0] * s[1] - r[1] * s[0]
        t = ((q[0] - p[0]) * s[1] - (q[1] - p[1]) * s[0]) / den
        out.append((p[0] + r[0] * t, p[1] + r[1] * t))
    return out


# ---------------------------------------------------------------- concepts
# Each returns a list of (path_data, role). role "main" or "accent".


def bottom_line():
    """A: a house whose walls are the lines of a quote. The last line, the total, is red."""
    cx, apex, eave, base = 128, 18, 126, 238
    roof_half, wall_half = 108, 90  # 45 degree roof with real eaves past the walls
    gap, rows, r = 14, 3, 7
    parts = [(rounded([(cx, apex), (cx + roof_half, eave), (cx - roof_half, eave)], [12, r, r]), "main")]
    y = eave + gap
    h = (base - y - gap * (rows - 1)) / rows
    for i in range(rows):
        box = [(cx - wall_half, y), (cx + wall_half, y), (cx + wall_half, y + h), (cx - wall_half, y + h)]
        parts.append((rounded(box, r), "accent" if i == rows - 1 else "main"))
        y += h + gap
    return parts


def b_house():
    """B: a lowercase b whose bowl is a house. The brand's red square is the front door."""
    left, right, base, top, w, door = 34, 222, 238, 16, 36, 52
    eave = 158
    cxr = (left + right) / 2
    peak = (cxr, eave - (cxr - left))
    stem_r = left + w
    join = eave - (stem_r - left)
    outer = [(left, top), (stem_r, top), (stem_r, join), peak, (right, eave), (right, base), (left, base)]
    counter = inset([(left, eave), peak, (right, eave), (right, base), (left, base)], w)
    d = rounded(outer, [8, 8, 0, 12, 12, 18, 18]) + rounded(list(reversed(counter)), [6, 6, 4, 4, 4])
    xs = [p[0] for p in counter]
    floor = max(p[1] for p in counter)
    x0 = (min(xs) + max(xs)) / 2 - door / 2
    box = [(x0, floor - door), (x0 + door, floor - door), (x0 + door, floor), (x0, floor)]
    return [(d, "main"), (rounded(box, [5, 5, 0, 0]), "accent")]


def your_house():
    """C: the gap inside the house is a Y for Your. The brand's red square tips up to become the roof."""
    cx, apex, eave_half, base = 128, 18, 106, 238
    eave = apex + eave_half
    g, jy = 18, 170
    root2 = math.sqrt(2)
    roof_c = apex + cx  # left roof line: y = roof_c - x

    vy = jy - g / root2  # lower vertex of the tipped square
    lx = (roof_c + cx - vy) / 2
    diamond = [(cx, apex), (2 * cx - lx, roof_c - lx), (cx, vy), (lx, roof_c - lx)]

    c = jy + g / root2 - cx  # lower edge of the left arm: y = c + x
    qx = (roof_c - c) / 2
    sx = cx - g / 2
    wall = [(cx - eave_half, eave), (qx, roof_c - qx), (sx, c + sx), (sx, base), (cx - eave_half, base)]
    mirror = [(2 * cx - x, y) for x, y in reversed(wall)]
    return [
        (rounded(wall, [3, 3, 6, 6, 16]), "main"),
        (rounded(mirror, [16, 6, 6, 3, 3]), "main"),
        (rounded(diamond, [12, 3, 3, 3]), "accent"),
    ]


CONCEPTS = {
    "a-bottom-line": ("Bottom Line", bottom_line),
    "b-house-b": ("House b", b_house),
    "c-your-house": ("Your House", your_house),
}


# ---------------------------------------------------------------- wordmark
KERN = {("Y", "o"): -78, ("B", "u"): -6, ("r", "O"): -8, ("O", "w"): -14, ("w", "n"): -4}


def wordmark(font_path, text="BuildYourOwn", cap_height=92, tracking=-12):
    font = TTFont(font_path)
    gs = font.getGlyphSet()
    cmap = font.getBestCmap()
    upm = font["head"].unitsPerEm
    cap = getattr(font["OS/2"], "sCapHeight", 0) or 0.7 * upm
    scale = cap_height / cap
    x = 0
    paths = []
    for i, ch in enumerate(text):
        name = cmap[ord(ch)]
        pen = SVGPathPen(gs, ntos=lambda v: f(v))
        tp = TransformPen(pen, (scale, 0, 0, -scale, x * scale, 0))
        gs[name].draw(tp)
        paths.append(pen.getCommands())
        adv = gs[name].width + tracking
        if i + 1 < len(text):
            adv += KERN.get((ch, text[i + 1]), 0)
        x += adv
    return "".join(paths), x * scale, cap_height


# ---------------------------------------------------------------- output
def svg(view_w, view_h, title, body):
    return (
        f'<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 {f(view_w)} {f(view_h)}" '
        f'width="{f(view_w)}" height="{f(view_h)}" role="img" aria-labelledby="t">\n'
        f'  <title id="t">{title}</title>\n{body}\n</svg>\n'
    )


def fills(parts, main, accent):
    return "\n".join(
        f'  <path fill="{accent if role == "accent" else main}" fill-rule="evenodd" d="{d}"/>'
        for d, role in parts
    )


def main():
    font_path = sys.argv[1]
    out = sys.argv[2] if len(sys.argv) > 2 else os.path.dirname(os.path.abspath(__file__))
    os.makedirs(out, exist_ok=True)
    word_d, word_w, cap = wordmark(font_path)
    for slug, (name, fn) in CONCEPTS.items():
        parts = fn()
        title = f"BuildYourOwn logo, {name} concept"
        for suffix, m, a in (("black", BLACK, BLACK), ("color", GRAPHITE, RED)):
            with open(os.path.join(out, f"{slug}-symbol-{suffix}.svg"), "w", encoding="utf8") as fh:
                fh.write(svg(256, 256, title, fills(parts, m, a)))
            gap = 44
            total = 256 + gap + word_w + 8
            word_y = 128 + cap / 2 + 8
            body = fills(parts, m, a) + (
                f'\n  <path fill="{m}" transform="translate({f(256 + gap)} {f(word_y)})" d="{word_d}"/>'
            )
            with open(os.path.join(out, f"{slug}-lockup-{suffix}.svg"), "w", encoding="utf8") as fh:
                fh.write(svg(total, 256, title, body))


if __name__ == "__main__":
    main()
