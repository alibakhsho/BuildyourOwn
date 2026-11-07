"""Round 2 BuildYourOwn logo concepts: soft forms in the red, blush and lilac haze of the earlier logos.

Run with fontTools on the path:  python build.py <path-to-PlusJakartaSans-600.woff> [out-dir]
Colours were sampled from brandkit/finals/byo-logo-art-4k.jpg and brandkit/logo-v2.
Writes, per concept: symbol and horizontal lockup in colour, and a one-colour black symbol.
"""
import math
import os
import sys

sys.path.insert(0, os.path.join(os.path.dirname(os.path.abspath(__file__)), "..", "logo-v3"))
from build import GRAPHITE, f, rounded, svg, wordmark  # noqa: E402

CRIMSON, RED, CORAL, BLUSH, LILAC = "#B8141C", "#E2483D", "#F2797A", "#F9B5BF", "#C9B8F8"


def haze(gid):
    """The red to lilac haze, running bottom left to top right like the painted logo."""
    return (
        f'  <defs><linearGradient id="{gid}" gradientUnits="userSpaceOnUse" x1="40" y1="240" x2="216" y2="30">'
        f'<stop offset="0" stop-color="{CRIMSON}"/><stop offset=".26" stop-color="{RED}"/>'
        f'<stop offset=".55" stop-color="{BLUSH}"/><stop offset="1" stop-color="{LILAC}"/>'
        "</linearGradient></defs>\n"
    )


def stroke_outline(points, radii, width):
    """Outline an open centreline as one filled shape, with round ends and concentric corners."""
    h = width / 2
    n = len(points)

    def normal(a, b):
        dx, dy = b[0] - a[0], b[1] - a[1]
        length = math.hypot(dx, dy)
        return -dy / length, dx / length

    def side(sign):
        res = []
        for i, p in enumerate(points):
            if i == 0:
                nx, ny = normal(points[0], points[1])
                res.append((p[0] + sign * h * nx, p[1] + sign * h * ny))
            elif i == n - 1:
                nx, ny = normal(points[-2], points[-1])
                res.append((p[0] + sign * h * nx, p[1] + sign * h * ny))
            else:
                n1, n2 = normal(points[i - 1], p), normal(p, points[i + 1])
                mx, my = n1[0] + n2[0], n1[1] + n2[1]
                scale = sign * h / (1 + n1[0] * n2[0] + n1[1] * n2[1])
                res.append((p[0] + mx * scale, p[1] + my * scale))
        return res

    def turn(i):
        a, b, c = points[i - 1], points[i], points[i + 1]
        return (b[0] - a[0]) * (c[1] - b[1]) - (b[1] - a[1]) * (c[0] - b[0])

    left, right = side(1), side(-1)
    cap = h - 0.01
    left_r, right_r = [cap], [cap]
    for i in range(1, n - 1):
        inner_is_left = turn(i) > 0
        r = radii[i - 1]
        left_r.append(max(r - h, 2) if inner_is_left else r + h)
        right_r.append(r + h if inner_is_left else max(r - h, 2))
    left_r.append(cap)
    right_r.append(cap)
    return rounded(left + right[::-1], left_r + right_r[::-1])


# ---------------------------------------------------------------- concepts
# Each returns (parts, defs). parts: list of (path data, colour).


def doorway():
    """D: the painted logo as a clean mark. A soft house, one tall open door, set off centre."""
    cx, apex, half, eave, base = 128, 20, 104, 112, 238
    door_l, door_r, door_top = 140, 186, 120
    pts = [
        (cx, apex), (cx + half, eave), (cx + half, base), (door_r, base), (door_r, door_top),
        (door_l, door_top), (door_l, base), (cx - half, base), (cx - half, eave),
    ]
    arch = (door_r - door_l) / 2 - 0.01
    d = rounded(pts, [30, 28, 34, 10, arch, arch, 10, 34, 28])
    return [(d, "url(#haze-d)")], haze("haze-d")


def block_b():
    """E: four building blocks that stack into a B."""
    x0, top, base, gap, left_w, top_w, bottom_w = 28, 16, 240, 12, 84, 88, 104
    mid = (top + base) / 2
    y1, y2 = mid - gap / 2, mid + gap / 2
    xr = x0 + left_w + gap
    bowl = (y1 - top) / 2 - 0.01
    tiles = [
        (rounded([(x0, top), (x0 + left_w, top), (x0 + left_w, y1), (x0, y1)], [16, 6, 6, 6]), BLUSH),
        (rounded([(xr, top), (xr + top_w, top), (xr + top_w, y1), (xr, y1)], [6, bowl, bowl, 6]), LILAC),
        (rounded([(x0, y2), (x0 + left_w, y2), (x0 + left_w, base), (x0, base)], [6, 6, 6, 16]), RED),
        (rounded([(xr, y2), (xr + bottom_w, y2), (xr + bottom_w, base), (xr, base)], [6, bowl, bowl, 6]), CORAL),
    ]
    return tiles, ""


def layers():
    """F: a house that grows outward from its front door, one soft band at a time."""
    cx, base, k = 128, 238, 0.82
    slant = math.sqrt(1 + k * k)

    def outline(half, top):
        return (cx - half, base), (cx - half, top + half * k), (cx, top), (cx + half, top + half * k), (cx + half, base)

    def band(half, top, width, r_out, r_in):
        o = outline(half, top)
        i = outline(half - width, top + width * slant)
        pts = list(o) + list(i[::-1])
        return rounded(pts, [7, r_out * 0.8, r_out, r_out * 0.8, 7, 7, r_in * 0.8, r_in, r_in * 0.8, 7])

    band_w, gap = 28, 13
    half, top = 106, 20
    outer = band(half, top, band_w, 36, 12)
    half2, top2 = half - band_w - gap, top + (band_w + gap) * slant
    middle = band(half2, top2, band_w, 14, 6)
    half3, top3 = half2 - band_w - gap, top2 + (band_w + gap) * slant
    door = rounded(list(outline(half3, top3)), [7, 8, 10, 8, 7])
    return [(outer, LILAC), (middle, BLUSH), (door, RED)], ""


def one_line():
    """G: the whole house drawn in one unbroken line that walks in the front and stops inside."""
    w = 32
    eave, apex, floor, hook = 112, 34, 224, 156
    pts = [(50, floor), (50, eave), (128, apex), (206, eave), (206, floor), (106, floor), (106, hook), (150, hook)]
    d = stroke_outline(pts, [22, 20, 22, 22, 22, 20], w)
    return [(d, "url(#haze-g)")], haze("haze-g")


CONCEPTS = {
    "d-doorway": ("Doorway", doorway),
    "e-block-b": ("Block B", block_b),
    "f-layers": ("Layers", layers),
    "g-one-line": ("One Line", one_line),
}


def paths(parts, override=None):
    return "\n".join(f'  <path fill="{override or c}" fill-rule="evenodd" d="{d}"/>' for d, c in parts)


def main():
    font_path = sys.argv[1]
    out = sys.argv[2] if len(sys.argv) > 2 else os.path.dirname(os.path.abspath(__file__))
    os.makedirs(out, exist_ok=True)
    word_d, word_w, cap = wordmark(font_path, cap_height=86, tracking=-8)
    for slug, (name, fn) in CONCEPTS.items():
        parts, defs = fn()
        title = f"BuildYourOwn logo, {name} concept"
        files = {
            f"{slug}-symbol-color.svg": svg(256, 256, title, defs + paths(parts)),
            f"{slug}-symbol-black.svg": svg(256, 256, title, paths(parts, "#000000")),
        }
        gap = 44
        word = f'\n  <path fill="{GRAPHITE}" transform="translate({f(256 + gap)} {f(128 + cap / 2 + 8)})" d="{word_d}"/>'
        files[f"{slug}-lockup-color.svg"] = svg(256 + gap + word_w + 8, 256, title, defs + paths(parts) + word)
        for name_, text in files.items():
            with open(os.path.join(out, name_), "w", encoding="utf8") as fh:
                fh.write(text)


if __name__ == "__main__":
    main()
