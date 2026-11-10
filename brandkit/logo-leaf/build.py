"""Leaf-roof ByO mark: writes the SVG sources. Run render.cjs after to make the PNGs.
python3 brandkit/logo-leaf/build.py && node brandkit/logo-leaf/render.cjs"""
import math, os, json
HERE=os.path.dirname(os.path.abspath(__file__))
INK="#1F1C1A"; CREAM="#F4EFE6"; CORAL="#E8574E"; LILAC="#BDAEDD"
def leaf(ax,ay,bx,by,w):
    dx,dy=bx-ax,by-ay; L=math.hypot(dx,dy); nx,ny=-dy/L*w,dx/L*w
    c=lambda t,k:(ax+dx*t+nx*k, ay+dy*t+ny*k)
    a1,a2,b1,b2=c(.35,1),c(.7,1),c(.7,-1),c(.35,-1)
    f=lambda p:f"{p[0]:.2f} {p[1]:.2f}"
    return f'M{ax} {ay}C{f(a1)} {f(a2)} {bx} {by}C{f(b1)} {f(b2)} {ax} {ay}Z'
L=leaf(112,214,196,118,40); R=leaf(204,118,288,214,-40)
DOOR="M176 286V236A24 24 0 0 1 224 236V286Z"
# mark occupies roughly x 108-292, y 100-291 -> square box centred on it
VB="100 96 200 200"
def mark(ink):
    return (f'<path d="{L}" fill="{CORAL}"/><path d="{R}" fill="{LILAC}"/>'
            f'<path d="{DOOR}" fill="{ink}"/>'
            f'<path d="M124 286H276" stroke="{ink}" stroke-width="9" stroke-linecap="round"/>')
def svg(body, vb=VB, w=200, h=200, title="ByO leaf-roof mark"):
    return f'<svg xmlns="http://www.w3.org/2000/svg" viewBox="{vb}" width="{w}" height="{h}" role="img"><title>{title}</title>{body}</svg>\n'
out={}
out["mark-light.svg"]=svg(mark(INK))
out["mark-dark.svg"]=svg(mark(CREAM))
# favicon: ink parts flip to cream on dark browser chrome
out["favicon.svg"]=svg(f'<style>.i{{fill:{INK};stroke:{INK}}}@media (prefers-color-scheme:dark){{.i{{fill:{CREAM};stroke:{CREAM}}}}}</style>'
    f'<path d="{L}" fill="{CORAL}"/><path d="{R}" fill="{LILAC}"/><path class="i" d="{DOOR}" stroke="none"/>'
    f'<path class="i" d="M124 286H276" stroke-width="9" stroke-linecap="round" fill="none"/>', vb="104 100 192 192")
def tile(bg, scale, w=1024, round_=False):
    # mark centred on a square tile; scale = mark box / tile side
    s=w*scale/200; ox=(w-200*s)/2-100*s; oy=(w-200*s)/2-96*s
    bgel=f'<circle cx="{w/2}" cy="{w/2}" r="{w/2}" fill="{bg}"/>' if round_ else (f'<rect width="{w}" height="{w}" fill="{bg}"/>' if bg else '')
    return svg(bgel+f'<g transform="translate({ox:.2f} {oy:.2f}) scale({s:.4f})">{mark(INK if bg!=INK else CREAM)}</g>', vb=f"0 0 {w} {w}", w=w, h=w, title="ByO app icon")
out["icon.svg"]=tile(CREAM,.66)            # app icon, iOS, PWA any
out["icon-maskable.svg"]=tile(CREAM,.52)   # inside the 80% safe circle
out["icon-round.svg"]=tile(CREAM,.6,round_=True)
out["icon-foreground.svg"]=tile(None,.86)  # android adaptive fg (xml already insets 16.7%)
out["icon-background.svg"]=svg(f'<rect width="1024" height="1024" fill="{CREAM}"/>', vb="0 0 1024 1024", w=1024, h=1024)
json.dump({"bg":CREAM,"ink":INK},open(os.path.join(HERE,"colors.json"),"w"))
for k,v in out.items(): open(os.path.join(HERE,k),"w").write(v)
print(len(out),"svgs")
