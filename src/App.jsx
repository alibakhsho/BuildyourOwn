import React, { useState, useEffect, useRef, useMemo, useCallback, Children, cloneElement } from "react";
import * as THREE from "three";
import * as XLSX from "xlsx";

/* =========================================================================
   MODULE: shader.js
   WebGL2 shader hero — adapted from Matthias Hurrle's open shader work.
   Renders a flowing warm-light field behind the hero copy.
   ========================================================================= */
const DEFAULT_SHADER_SOURCE = `#version 300 es
precision highp float;
out vec4 O;
uniform vec2 resolution;
uniform float time;
#define FC gl_FragCoord.xy
#define T time
#define R resolution
#define MN min(R.x,R.y)
float rnd(vec2 p){p=fract(p*vec2(12.9898,78.233));p+=dot(p,p+34.56);return fract(p.x*p.y);}
float noise(in vec2 p){vec2 i=floor(p),f=fract(p),u=f*f*(3.-2.*f);float a=rnd(i),b=rnd(i+vec2(1,0)),c=rnd(i+vec2(0,1)),d=rnd(i+1.);return mix(mix(a,b,u.x),mix(c,d,u.x),u.y);}
float fbm(vec2 p){float t=.0,a=1.;mat2 m=mat2(1.,-.5,.2,1.2);for(int i=0;i<5;i++){t+=a*noise(p);p*=2.*m;a*=.5;}return t;}
float clouds(vec2 p){float d=1.,t=.0;for(float i=.0;i<3.;i++){float a=d*fbm(i*10.+p.x*.2+.2*(1.+i)*p.y+d+i*i+p);t=mix(t,d,a);d=a;p*=2./(i+1.);}return t;}
void main(void){
  vec2 uv=(FC-.5*R)/MN,st=uv*vec2(2,1);
  vec3 col=vec3(0);
  float bg=clouds(vec2(st.x+T*.5,-st.y));
  uv*=1.-.3*(sin(T*.2)*.5+.5);
  for(float i=1.;i<12.;i++){
    uv+=.1*cos(i*vec2(.1+.01*i,.8)+i*i+T*.5+.1*uv.x);
    vec2 p=uv;
    float d=length(p);
    col+=.00125/d*(cos(sin(i)*vec3(1,2,3))+1.);
    float b=noise(i+p+bg*1.731);
    col+=.002*b/length(max(p,vec2(b*p.x*.02,p.y)));
    col=mix(col,vec3(bg*.25,bg*.137,bg*.05),d);
  }
  O=vec4(col,1);
}`;

class ShaderRenderer {
  constructor(canvas, scale) {
    this.canvas = canvas;
    this.scale = scale;
    this.gl = canvas.getContext("webgl2");
    if (!this.gl) return;
    this.gl.viewport(0, 0, canvas.width * scale, canvas.height * scale);
    this.vertexSrc = "#version 300 es\nprecision highp float;\nin vec4 position;\nvoid main(){gl_Position=position;}";
    this.vertices = [-1, 1, -1, -1, 1, 1, 1, -1];
    this.program = null; this.vs = null; this.fs = null; this.buffer = null;
  }
  compile(shader, source) {
    const gl = this.gl;
    gl.shaderSource(shader, source);
    gl.compileShader(shader);
    if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) {
      console.error("Shader compile error:", gl.getShaderInfoLog(shader));
    }
  }
  setup(source) {
    if (!this.gl) return;
    const gl = this.gl;
    this.vs = gl.createShader(gl.VERTEX_SHADER);
    this.fs = gl.createShader(gl.FRAGMENT_SHADER);
    this.compile(this.vs, this.vertexSrc);
    this.compile(this.fs, source);
    this.program = gl.createProgram();
    gl.attachShader(this.program, this.vs);
    gl.attachShader(this.program, this.fs);
    gl.linkProgram(this.program);
    if (!gl.getProgramParameter(this.program, gl.LINK_STATUS)) {
      console.error(gl.getProgramInfoLog(this.program));
    }
  }
  init() {
    if (!this.gl) return;
    const gl = this.gl, program = this.program;
    this.buffer = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, this.buffer);
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array(this.vertices), gl.STATIC_DRAW);
    const position = gl.getAttribLocation(program, "position");
    gl.enableVertexAttribArray(position);
    gl.vertexAttribPointer(position, 2, gl.FLOAT, false, 0, 0);
    program.resolution = gl.getUniformLocation(program, "resolution");
    program.time = gl.getUniformLocation(program, "time");
  }
  updateScale(scale) {
    if (!this.gl) return;
    this.scale = scale;
    this.gl.viewport(0, 0, this.canvas.width * scale, this.canvas.height * scale);
  }
  render(now) {
    if (!this.gl || !this.program) return;
    const gl = this.gl, program = this.program;
    gl.clearColor(0, 0, 0, 1);
    gl.clear(gl.COLOR_BUFFER_BIT);
    gl.useProgram(program);
    gl.bindBuffer(gl.ARRAY_BUFFER, this.buffer);
    gl.uniform2f(program.resolution, this.canvas.width, this.canvas.height);
    gl.uniform1f(program.time, now * 1e-3);
    gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
  }
  dispose() {
    if (!this.gl) return;
    const gl = this.gl;
    if (this.program) {
      if (this.vs) { gl.detachShader(this.program, this.vs); gl.deleteShader(this.vs); }
      if (this.fs) { gl.detachShader(this.program, this.fs); gl.deleteShader(this.fs); }
      gl.deleteProgram(this.program);
    }
    if (this.buffer) gl.deleteBuffer(this.buffer);
  }
}

function useShaderBackground() {
  const canvasRef = useRef(null);
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const dpr = Math.max(1, 0.5 * window.devicePixelRatio);
    const renderer = new ShaderRenderer(canvas, dpr);
    if (!renderer.gl) return; // WebGL2 unsupported — skip silently
    renderer.setup(DEFAULT_SHADER_SOURCE);
    renderer.init();
    const resize = () => {
      canvas.width = canvas.clientWidth * dpr;
      canvas.height = canvas.clientHeight * dpr;
      renderer.updateScale(dpr);
    };
    resize();
    let frameId;
    const loop = (now) => { renderer.render(now); frameId = requestAnimationFrame(loop); };
    frameId = requestAnimationFrame(loop);
    const ro = new ResizeObserver(resize);
    ro.observe(canvas);
    return () => { cancelAnimationFrame(frameId); ro.disconnect(); renderer.dispose(); };
  }, []);
  return canvasRef;
}

/* =========================================================================
   MODULE: reveal.js — scroll-driven animations
   Pure IntersectionObserver. Variants: fade-up, fade-in, scale-up,
   slide-left, slide-right. Optional stagger across children.
   ========================================================================= */
function Reveal({ children, variant = "fade-up", delay = 0, duration = 0.7, threshold = 0.15, once = true, className = "", style = {}, as: Tag = "div" }) {
  const ref = useRef(null);
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    // Respect users with reduced motion preference — show immediately
    if (window.matchMedia && window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
      setVisible(true);
      return;
    }
    const obs = new IntersectionObserver(([entry]) => {
      if (entry.isIntersecting) {
        setVisible(true);
        if (once) obs.disconnect();
      } else if (!once) {
        setVisible(false);
      }
    }, { threshold, rootMargin: "0px 0px -40px 0px" });
    obs.observe(el);
    return () => obs.disconnect();
  }, [threshold, once]);

  const variants = {
    "fade-up": { initial: "translate3d(0, 28px, 0)", final: "translate3d(0, 0, 0)" },
    "fade-in": { initial: "translate3d(0, 0, 0)", final: "translate3d(0, 0, 0)" },
    "scale-up": { initial: "scale(0.96)", final: "scale(1)" },
    "slide-left": { initial: "translate3d(-32px, 0, 0)", final: "translate3d(0, 0, 0)" },
    "slide-right": { initial: "translate3d(32px, 0, 0)", final: "translate3d(0, 0, 0)" },
  };
  const v = variants[variant] || variants["fade-up"];

  return (
    <Tag ref={ref} className={className} style={{
      opacity: visible ? 1 : 0,
      transform: visible ? v.final : v.initial,
      transition: `opacity ${duration}s cubic-bezier(0.16, 1, 0.3, 1) ${delay}s, transform ${duration}s cubic-bezier(0.16, 1, 0.3, 1) ${delay}s`,
      willChange: "opacity, transform",
      ...style,
    }}>
      {children}
    </Tag>
  );
}

function StaggerReveal({ children, stagger = 0.08, baseDelay = 0, ...props }) {
  const arr = Children.toArray(children);
  return (
    <>
      {arr.map((child, i) => (
        <Reveal key={i} delay={baseDelay + i * stagger} {...props}>{child}</Reveal>
      ))}
    </>
  );
}

/* =========================================================================
   STYLE TOKENS — drafting-room aesthetic
   Palette: concrete dust + deep ink + hi-vis safety yellow
   ========================================================================= */
const TOKENS = {
  paper: "#EDEEF0",        // slightly brighter than v1, more welcoming
  paperLight: "#F6F7F8",
  card: "#FFFFFF",
  ink: "#14171A",
  inkSoft: "#3B414A",
  steel: "#6B7279",
  rule: "#D5D8DC",
  hivis: "#F5C518",
  hivisDeep: "#D9AC00",
  ember: "#F58E1A",        // hero warmth — bridges shader colors to UI
  emberDeep: "#D96E0A",
  alert: "#C8480E",
  ok: "#3A7D44",
  grid: "rgba(20,23,26,0.045)",
};

const FONT_URL = "https://fonts.googleapis.com/css2?family=Barlow+Condensed:wght@500;600;700;800&family=Inter:wght@400;500;600&family=JetBrains+Mono:wght@400;500;700&display=swap";

/* =========================================================================
   MODULE: materials.js
   Region-specific catalog of construction materials with indicative rates.
   Rates are AUD/USD/GBP per unit, in local market 2025.
   These are guides — not quotes. Real prices vary by supplier and date.
   ========================================================================= */
const Materials = {
  /* Each material: id, label, unit, category, regions: { AU: { rate, supplier, sku? } } */
  catalog: [
    // ---- FOUNDATION ----
    { id: "concrete_25mpa", label: "Ready-mix concrete (25 MPa)", unit: "m³", category: "foundation",
      regions: { AU: 320, US: 220, UK: 175 }, note: "Slab and footing concrete" },
    { id: "rebar_n12", label: "Reinforcement bar (N12)", unit: "tonne", category: "foundation",
      regions: { AU: 1850, US: 1100, UK: 1050 } },
    { id: "termite_membrane", label: "Termite barrier membrane", unit: "m²", category: "foundation",
      regions: { AU: 28, US: 14, UK: 0 }, note: "Required AS 3660.1 in termite-prone zones" },
    { id: "polythene_dpm", label: "Polythene damp-proof membrane", unit: "m²", category: "foundation",
      regions: { AU: 4, US: 2.5, UK: 3 } },

    // ---- FRAME ----
    { id: "timber_mgp10", label: "Pine framing (MGP10 90×35)", unit: "lin.m", category: "frame",
      regions: { AU: 5.20, US: 2.80, UK: 3.10 }, note: "Standard wall stud / plate" },
    { id: "lvl_beam", label: "LVL structural beam (240×45)", unit: "lin.m", category: "frame",
      regions: { AU: 38, US: 22, UK: 28 } },
    { id: "steel_lintel", label: "Galvanised steel lintel", unit: "lin.m", category: "frame",
      regions: { AU: 65, US: 38, UK: 42 } },
    { id: "structural_steel", label: "Structural steel UB/UC", unit: "tonne", category: "frame",
      regions: { AU: 4200, US: 2800, UK: 2900 } },

    // ---- ROOF ----
    { id: "colorbond_sheet", label: "Colorbond steel sheet roofing", unit: "m²", category: "roof",
      regions: { AU: 42, US: 32, UK: 36 }, note: "Cyclone-rated profiles available" },
    { id: "concrete_tile", label: "Concrete roof tiles", unit: "m²", category: "roof",
      regions: { AU: 38, US: 24, UK: 28 } },
    { id: "asphalt_shingle", label: "Asphalt shingles", unit: "m²", category: "roof",
      regions: { AU: 35, US: 18, UK: 22 } },
    { id: "roof_insulation", label: "Anticon roof blanket R3.0", unit: "m²", category: "roof",
      regions: { AU: 12, US: 8, UK: 10 } },
    { id: "guttering", label: "Quad gutter + downpipes", unit: "lin.m", category: "roof",
      regions: { AU: 28, US: 16, UK: 18 } },

    // ---- CLADDING / EXTERIOR ----
    { id: "brick_veneer", label: "Clay brick veneer (incl. mortar)", unit: "m²", category: "cladding",
      regions: { AU: 95, US: 70, UK: 65 } },
    { id: "weatherboard", label: "Weatherboard (fibre cement)", unit: "m²", category: "cladding",
      regions: { AU: 78, US: 48, UK: 55 } },
    { id: "render", label: "Acrylic render on blockwork", unit: "m²", category: "cladding",
      regions: { AU: 65, US: 38, UK: 45 } },
    { id: "wall_insulation", label: "Wall batt insulation R2.5", unit: "m²", category: "cladding",
      regions: { AU: 14, US: 9, UK: 11 } },

    // ---- OPENINGS ----
    { id: "window_alum_double", label: "Aluminium window, double-glazed", unit: "m²", category: "openings",
      regions: { AU: 720, US: 440, UK: 480 } },
    { id: "door_external", label: "External entry door (solid + frame)", unit: "ea", category: "openings",
      regions: { AU: 1850, US: 950, UK: 1100 } },
    { id: "door_internal", label: "Internal hollow-core door + frame", unit: "ea", category: "openings",
      regions: { AU: 380, US: 180, UK: 220 } },
    { id: "garage_door", label: "Sectional garage door, motorised", unit: "ea", category: "openings",
      regions: { AU: 2400, US: 1400, UK: 1600 } },

    // ---- INTERIOR ----
    { id: "plasterboard", label: "Plasterboard 10mm + set joints", unit: "m²", category: "interior",
      regions: { AU: 38, US: 22, UK: 26 } },
    { id: "ceiling_cornice", label: "Cornice 75mm + install", unit: "lin.m", category: "interior",
      regions: { AU: 18, US: 9, UK: 12 } },
    { id: "floor_tile", label: "Floor tile 600×600 + adhesive + lay", unit: "m²", category: "interior",
      regions: { AU: 145, US: 85, UK: 95 } },
    { id: "floor_timber", label: "Engineered timber floor + lay", unit: "m²", category: "interior",
      regions: { AU: 165, US: 95, UK: 110 } },
    { id: "floor_carpet", label: "Carpet + underlay + lay", unit: "m²", category: "interior",
      regions: { AU: 75, US: 42, UK: 48 } },
    { id: "paint", label: "Paint, 2 coats + primer", unit: "m²", category: "interior",
      regions: { AU: 24, US: 14, UK: 16 } },

    // ---- JOINERY: ROBES & STORAGE ----
    { id: "robe_built_in", label: "Built-in robe — shelf, rail, sliding doors", unit: "lin.m", category: "joinery",
      regions: { AU: 520, US: 300, UK: 340 }, note: "Sliding/mirrored door BIR" },
    { id: "robe_walk_in", label: "Walk-in robe fit-out — shelving & hanging", unit: "lin.m", category: "joinery",
      regions: { AU: 420, US: 240, UK: 270 } },
    { id: "robe_hinged", label: "Built-in robe — hinged doors", unit: "lin.m", category: "joinery",
      regions: { AU: 580, US: 340, UK: 380 } },
    { id: "linen_cupboard", label: "Linen / storage cupboard", unit: "ea", category: "joinery",
      regions: { AU: 950, US: 560, UK: 620 } },

    // ---- KITCHEN: COMPONENTS ----
    { id: "kit_cab_flatpack", label: "Kitchen cabinetry — flat-pack + install", unit: "lin.m", category: "kitchen",
      regions: { AU: 680, US: 400, UK: 440 } },
    { id: "kit_cab_custom", label: "Kitchen cabinetry — custom joinery", unit: "lin.m", category: "kitchen",
      regions: { AU: 1450, US: 870, UK: 960 } },
    { id: "kit_bench_laminate", label: "Benchtop — laminate", unit: "lin.m", category: "kitchen",
      regions: { AU: 190, US: 115, UK: 130 } },
    { id: "kit_bench_stone", label: "Benchtop — engineered stone", unit: "lin.m", category: "kitchen",
      regions: { AU: 680, US: 410, UK: 460 } },
    { id: "kit_bench_natural", label: "Benchtop — natural stone (granite/marble)", unit: "lin.m", category: "kitchen",
      regions: { AU: 980, US: 600, UK: 670 } },
    { id: "kit_bench_timber", label: "Benchtop — solid timber", unit: "lin.m", category: "kitchen",
      regions: { AU: 440, US: 270, UK: 300 } },
    { id: "kit_splashback_tile", label: "Splashback — tiled", unit: "m²", category: "kitchen",
      regions: { AU: 190, US: 115, UK: 130 } },
    { id: "kit_splashback_glass", label: "Splashback — glass", unit: "m²", category: "kitchen",
      regions: { AU: 440, US: 270, UK: 300 } },
    { id: "kit_splashback_stone", label: "Splashback — stone slab", unit: "m²", category: "kitchen",
      regions: { AU: 620, US: 380, UK: 420 } },
    { id: "kit_sink_tap", label: "Sink + mixer tapware", unit: "ea", category: "kitchen",
      regions: { AU: 880, US: 540, UK: 600 } },
    { id: "kit_island", label: "Island bench module", unit: "ea", category: "kitchen",
      regions: { AU: 3200, US: 1900, UK: 2100 } },
    { id: "kit_appliances_basic", label: "Appliance package — basic", unit: "ea", category: "kitchen",
      regions: { AU: 4500, US: 2800, UK: 3100 } },
    { id: "kit_appliances_mid", label: "Appliance package — mid-range", unit: "ea", category: "kitchen",
      regions: { AU: 9500, US: 6000, UK: 6600 } },
    { id: "kit_appliances_premium", label: "Appliance package — premium", unit: "ea", category: "kitchen",
      regions: { AU: 22000, US: 14000, UK: 15500 } },

    // ---- BATHROOM: COMPONENTS ----
    { id: "bath_vanity", label: "Vanity unit + basin", unit: "ea", category: "bathroom",
      regions: { AU: 1250, US: 750, UK: 830 } },
    { id: "bath_toilet", label: "Toilet suite", unit: "ea", category: "bathroom",
      regions: { AU: 650, US: 400, UK: 440 } },
    { id: "bath_shower_screen", label: "Shower screen + base", unit: "ea", category: "bathroom",
      regions: { AU: 980, US: 600, UK: 660 } },
    { id: "bath_tub", label: "Bathtub — freestanding/insert", unit: "ea", category: "bathroom",
      regions: { AU: 1450, US: 880, UK: 970 } },
    { id: "bath_tapware", label: "Tapware & mixer set", unit: "ea", category: "bathroom",
      regions: { AU: 880, US: 540, UK: 600 } },
    { id: "bath_accessories", label: "Towel rails, mirror, accessories", unit: "ea", category: "bathroom",
      regions: { AU: 480, US: 290, UK: 320 } },
    { id: "bath_wall_tile", label: "Wall tiling + adhesive + lay", unit: "m²", category: "bathroom",
      regions: { AU: 135, US: 82, UK: 92 } },
    { id: "bath_floor_tile", label: "Floor tiling — wet area", unit: "m²", category: "bathroom",
      regions: { AU: 155, US: 92, UK: 102 } },
    { id: "bath_waterproofing", label: "Waterproofing (AS 3740)", unit: "m²", category: "bathroom",
      regions: { AU: 78, US: 46, UK: 52 }, note: "Mandatory wet-area membrane" },
    { id: "bath_exhaust", label: "Exhaust fan + ventilation", unit: "ea", category: "bathroom",
      regions: { AU: 320, US: 190, UK: 210 } },

    // ---- STAIRS ----
    { id: "stair_timber", label: "Staircase — timber flight + stringers", unit: "flight", category: "stairs",
      regions: { AU: 4800, US: 3000, UK: 3300 } },
    { id: "stair_steel_glass", label: "Staircase — steel + glass balustrade", unit: "flight", category: "stairs",
      regions: { AU: 13000, US: 8000, UK: 8900 } },
    { id: "stair_concrete", label: "Staircase — precast concrete flight", unit: "flight", category: "stairs",
      regions: { AU: 6500, US: 4000, UK: 4500 } },
    { id: "balustrade", label: "Balustrade / handrail", unit: "lin.m", category: "stairs",
      regions: { AU: 380, US: 230, UK: 260 }, note: "NCC: max 125mm gaps, min 865mm height" },

    // ---- SERVICES ----
    { id: "electrical_basic", label: "Electrical rough-in + fit-off", unit: "m²gfa", category: "services",
      regions: { AU: 165, US: 95, UK: 105 } },
    { id: "plumbing_basic", label: "Plumbing rough-in + fit-off", unit: "m²gfa", category: "services",
      regions: { AU: 140, US: 85, UK: 95 } },
    { id: "hvac_split", label: "Split-system A/C (per zone)", unit: "ea", category: "services",
      regions: { AU: 2800, US: 2200, UK: 2400 } },
    { id: "hot_water", label: "Hot water system (heat-pump)", unit: "ea", category: "services",
      regions: { AU: 3800, US: 2400, UK: 2600 } },
    { id: "solar_pv", label: "Solar PV 6.6kW + inverter", unit: "ea", category: "services",
      regions: { AU: 7500, US: 12000, UK: 8500 } },
  ],

  byCategory(cat) {
    return this.catalog.filter((m) => m.category === cat);
  },
  get(id) {
    return this.catalog.find((m) => m.id === id);
  },
  rate(id, region) {
    const m = this.get(id);
    return m ? m.regions[region] ?? 0 : 0;
  },
};

/* =========================================================================
   MODULE: suppliers.js
   Pre-built search URLs for major suppliers per region.
   These don't query an API — they open the supplier's own search with the
   material name, so prices are always live on the supplier side.
   ========================================================================= */
/* =========================================================================
   MODULE: sketchup.js
   Ingests a model.json exported from SketchUp (via the Ruby exporter below)
   and maps measured quantities onto the materials catalogue.

   The web cannot read native .skp files (proprietary binary). The client runs
   a small Ruby exporter inside SketchUp that measures the model and writes
   model.json. This module consumes that JSON — the quantities are SketchUp's
   own measurements, so the resulting estimate reflects the actual model.
   ========================================================================= */
const SketchUpImport = {
  /* Map a SketchUp material/layer name to one of our catalogue ids.
     Matching is fuzzy + keyword-based so client naming needn't be exact. */
  materialAliases: {
    // surfaces
    brick: "brick_veneer", "brick veneer": "brick_veneer", masonry: "brick_veneer",
    weatherboard: "weatherboard", cladding: "weatherboard", "fibre cement": "weatherboard", hardie: "weatherboard",
    render: "render", rendered: "render", stucco: "render",
    colorbond: "colorbond_sheet", "metal roof": "colorbond_sheet", "steel roof": "colorbond_sheet", roofing: "colorbond_sheet",
    tile: "concrete_tile", "roof tile": "concrete_tile",
    shingle: "asphalt_shingle", asphalt: "asphalt_shingle",
    plasterboard: "plasterboard", gyprock: "plasterboard", drywall: "plasterboard", gypsum: "plasterboard",
    "floor tile": "floor_tile", "ceramic floor": "floor_tile",
    timber: "floor_timber", "timber floor": "floor_timber", hardwood: "floor_timber", "engineered floor": "floor_timber",
    carpet: "floor_carpet",
    glazing: "window_alum_double", glass: "window_alum_double", window: "window_alum_double",
    paint: "paint", painted: "paint",
    insulation: "wall_insulation",
    concrete: "concrete_25mpa", slab: "concrete_25mpa",
    // edges
    framing: "timber_mgp10", stud: "timber_mgp10", frame: "timber_mgp10",
    beam: "lvl_beam", lvl: "lvl_beam", lintel: "steel_lintel",
    gutter: "guttering", guttering: "guttering",
    cornice: "ceiling_cornice", skirting: "ceiling_cornice",
    balustrade: "balustrade", handrail: "balustrade", rail: "balustrade",
    // components
    door: "door_internal", "external door": "door_external", "entry door": "door_external",
    "garage door": "garage_door",
    vanity: "bath_vanity", toilet: "bath_toilet", basin: "bath_vanity",
    shower: "bath_shower_screen", bath: "bath_tub", bathtub: "bath_tub",
    sink: "kit_sink_tap", tap: "kit_sink_tap",
    staircase: "stair_timber", stair: "stair_timber", stairs: "stair_timber",
  },

  resolveMaterial(name) {
    if (!name) return null;
    const key = String(name).toLowerCase().trim();
    if (this.materialAliases[key]) return this.materialAliases[key];
    // keyword scan — longest matching keyword wins
    let best = null, bestLen = 0;
    for (const kw of Object.keys(this.materialAliases)) {
      if (key.includes(kw) && kw.length > bestLen) { best = this.materialAliases[kw]; bestLen = kw.length; }
    }
    return best;
  },

  /* Validate + normalise an uploaded model.json */
  parse(raw) {
    let data;
    try { data = typeof raw === "string" ? JSON.parse(raw) : raw; }
    catch (e) { return { ok: false, error: "File isn't valid JSON. Re-run the SketchUp exporter." }; }
    if (!data || typeof data !== "object") return { ok: false, error: "Empty or malformed model.json." };
    const out = {
      meta: data.meta || {},
      surfaces: Array.isArray(data.surfaces) ? data.surfaces : [],
      edges: Array.isArray(data.edges) ? data.edges : [],
      components: Array.isArray(data.components) ? data.components : [],
      rooms: Array.isArray(data.rooms) ? data.rooms : [],
      volumes: Array.isArray(data.volumes) ? data.volumes : [],
    };
    const totalItems = out.surfaces.length + out.edges.length + out.components.length + out.volumes.length;
    if (totalItems === 0) return { ok: false, error: "No measurable geometry found. Did you tag faces by material in SketchUp?" };
    return { ok: true, model: out };
  },

  /* Build cost lines directly from the model + region.
     Returns { lines, matched, unmatched, totals } */
  estimateFromModel(model, region) {
    const lines = [];
    const unmatched = [];
    const add = (matId, qty, sourceLabel) => {
      const m = Materials.get(matId);
      if (!m || qty <= 0) return;
      const rate = Materials.rate(matId, region);
      lines.push({ materialId: matId, category: m.category, label: m.label, unit: m.unit, qty: round(qty, 2), rate: round(rate, 2), total: round(rate * qty, 2), source: sourceLabel });
    };
    const tryMap = (name, qty, kind) => {
      const id = this.resolveMaterial(name);
      if (id) add(id, qty, name);
      else unmatched.push({ name: name || "(unnamed)", qty: round(qty, 2), kind });
    };

    for (const s of model.surfaces) tryMap(s.material || s.layer, +s.area_m2 || +s.area || 0, "surface");
    for (const e of model.edges) tryMap(e.type || e.layer || e.material, +e.length_m || +e.length || 0, "edge");
    for (const c of model.components) tryMap(c.name || c.definition, +c.count || 1, "component");
    for (const v of model.volumes) tryMap(v.material || v.layer, +v.volume_m3 || +v.volume || 0, "volume");

    const matched = lines.length;
    const materialsTotal = lines.reduce((a, l) => a + l.total, 0);
    return { lines, matched, unmatched, materialsTotal };
  },

  /* A realistic sample model.json so the feature is testable without SketchUp */
  sampleModel() {
    return {
      meta: { source: "SketchUp 2024", exported: new Date().toISOString().slice(0, 10), units: "metric", model: "Sample — 4 bed single storey" },
      surfaces: [
        { material: "Brick veneer", area_m2: 168 },
        { material: "Colorbond roofing", area_m2: 215 },
        { material: "Plasterboard", area_m2: 520 },
        { material: "Engineered timber floor", area_m2: 142 },
        { material: "Floor tile", area_m2: 38 },
        { material: "Paint", area_m2: 520 },
        { material: "Glazing", area_m2: 22 },
        { material: "Wall insulation", area_m2: 156 },
      ],
      edges: [
        { type: "Timber framing", length_m: 640 },
        { type: "LVL beam", length_m: 48 },
        { type: "Guttering", length_m: 62 },
        { type: "Cornice", length_m: 118 },
      ],
      components: [
        { name: "External door", count: 3 },
        { name: "Internal door", count: 11 },
        { name: "Garage door", count: 1 },
        { name: "Window", count: 14 },
        { name: "Vanity", count: 2 },
        { name: "Toilet", count: 2 },
        { name: "Shower screen", count: 2 },
        { name: "Kitchen sink + tap", count: 1 },
      ],
      volumes: [
        { material: "Concrete slab", volume_m3: 23 },
      ],
      rooms: [
        { name: "Master bedroom", area_m2: 16, finish: "carpet" },
        { name: "Bedroom 2", area_m2: 12, finish: "carpet" },
        { name: "Open living", area_m2: 42, finish: "timber" },
      ],
    };
  },

  /* The Ruby exporter the client pastes into SketchUp's Ruby Console */
  rubyExporter() {
    return `# Build Your Own (BYO) — SketchUp quantity exporter
# Paste into SketchUp: Window > Ruby Console, then press Enter.
# Writes model.json next to your .skp file. Tag faces with materials
# named like "Brick veneer", "Colorbond roofing", "Plasterboard", etc.

require 'json'
require 'sketchup.rb'

model = Sketchup.active_model
ents  = model.entities
M2 = 1.0 / (39.37 * 39.37)   # sq inches -> m^2 (SketchUp works in inches)
M  = 1.0 / 39.37             # inches -> m
M3 = 1.0 / (39.37 ** 3)      # cu inches -> m^3

surfaces = Hash.new(0.0)
edges_by_layer = Hash.new(0.0)
comps = Hash.new(0)
volumes = Hash.new(0.0)

def walk(ents, tr, surfaces, edges_by_layer, comps, volumes, m2, m, m3)
  ents.each do |e|
    case e
    when Sketchup::Face
      mat = e.material ? e.material.display_name : (e.layer ? e.layer.name : 'Untagged')
      surfaces[mat] += e.area * m2
      if e.respond_to?(:volume) && e.volume && e.volume > 0
        volumes[mat] += e.volume * m3
      end
    when Sketchup::Edge
      lyr = e.layer ? e.layer.name : 'Untagged'
      edges_by_layer[lyr] += e.length.to_f * m if e.faces.empty?
    when Sketchup::ComponentInstance
      name = e.definition.name
      comps[name] += 1
      walk(e.definition.entities, tr, surfaces, edges_by_layer, comps, volumes, m2, m, m3)
    when Sketchup::Group
      walk(e.entities, tr, surfaces, edges_by_layer, comps, volumes, m2, m, m3)
    end
  end
end

walk(ents, nil, surfaces, edges_by_layer, comps, volumes, M2, M, M3)

out = {
  'meta' => { 'source' => 'SketchUp', 'units' => 'metric', 'model' => model.title },
  'surfaces' => surfaces.map { |k, v| { 'material' => k, 'area_m2' => v.round(2) } },
  'edges' => edges_by_layer.map { |k, v| { 'type' => k, 'length_m' => v.round(2) } },
  'components' => comps.map { |k, v| { 'name' => k, 'count' => v } },
  'volumes' => volumes.map { |k, v| { 'material' => k, 'volume_m3' => v.round(3) } }
}

path = model.path.empty? ? File.join(Dir.home, 'model.json') :
       File.join(File.dirname(model.path), 'model.json')
File.write(path, JSON.pretty_generate(out))
UI.messagebox("Exported to: #{path}")
`;
  },
};

/* =========================================================================
   MODULE: allocation.js
   Purchase rules — the domain IP that turns an estimated quantity into a
   buyable order. Each rule: estimateUnit -> purchaseUnit, conversion factor,
   and a waste allowance trades actually add for cuts/breakage.
   ========================================================================= */
const Allocation = {
  /* keyed by catalogue material id */
  rules: {
    brick_veneer:    { buyUnit: "bricks", perEstimateUnit: 50, waste: 0.07, note: "~50 std bricks per m²" },
    concrete_25mpa:  { buyUnit: "m³ (ordered)", perEstimateUnit: 1, waste: 0.05, note: "Order in 0.2 m³ increments" },
    timber_mgp10:    { buyUnit: "lengths (5.4m)", perEstimateUnit: 1 / 5.4, waste: 0.10, note: "Sold in set lengths" },
    plasterboard:    { buyUnit: "sheets (1.2×2.4)", perEstimateUnit: 1 / 2.88, waste: 0.10, note: "2.88 m² per sheet" },
    floor_tile:      { buyUnit: "m² (boxes)", perEstimateUnit: 1, waste: 0.10, note: "Add 10% for cuts" },
    bath_wall_tile:  { buyUnit: "m² (boxes)", perEstimateUnit: 1, waste: 0.12, note: "Add 12% for cuts" },
    colorbond_sheet: { buyUnit: "m² (custom cut)", perEstimateUnit: 1, waste: 0.08, note: "Cut to length" },
    paint:           { buyUnit: "litres", perEstimateUnit: 1 / 6, waste: 0.05, note: "~6 m²/L per coat" },
    wall_insulation: { buyUnit: "m² (batts)", perEstimateUnit: 1, waste: 0.05, note: "Batt packs" },
    guttering:       { buyUnit: "lengths", perEstimateUnit: 1, waste: 0.05, note: "Sold per lin.m" },
  },
  /* Apply purchase rule to a matched line; returns enriched order info or null. */
  forMaterial(matId, estimateQty) {
    const r = this.rules[matId];
    if (!r) return null;
    const withWaste = estimateQty * (1 + r.waste);
    const orderQty = Math.ceil(withWaste * r.perEstimateUnit);
    return { buyUnit: r.buyUnit, orderQty, wastePct: r.waste, note: r.note };
  },
};

/* =========================================================================
   MODULE: spreadsheet.js
   Reads an uploaded .xlsx / .csv takeoff via SheetJS, auto-detects the
   material + quantity columns, maps materials to the catalogue, and applies
   allocation rules. Mirrors the read -> review -> allocate pipeline.
   ========================================================================= */
const SpreadsheetImport = {
  /* header keywords used to auto-detect which column is which */
  headerHints: {
    material: ["material", "item", "description", "product", "element", "trade", "desc"],
    quantity: ["qty", "quantity", "amount", "measure", "no.", "number"],
    unit: ["unit", "uom", "units", "measure unit"],
    rate: ["rate", "unit price", "unit cost", "price", "cost/unit", "$/unit"],
    total: ["total", "amount", "line total", "value", "extended", "subtotal"],
  },

  detectColumns(headers) {
    const lc = (headers || []).map((h) => String(h == null ? "" : h).toLowerCase().trim());
    const find = (hints, exclude = []) => {
      for (let i = 0; i < lc.length; i++) {
        if (exclude.includes(i)) continue;
        const cell = lc[i];
        if (!cell) continue;
        if (hints.some((k) => cell === k || cell.includes(k))) return i;
      }
      return -1;
    };
    // order matters: lock rate & total first so "amount"/"total" don't steal the qty column
    const rate = find(this.headerHints.rate);
    const total = find(this.headerHints.total, [rate]);
    const material = find(this.headerHints.material, [rate, total]);
    const quantity = find(this.headerHints.quantity, [rate, total, material]);
    const unit = find(this.headerHints.unit, [rate, total, material, quantity]);
    return { material, quantity, unit, rate, total };
  },

  /* How many distinct column-types a row's cells match — used to score
     which row is the real header (real quotes often have a title row first). */
  headerScore(row) {
    const cols = this.detectColumns(row);
    let score = 0;
    for (const k of ["material", "quantity", "unit", "rate", "total"]) if (cols[k] >= 0) score++;
    return score;
  },

  /* Scan the first ~12 rows and return the index of the row that most looks
     like the header (highest column-match score). Falls back to row 0. */
  findHeaderRow(aoa) {
    let best = 0, bestScore = -1;
    const limit = Math.min(aoa.length, 12);
    for (let i = 0; i < limit; i++) {
      const s = this.headerScore(aoa[i] || []);
      if (s > bestScore) { bestScore = s; best = i; }
    }
    return { index: best, score: bestScore };
  },

  /* Is this data row actually a repeated/stray header row? (e.g. the words
     "Description / Quantity / Rate" sitting in the body). It has header
     keywords but no real numbers in its qty/rate/total cells. */
  isHeaderLikeRow(row, mapping) {
    const looksHeader = this.headerScore(row) >= 3;
    if (!looksHeader) return false;
    const anyNumber = ["quantity", "rate", "total"].some((k) => mapping[k] >= 0 && isFinite(this.num(row[mapping[k]])));
    return !anyNumber;
  },

  num(v) {
    if (v == null) return NaN;
    return parseFloat(String(v).replace(/[^0-9.\-]/g, ""));
  },

  /* Read EVERY usable row. Never silently drop a line.
     Pricing priority: (1) file's Total column, (2) file's Rate × Qty,
     (3) catalogue rate if the material is recognised. Lines that have a
     name but no usable price are still kept and flagged 'needs price'. */
  /* Words that mark a row as a summary/total line, not a material */
  summaryWords: ["subtotal", "sub total", "sub-total", "total", "grand total", "gst", "vat", "tax", "fees", "fee", "margin", "discount", "amount due", "balance"],

  isSummaryRow(name, hasName, fileTotal, qtyFinite, rateFinite) {
    const n = String(name || "").toLowerCase().trim();
    // explicit keyword in the description
    if (n && this.summaryWords.some((w) => n === w || n.startsWith(w) || n.endsWith(w))) return true;
    // a value in the Total column but no description, no qty, no rate = a bare summary figure
    if (!hasName && isFinite(fileTotal) && !qtyFinite && !rateFinite) return true;
    return false;
  },

  estimate(rows, mapping, region) {
    const lines = [];
    let skipped = 0;
    for (const row of rows) {
      const name = mapping.material >= 0 ? row[mapping.material] : "";
      const qty = mapping.quantity >= 0 ? this.num(row[mapping.quantity]) : NaN;
      const fileRate = mapping.rate >= 0 ? this.num(row[mapping.rate]) : NaN;
      const fileTotal = mapping.total >= 0 ? this.num(row[mapping.total]) : NaN;
      const unitTxt = mapping.unit >= 0 ? String(row[mapping.unit] || "").trim() : "";

      const hasName = name && String(name).trim().length > 0;
      const hasAnyNumber = isFinite(qty) || isFinite(fileRate) || isFinite(fileTotal);
      // skip rows that are clearly blank/headers/section titles with no data at all
      if (!hasName && !hasAnyNumber) { skipped++; continue; }

      // skip summary/total/GST/fees rows — they're not materials and would double-count
      if (this.isSummaryRow(name, hasName, fileTotal, isFinite(qty), isFinite(fileRate))) { skipped++; continue; }

      // skip a stray/repeated header row sitting in the body ("Description / Qty / Rate")
      if (this.isHeaderLikeRow(row, mapping)) { skipped++; continue; }

      const matId = hasName ? SketchUpImport.resolveMaterial(name) : null;
      const m = matId ? Materials.get(matId) : null;

      // ----- pricing priority -----
      let rate = NaN, total = NaN, priceSource = "";
      if (isFinite(fileTotal) && fileTotal !== 0) {
        total = fileTotal;
        rate = isFinite(fileRate) ? fileRate : (isFinite(qty) && qty !== 0 ? fileTotal / qty : NaN);
        priceSource = "file";
      } else if (isFinite(fileRate) && isFinite(qty)) {
        rate = fileRate; total = fileRate * qty; priceSource = "file";
      } else if (matId && isFinite(qty)) {
        rate = Materials.rate(matId, region); total = rate * qty; priceSource = "catalogue";
      } else if (isFinite(fileTotal)) { // includes zero ("By Others")
        total = fileTotal; rate = isFinite(fileRate) ? fileRate : 0; priceSource = "file";
      }

      const needsPrice = !isFinite(total);
      const alloc = matId && isFinite(qty) ? Allocation.forMaterial(matId, qty) : null;

      lines.push({
        materialId: matId || null,
        category: m ? m.category : "uncategorised",
        label: hasName ? String(name).trim() : (m ? m.label : "Unnamed item"),
        catalogueLabel: m ? m.label : null,
        unit: unitTxt || (m ? m.unit : ""),
        qty: isFinite(qty) ? round(qty, 2) : null,
        rate: isFinite(rate) ? round(rate, 2) : null,
        total: isFinite(total) ? round(total, 2) : 0,
        priceSource,         // "file" | "catalogue" | ""
        matched: !!matId,
        needsPrice,
        alloc,
      });
    }
    const materialsTotal = lines.reduce((a, l) => a + (l.total || 0), 0);
    const matchedCount = lines.filter((l) => l.matched).length;
    const fromFile = lines.filter((l) => l.priceSource === "file").length;
    const needPriceCount = lines.filter((l) => l.needsPrice).length;
    return { lines, materialsTotal, read: lines.length, matched: matchedCount, fromFile, needPriceCount, skipped };
  },

  /* Sample with rate + total columns, like a real trade quote */
  sampleCsv() {
    return `Bill Ref,Description,Quantity,Unit,Rate,Total
,Roof area - red,398.10,m2,35.00,13933.65
,Wall plate - blue,369.15,m,6.00,2214.87
By Others,Bulkheads,,m,0.00,0.00
,Fascia,166.60,m,14.00,2332.37
,Box gutter,35.48,m,65.00,2306.50
,Timber Decking - green,29.47,m2,110.00,3242.03
,Timber frame window nook (2400x600) to Bed 3 & 4,2.00,each,650.00,1300.00`;
  },
};

const Suppliers = {
  AU: [
    // ---- LOCAL — Far North Queensland (Cairns region) ----
    { name: "Cairns Hardware", tier: "Local (FNQ)", url: (q) => `https://www.cairnshardware.com.au/?s=${encodeURIComponent(q)}`,
      coverage: "Heavy building, timber, plasterboard, steel, roofing — trade drive-thrus across FNQ" },
    { name: "Dynamic Timbers (Cairns)", tier: "Local (FNQ)", url: () => `https://dynamictimbers.com.au/`,
      coverage: "Timber yard, roof trusses, wall frames, masonry — Cairns / Innisfail / Tolga" },
    { name: "Rankine Timber & Truss", tier: "Local (FNQ)", url: () => `https://www.rankinetimber.com.au/`,
      coverage: "Trusses, frames, hardwood & pine, flooring, decking, fencing" },
    { name: "Metroll Cairns", tier: "Local (FNQ)", url: () => `https://www.metroll.com.au/map_location/cairns-branch/`,
      coverage: "Locally-made roofing, cladding, rainwater & structural steel" },

    // ---- NATIONAL — trade suppliers (deliver to FNQ from down south) ----
    { name: "Reece", tier: "National trade", url: (q) => `https://www.reece.com.au/search?query=${encodeURIComponent(q)}`,
      coverage: "Plumbing, bathroom, hot water, HVAC-R — 600+ branches" },
    { name: "Tradelink", tier: "National trade", url: (q) => `https://tradelink.com.au/search?q=${encodeURIComponent(q)}`,
      coverage: "Plumbing, bathroom, kitchen" },
    { name: "Stratco", tier: "National trade", url: (q) => `https://www.stratco.com.au/search?q=${encodeURIComponent(q)}`,
      coverage: "Roofing, sheds, fencing, structural steel, patios" },
    { name: "Metroll", tier: "National trade", url: () => `https://www.metroll.com.au/`,
      coverage: "Steel roofing, walling, purlins, rainwater — 30 branches nationally" },
    { name: "Bowens", tier: "National trade", url: (q) => `https://www.bowens.com.au/?s=${encodeURIComponent(q)}`,
      coverage: "Timber & building materials, frames & trusses" },
    { name: "Dahlsens", tier: "National trade", url: () => `https://www.dahlsens.com.au/`,
      coverage: "Building materials, frames & trusses for builders" },

    // ---- GENERAL — retail (homeowners + top-ups) ----
    { name: "Bunnings Warehouse", tier: "General retail", url: (q) => `https://www.bunnings.com.au/search/products?q=${encodeURIComponent(q)}`,
      coverage: "Timber, hardware, paint, tools, garden, fittings" },
    { name: "Mitre 10", tier: "General retail", url: (q) => `https://www.mitre10.com.au/search?q=${encodeURIComponent(q)}`,
      coverage: "General hardware, timber, paint — independent network" },
    { name: "Total Tools", tier: "General retail", url: (q) => `https://www.totaltools.com.au/search?q=${encodeURIComponent(q)}`,
      coverage: "Power tools, hand tools, accessories" },
    { name: "Kennards Hire", tier: "Equipment hire", url: (q) => `https://www.kennards.com.au/search?q=${encodeURIComponent(q)}`,
      coverage: "Excavators, scaffolding, scissor lifts, compaction" },
    { name: "Coates Hire", tier: "Equipment hire", url: (q) => `https://www.coates.com.au/search?q=${encodeURIComponent(q)}`,
      coverage: "Earthmoving, access, propping, site services" },
  ],
  US: [
    { name: "The Home Depot", url: (q) => `https://www.homedepot.com/s/${encodeURIComponent(q)}`,
      coverage: "Lumber, tools, hardware, appliances" },
    { name: "Lowe's", url: (q) => `https://www.lowes.com/search?searchTerm=${encodeURIComponent(q)}`,
      coverage: "Lumber, hardware, appliances, garden" },
    { name: "Ferguson", url: (q) => `https://www.ferguson.com/search/?searchString=${encodeURIComponent(q)}`,
      coverage: "Plumbing, HVAC, lighting" },
    { name: "Menards", url: (q) => `https://www.menards.com/main/search.html?search=${encodeURIComponent(q)}`,
      coverage: "General building supplies (Midwest US)" },
    { name: "Sunbelt Rentals", url: (q) => `https://www.sunbeltrentals.com/equipment/search/?keywords=${encodeURIComponent(q)}`,
      coverage: "Equipment hire" },
  ],
  UK: [
    { name: "Wickes", url: (q) => `https://www.wickes.co.uk/search?text=${encodeURIComponent(q)}`,
      coverage: "Timber, hardware, kitchens, bathrooms" },
    { name: "Screwfix", url: (q) => `https://www.screwfix.com/search?search=${encodeURIComponent(q)}`,
      coverage: "Trade fittings, tools, electrical, plumbing" },
    { name: "B&Q", url: (q) => `https://www.diy.com/search?term=${encodeURIComponent(q)}`,
      coverage: "General hardware, garden, paint" },
    { name: "Travis Perkins", url: (q) => `https://www.travisperkins.co.uk/search?q=${encodeURIComponent(q)}`,
      coverage: "Timber, building materials, heavy-side" },
    { name: "Toolstation", url: (q) => `https://www.toolstation.com/search?q=${encodeURIComponent(q)}`,
      coverage: "Tools, fixings, electrical" },
    { name: "HSS Hire", url: (q) => `https://www.hss.com/hire/search?q=${encodeURIComponent(q)}`,
      coverage: "Equipment hire" },
  ],
};

/* =========================================================================
   MODULE: codes.js
   Curated reference of key building-code principles, jurisdiction-specific,
   with authoritative external links. NOT a substitute for the actual code,
   which the user must consult or have certified by a private certifier.
   ========================================================================= */
const BuildingCodes = {
  AU: {
    name: "National Construction Code (NCC) — Australia",
    authority: "Australian Building Codes Board (ABCB)",
    url: "https://ncc.abcb.gov.au/",
    sections: [
      { topic: "Wind region (Townsville)", detail: "Region C, cyclone-prone. Roof tie-down and wall bracing must comply with AS 4055 / AS 1170.2.",
        ref: "AS 4055-2021" },
      { topic: "Termite protection", detail: "Mandatory in QLD. Physical and/or chemical barrier under slab and at penetrations.",
        ref: "AS 3660.1" },
      { topic: "Min. ceiling height (habitable)", detail: "2400 mm minimum in habitable rooms; 2100 mm in kitchens, laundries, corridors.",
        ref: "NCC Vol. 2 — H4D7" },
      { topic: "Smoke alarms", detail: "Interconnected photoelectric alarms in every bedroom, every storey, hallway serving bedrooms.",
        ref: "AS 3786 / NCC Vol. 2" },
      { topic: "Energy efficiency", detail: "Minimum 7-star NatHERS rating for new homes from 2023 (most states).",
        ref: "NCC Vol. 2 — H6" },
      { topic: "Stair geometry", detail: "Riser 115–190 mm, going 240–355 mm, 2R+G between 550 and 700.",
        ref: "NCC Vol. 2 — H5D2" },
      { topic: "Glazing safety", detail: "Grade A safety glass below 700 mm sill height, in doors and adjacent panels.",
        ref: "AS 1288 / AS 2208" },
      { topic: "Waterproofing wet areas", detail: "Floors and shower walls to full height, junctions sealed.",
        ref: "AS 3740-2021" },
      { topic: "Plumbing", detail: "Licensed plumber required. Backflow prevention at boundary.",
        ref: "AS/NZS 3500 + QPW Code" },
      { topic: "Electrical", detail: "Licensed electrician required. RCDs on all final sub-circuits.",
        ref: "AS/NZS 3000:2018" },
      { topic: "Approvals (QLD)", detail: "Development Approval from council, then Building Approval from a private certifier before any work starts.",
        ref: "Building Act 1975 (QLD)" },
    ],
  },
  US: {
    name: "International Residential Code (IRC) — United States",
    authority: "International Code Council (ICC)",
    url: "https://codes.iccsafe.org/content/IRC2021P2",
    sections: [
      { topic: "Min. ceiling height", detail: "7 ft (2134 mm) in habitable rooms; 6'8\" in bathrooms.",
        ref: "IRC R305" },
      { topic: "Smoke + CO alarms", detail: "Smoke alarms in every bedroom + outside each sleeping area + each storey. CO alarms outside sleeping areas where fuel-burning appliances exist.",
        ref: "IRC R314 / R315" },
      { topic: "Stair geometry", detail: "Max riser 7¾\", min tread 10\". Min stair width 36\".",
        ref: "IRC R311.7" },
      { topic: "Egress", detail: "Every sleeping room: one emergency escape window or door.",
        ref: "IRC R310" },
      { topic: "Foundation", detail: "Footings below frost line; depth varies by zone (often 12\"–48\").",
        ref: "IRC R403" },
      { topic: "Energy", detail: "Climate-zone specific insulation, air sealing, fenestration U-factor.",
        ref: "IECC / IRC N1101" },
      { topic: "Permits", detail: "Building permit from local Authority Having Jurisdiction (AHJ) before construction. Inspections at footing, framing, rough-in, final.",
        ref: "IRC R105" },
    ],
  },
  UK: {
    name: "Building Regulations — England & Wales",
    authority: "Department for Levelling Up, Housing and Communities",
    url: "https://www.gov.uk/government/collections/approved-documents",
    sections: [
      { topic: "Structure", detail: "Loads, ground conditions, foundations.",
        ref: "Approved Document A" },
      { topic: "Fire safety", detail: "Means of escape, internal fire spread, alarms.",
        ref: "Approved Document B" },
      { topic: "Resistance to moisture", detail: "DPC, DPM, weathertight envelope.",
        ref: "Approved Document C" },
      { topic: "Sound insulation", detail: "Airborne + impact sound between dwellings and rooms.",
        ref: "Approved Document E" },
      { topic: "Ventilation", detail: "Background, extract, and purge ventilation rates.",
        ref: "Approved Document F" },
      { topic: "Energy efficiency", detail: "Fabric and services, SAP calculation required.",
        ref: "Approved Document L" },
      { topic: "Approvals", detail: "Either full plans submission or Building Notice to LABC / Approved Inspector.",
        ref: "Building Act 1984" },
    ],
  },
};

/* =========================================================================
   MODULE: estimator.js
   Pure functions. Input: building spec. Output: itemised quantities, costs,
   labour, equipment, timeline. No DOM, no React, no Three.js dependencies.
   ========================================================================= */
/* Infer parametric settings + a representative GFA from imported takeoff lines,
   so an import can drive both the estimate and a representative 3D massing. */
function inferSpecFromImport(lines) {
  const ids = new Set(lines.map((l) => l.materialId).filter(Boolean));
  const qtyOf = (id) => lines.filter((l) => l.materialId === id).reduce((a, l) => a + l.qty, 0);

  // GFA: prefer summed floor finishes, else plasterboard/2.3, else materials/1300
  let gfa = qtyOf("floor_timber") + qtyOf("floor_tile") + qtyOf("floor_carpet") + qtyOf("bath_floor_tile");
  if (gfa < 5) { const pb = qtyOf("plasterboard"); gfa = pb > 0 ? pb / 2.3 : 0; }
  if (gfa < 5) { const tot = lines.reduce((a, l) => a + l.total, 0); gfa = tot > 0 ? tot / 1300 : 150; }
  gfa = Math.max(40, Math.round(gfa));

  const cladding = ids.has("brick_veneer") ? "brick" : ids.has("weatherboard") ? "weatherboard" : ids.has("render") ? "render" : "brick";
  const roof = ids.has("concrete_tile") ? "tile" : ids.has("asphalt_shingle") ? "shingle" : "colorbond";
  const floorFinish = qtyOf("floor_tile") > qtyOf("floor_timber") && qtyOf("floor_tile") > qtyOf("floor_carpet") ? "tile"
                    : qtyOf("floor_carpet") > qtyOf("floor_timber") ? "carpet" : "timber";
  const staircaseType = ids.has("stair_steel_glass") ? "steel_glass" : ids.has("stair_concrete") ? "concrete" : ids.has("stair_timber") ? "timber" : "none";
  const hasGarage = ids.has("garage_door");

  // detected element counts for the summary panel
  const detected = [];
  const addDet = (id, label) => { const q = qtyOf(id); if (q > 0) detected.push({ label, qty: q, unit: Materials.get(id)?.unit }); };
  addDet("window_alum_double", "Windows");
  addDet("door_external", "External doors");
  addDet("door_internal", "Internal doors");
  addDet("bath_vanity", "Vanities");
  addDet("bath_toilet", "Toilets");
  addDet("kit_sink_tap", "Kitchen sinks");

  const side = Math.round(Math.sqrt(gfa) * 10) / 10;
  const counts = {
    windows: Math.round(qtyOf("window_alum_double")),
    doorsExt: Math.round(qtyOf("door_external")),
    doorsInt: Math.round(qtyOf("door_internal")),
    vanities: Math.round(qtyOf("bath_vanity")),
    toilets: Math.round(qtyOf("bath_toilet")),
    kitchenSinks: Math.round(qtyOf("kit_sink_tap")),
  };
  return { gfa, side, cladding, roof, floorFinish, staircaseType, hasGarage, detected, counts };
}

const Estimator = {
  /* Quantity takeoff from spec */
  takeoff(spec) {
    const { widthM, lengthM, floors, wallHeightM, roofPitch, openings,
            slabThicknessM, roofType, claddingType, framingType, floorFinish, hasGarage, staircaseType } = spec;
    const rooms = spec.rooms || [];
    const kitchens = spec.kitchens || [];
    const bathrooms = spec.bathrooms || [];

    const footprint = widthM * lengthM;
    const perimeter = 2 * (widthM + lengthM);
    const gfa = footprint * floors;
    const wallArea = perimeter * wallHeightM * floors;
    const openingArea = openings.windowsM2 + openings.doors * 2.0;
    const netWallArea = Math.max(0, wallArea - openingArea);
    const pitchRad = (roofPitch * Math.PI) / 180;
    const roofArea = footprint / Math.max(0.5, Math.cos(pitchRad));
    const upperFloorArea = footprint * Math.max(0, floors - 1);
    const slabVol = footprint * slabThicknessM;
    const footingVol = perimeter * 0.4 * 0.3;
    const rebarT = ((slabVol + footingVol) * 80) / 1000;
    const timberLM = framingType === "timber" ? gfa * 3.5 + upperFloorArea * 2.5 : 0;
    const steelT = framingType === "steel" ? gfa * 0.018 : 0;
    const lintelLM = (openings.windowsCount + openings.doors) * 1.5;
    const gutterLM = perimeter;

    /* ---- Room schedule aggregation ---- */
    const roomFloorByFinish = { timber: 0, tile: 0, carpet: 0 };
    let robeBuiltInLM = 0, robeHingedLM = 0, robeWalkInLM = 0;
    let roomInternalWallArea = 0;
    let roomCount = 0;
    for (const r of rooms) {
      const area = (r.widthM || 0) * (r.lengthM || 0);
      if (area <= 0) continue;
      roomCount++;
      const finish = r.floorFinish || "timber";
      roomFloorByFinish[finish] = (roomFloorByFinish[finish] || 0) + area;
      // internal partition: half the room perimeter (shared walls counted once), both faces lined
      const roomPerim = 2 * ((r.widthM || 0) + (r.lengthM || 0));
      roomInternalWallArea += roomPerim * 0.5 * wallHeightM;
      // robes
      if (r.robe === "built_in") robeBuiltInLM += r.robeLengthM || 0;
      else if (r.robe === "hinged") robeHingedLM += r.robeLengthM || 0;
      else if (r.robe === "walk_in") robeWalkInLM += r.robeLengthM || 0;
    }
    const roomScheduleArea = Object.values(roomFloorByFinish).reduce((a, b) => a + b, 0);
    const useRoomSchedule = roomScheduleArea > 0;

    /* Internal walls: from room schedule if present, else heuristic */
    const internalWallArea = useRoomSchedule ? roomInternalWallArea * 2 : gfa * 1.2 * wallHeightM * 2;
    const plasterboardArea = internalWallArea + netWallArea + (gfa * 0.9); // + ceilings
    const corniceLM = gfa * 0.6;
    const internalDoors = useRoomSchedule
      ? Math.max(2, roomCount + bathrooms.length) // a door per room + bathrooms
      : Math.max(2, Math.floor(gfa / 25));

    /* ---- Kitchen quantities ---- */
    const kitchenItems = kitchens.map((k) => {
      const bench = k.benchLengthM || 0;
      // splashback area ≈ bench run × 0.6m height
      const splashbackM2 = bench * 0.6;
      return { ...k, benchLengthM: bench, splashbackM2 };
    });

    /* ---- Bathroom quantities ---- */
    const bathroomItems = bathrooms.map((b) => {
      const area = (b.widthM || 0) * (b.lengthM || 0);
      const perim = 2 * ((b.widthM || 0) + (b.lengthM || 0));
      // wall tile: either full height or splash zones (~1.2m). Full perimeter.
      const tileH = b.wallTileFullHeight ? wallHeightM : 1.2;
      const wallTileM2 = perim * tileH;
      const floorTileM2 = area;
      const waterproofM2 = area + perim * 0.3; // floor + 300mm up walls min
      return { ...b, areaM2: area, wallTileM2, floorTileM2, waterproofM2 };
    });

    /* ---- Staircases ---- */
    const stairFlights = (staircaseType && staircaseType !== "none" && floors > 1) ? (floors - 1) : 0;
    const flightRun = wallHeightM * 1.6;
    const balustradeLM = stairFlights * (flightRun + 1.2);

    return {
      footprintM2: footprint, perimeterM: perimeter, gfaM2: gfa,
      wallAreaM2: wallArea, netWallAreaM2: netWallArea, roofAreaM2: roofArea,
      upperFloorAreaM2: upperFloorArea,
      slabVolM3: slabVol, footingVolM3: footingVol, concreteTotalM3: slabVol + footingVol,
      rebarTonne: rebarT,
      timberFramingLM: timberLM, steelFramingTonne: steelT,
      lintelLM, gutterLM,
      plasterboardM2: plasterboardArea, corniceLM,
      // room/finish data
      useRoomSchedule, roomFloorByFinish, roomScheduleArea, roomCount,
      robeBuiltInLM, robeHingedLM, robeWalkInLM,
      kitchenItems, bathroomItems,
      kitchenCount: kitchens.length, bathroomCount: bathrooms.length,
      stairFlights, balustradeLM, staircaseType,
      windowsM2: openings.windowsM2, windowsCount: openings.windowsCount,
      doorsExternal: openings.doors, doorsInternal: internalDoors,
      hasGarage,
      roofType, claddingType, framingType, floorFinish,
    };
  },

  /* Map takeoff onto material catalog and compute material costs */
  materialCosts(takeoff, spec, region) {
    const lines = [];
    const add = (matId, qty, opts = {}) => {
      const m = Materials.get(matId);
      if (!m || qty <= 0) return;
      const rate = Materials.rate(matId, region) * (opts.multiplier || 1);
      lines.push({
        category: m.category, label: m.label, unit: m.unit,
        qty: round(qty, 2), rate: round(rate, 2), total: round(rate * qty, 2),
        materialId: matId,
      });
    };

    // foundation
    add("concrete_25mpa", takeoff.concreteTotalM3);
    add("rebar_n12", takeoff.rebarTonne);
    if (region === "AU") add("termite_membrane", takeoff.footprintM2);
    add("polythene_dpm", takeoff.footprintM2);

    // frame
    if (takeoff.framingType === "timber") {
      add("timber_mgp10", takeoff.timberFramingLM);
      add("lvl_beam", takeoff.lintelLM * 0.5 + takeoff.upperFloorAreaM2 * 0.3);
    } else {
      add("structural_steel", takeoff.steelFramingTonne);
    }
    add("steel_lintel", takeoff.lintelLM);

    // roof
    const roofMat = takeoff.roofType === "tile" ? "concrete_tile"
                  : takeoff.roofType === "shingle" ? "asphalt_shingle"
                  : "colorbond_sheet";
    add(roofMat, takeoff.roofAreaM2);
    add("roof_insulation", takeoff.roofAreaM2);
    add("guttering", takeoff.gutterLM);

    // cladding
    const cladMat = takeoff.claddingType === "weatherboard" ? "weatherboard"
                  : takeoff.claddingType === "render" ? "render"
                  : "brick_veneer";
    add(cladMat, takeoff.netWallAreaM2);
    add("wall_insulation", takeoff.netWallAreaM2);

    // openings
    add("window_alum_double", takeoff.windowsM2);
    add("door_external", takeoff.doorsExternal);
    add("door_internal", takeoff.doorsInternal);
    if (takeoff.hasGarage) add("garage_door", 1);

    // interior — linings
    add("plasterboard", takeoff.plasterboardM2);
    add("ceiling_cornice", takeoff.corniceLM);
    add("paint", takeoff.plasterboardM2);

    // flooring — from room schedule if present, else blanket GFA split
    if (takeoff.useRoomSchedule) {
      add("floor_timber", takeoff.roomFloorByFinish.timber || 0);
      add("floor_tile", takeoff.roomFloorByFinish.tile || 0);
      add("floor_carpet", takeoff.roomFloorByFinish.carpet || 0);
    } else {
      const floorMat = takeoff.floorFinish === "tile" ? "floor_tile"
                     : takeoff.floorFinish === "carpet" ? "floor_carpet"
                     : "floor_timber";
      add(floorMat, takeoff.gfaM2 * 0.85);
      add("floor_tile", takeoff.gfaM2 * 0.15);
    }

    // joinery — built-in robes & storage
    add("robe_built_in", takeoff.robeBuiltInLM);
    add("robe_hinged", takeoff.robeHingedLM);
    add("robe_walk_in", takeoff.robeWalkInLM);

    // kitchens — itemised per config
    for (const k of takeoff.kitchenItems) {
      const cab = k.cabinetry === "custom" ? "kit_cab_custom" : "kit_cab_flatpack";
      add(cab, k.benchLengthM);
      const bench = k.benchtop === "laminate" ? "kit_bench_laminate"
                  : k.benchtop === "natural" ? "kit_bench_natural"
                  : k.benchtop === "timber" ? "kit_bench_timber"
                  : "kit_bench_stone";
      add(bench, k.benchLengthM);
      const splash = k.splashback === "glass" ? "kit_splashback_glass"
                   : k.splashback === "stone" ? "kit_splashback_stone"
                   : "kit_splashback_tile";
      add(splash, k.splashbackM2);
      if (k.sinkTap) add("kit_sink_tap", 1);
      if (k.island) add("kit_island", 1);
      const appl = k.appliances === "basic" ? "kit_appliances_basic"
                 : k.appliances === "premium" ? "kit_appliances_premium"
                 : "kit_appliances_mid";
      add(appl, 1);
    }

    // bathrooms — itemised per config
    for (const b of takeoff.bathroomItems) {
      add("bath_vanity", b.vanityCount || 1);
      add("bath_toilet", b.toiletCount || 1);
      if (b.hasShower) add("bath_shower_screen", 1);
      if (b.hasBath) add("bath_tub", 1);
      add("bath_tapware", 1);
      add("bath_accessories", 1);
      add("bath_wall_tile", b.wallTileM2);
      add("bath_floor_tile", b.floorTileM2);
      add("bath_waterproofing", b.waterproofM2);
      add("bath_exhaust", 1);
    }

    // stairs
    if (takeoff.stairFlights > 0) {
      const stairMat = takeoff.staircaseType === "steel_glass" ? "stair_steel_glass"
                     : takeoff.staircaseType === "concrete" ? "stair_concrete"
                     : "stair_timber";
      add(stairMat, takeoff.stairFlights);
      add("balustrade", takeoff.balustradeLM);
    }

    // services
    add("electrical_basic", takeoff.gfaM2);
    add("plumbing_basic", takeoff.gfaM2);
    add("hvac_split", Math.max(1, Math.ceil(takeoff.gfaM2 / 80)));
    add("hot_water", 1);
    if (spec.solar) add("solar_pv", 1);

    return lines;
  },

  /* Labour cost — applied as a % of materials by trade, then totalled */
  labourCosts(takeoff, region, complexity = 1.0) {
    /* rough $/m² GFA for labour by trade, by region */
    const rates = {
      AU: { siteworks: 95, concrete: 110, frame: 180, roof: 95, brick: 130, electrical: 120, plumbing: 110, hvac: 45, plaster: 85, paint: 65, tile: 95, joinery: 90, kitchen_bath_fit: 75, finishes: 95 },
      US: { siteworks: 55, concrete: 65, frame: 110, roof: 60, brick: 80, electrical: 75, plumbing: 70, hvac: 28, plaster: 50, paint: 38, tile: 60, joinery: 55, kitchen_bath_fit: 45, finishes: 55 },
      UK: { siteworks: 60, concrete: 70, frame: 115, roof: 65, brick: 85, electrical: 78, plumbing: 72, hvac: 32, plaster: 55, paint: 42, tile: 65, joinery: 60, kitchen_bath_fit: 50, finishes: 60 },
    }[region];

    return Object.entries(rates).map(([trade, rate]) => ({
      trade: humaniseTradeName(trade),
      total: round(rate * takeoff.gfaM2 * complexity, 2),
    }));
  },

  equipmentCosts(takeoff, region, durationWeeks) {
    /* Daily/weekly hire rates × duration weighting */
    const tab = {
      AU: { excavator: 380, scaffold_m2: 14, crane: 1800, skipBin: 480, formwork_m2: 38, fence_lm: 18 },
      US: { excavator: 240, scaffold_m2: 9, crane: 1100, skipBin: 320, formwork_m2: 22, fence_lm: 11 },
      UK: { excavator: 260, scaffold_m2: 10, crane: 1200, skipBin: 340, formwork_m2: 25, fence_lm: 12 },
    }[region];

    const scaffoldM2 = takeoff.perimeterM * takeoff.upperFloorAreaM2 > 0 ? takeoff.perimeterM * 3 * (takeoff.gfaM2 / takeoff.footprintM2) : 0;
    const formworkM2 = takeoff.footprintM2 * 0.6;
    const skipBinsCount = Math.ceil(takeoff.gfaM2 / 50);
    const craneWeeks = takeoff.upperFloorAreaM2 > 0 ? 2 : 0;
    const excavatorDays = Math.max(3, Math.ceil(takeoff.footprintM2 / 30));
    const siteFenceLM = takeoff.perimeterM + 20;

    const items = [
      { name: "Excavator hire", qty: excavatorDays, unit: "days", rate: tab.excavator, total: excavatorDays * tab.excavator },
      { name: "Scaffolding (perimeter × storeys)", qty: round(scaffoldM2, 1), unit: "m²·wk", rate: tab.scaffold_m2, total: round(scaffoldM2 * tab.scaffold_m2, 2) },
      { name: "Formwork (slab edges + footings)", qty: round(formworkM2, 1), unit: "m²", rate: tab.formwork_m2, total: round(formworkM2 * tab.formwork_m2, 2) },
      { name: "Mobile crane", qty: craneWeeks, unit: "weeks", rate: tab.crane, total: craneWeeks * tab.crane },
      { name: "Waste skip bins", qty: skipBinsCount, unit: "ea", rate: tab.skipBin, total: skipBinsCount * tab.skipBin },
      { name: "Site fencing + signage", qty: siteFenceLM, unit: "lin.m", rate: tab.fence_lm, total: siteFenceLM * tab.fence_lm },
    ].filter((i) => i.total > 0);

    return items;
  },

  timeline(takeoff, spec) {
    /* Base duration scales by GFA, floors, and complexity. */
    const baseWeeks = 8 + Math.sqrt(takeoff.gfaM2) * 1.6 + (spec.floors - 1) * 6;
    const siteFactor = { flat: 1.0, sloping: 1.18, difficult: 1.35 }[spec.siteCondition] || 1.0;
    const totalWeeks = Math.round(baseWeeks * siteFactor);

    /* Stage breakdown — % of total */
    const stages = [
      { name: "Site preparation & set-out", pct: 0.06, key: "site" },
      { name: "Foundation & slab", pct: 0.09, key: "foundation" },
      { name: "Frame & structural", pct: 0.16, key: "frame" },
      { name: "Roof structure & cover", pct: 0.10, key: "roof" },
      { name: "External walls & cladding", pct: 0.12, key: "cladding" },
      { name: "Window & door installation", pct: 0.05, key: "openings" },
      { name: "Plumbing, electrical, HVAC rough-in", pct: 0.10, key: "services_rough" },
      { name: "Insulation & plasterboard", pct: 0.08, key: "lining" },
      { name: "Internal fit-out & joinery", pct: 0.10, key: "fitout" },
      { name: "Painting & finishes", pct: 0.07, key: "finishes" },
      { name: "Services fit-off & commissioning", pct: 0.05, key: "commissioning" },
      { name: "Site clean & handover", pct: 0.02, key: "handover" },
    ];
    let week = 0;
    return {
      totalWeeks,
      stages: stages.map((s) => {
        const weeks = Math.max(1, Math.round(s.pct * totalWeeks));
        const startWeek = week + 1;
        const endWeek = week + weeks;
        week += weeks;
        return { ...s, weeks, startWeek, endWeek };
      }),
    };
  },

  buildEstimate(spec, region) {
    const takeoff = this.takeoff(spec);
    const imported = spec.importedLines && spec.importedLines.length > 0;

    /* Fully-cleared building → genuine zero estimate (no residual minimums) */
    if (!imported && takeoff.gfaM2 <= 0) {
      const taxRate = { AU: 0.10, US: 0.0, UK: 0.20 }[region];
      const taxLabel = { AU: "GST (10%)", US: "Sales tax (varies)", UK: "VAT (20%)" }[region];
      return {
        region, spec, takeoff, imported: false,
        materialLines: [], materialsTotal: 0,
        labourLines: [], labourTotal: 0,
        equipmentLines: [], equipmentTotal: 0,
        subtotal: 0, prelims: 0, margin: 0, contingency: 0, total: 0,
        taxRate, taxLabel,
        timeline: { totalWeeks: 0, stages: [] },
      };
    }

    const materialLines = imported
      ? spec.importedLines.map((l) => ({ ...l }))
      : this.materialCosts(takeoff, spec, region);
    const materialsTotal = materialLines.reduce((s, l) => s + l.total, 0);
    const complexity = { flat: 1.0, sloping: 1.12, difficult: 1.25 }[spec.siteCondition] || 1.0;
    const labourLines = this.labourCosts(takeoff, region, complexity);
    const labourTotal = labourLines.reduce((s, l) => s + l.total, 0);
    const timeline = this.timeline(takeoff, spec);
    const equipmentLines = this.equipmentCosts(takeoff, region, timeline.totalWeeks);
    const equipmentTotal = equipmentLines.reduce((s, l) => s + l.total, 0);
    const subtotal = materialsTotal + labourTotal + equipmentTotal;
    /* Preliminaries (site setup, supervision, insurances), margin (builder), contingency */
    const prelims = subtotal * 0.08;
    const margin = subtotal * 0.15;
    const contingency = subtotal * 0.07;
    const total = subtotal + prelims + margin + contingency;
    /* Tax (GST/VAT) — informational */
    const taxRate = { AU: 0.10, US: 0.0, UK: 0.20 }[region];
    const taxLabel = { AU: "GST (10%)", US: "Sales tax (varies)", UK: "VAT (20%)" }[region];
    return {
      region, spec, takeoff, imported,
      materialLines, materialsTotal,
      labourLines, labourTotal,
      equipmentLines, equipmentTotal,
      subtotal, prelims, margin, contingency, total,
      taxRate, taxLabel,
      timeline,
    };
  },
};

/* =========================================================================
   MODULE: highrise.js
   A SEPARATE engine for multi-storey / high-rise commercial buildings.
   High-rise estimating is a different discipline from residential: costs are
   driven by the structural core, typical-floor cycle, façade system, vertical
   transport (lifts), and fire/life-safety engineering — not by rooms & finishes.
   Costed per m² of GFA per system, with a per-floor structural cycle.
   These are FEASIBILITY-GRADE parametric rates, not tender figures.
   ========================================================================= */
const HighRiseMaterials = {
  /* Rates are per m² of Gross Floor Area unless unit says otherwise. */
  systems: [
    // ---- SUBSTRUCTURE ----
    { id: "hr_piling", label: "Piled foundations / raft", unit: "m²site", category: "substructure",
      regions: { AU: 420, US: 280, UK: 310 }, note: "Deep foundations for tower loads" },
    { id: "hr_basement", label: "Basement / podium structure", unit: "m²base", category: "substructure",
      regions: { AU: 2600, US: 1700, UK: 1900 }, note: "Per m² of basement floor" },
    { id: "hr_excavation", label: "Bulk excavation + shoring", unit: "m³", category: "substructure",
      regions: { AU: 95, US: 62, UK: 70 } },

    // ---- SUPERSTRUCTURE ----
    { id: "hr_core_rc", label: "RC core (lift/stair shear walls)", unit: "m²gfa", category: "superstructure",
      regions: { AU: 340, US: 220, UK: 250 }, note: "Slip-formed reinforced concrete core" },
    { id: "hr_frame_rc", label: "RC columns + post-tensioned slabs", unit: "m²gfa", category: "superstructure",
      regions: { AU: 520, US: 340, UK: 380 } },
    { id: "hr_frame_steel", label: "Structural steel frame + metal deck", unit: "m²gfa", category: "superstructure",
      regions: { AU: 640, US: 420, UK: 470 } },
    { id: "hr_frame_composite", label: "Composite steel/concrete frame", unit: "m²gfa", category: "superstructure",
      regions: { AU: 580, US: 380, UK: 425 } },

    // ---- FAÇADE ----
    { id: "hr_curtain_wall", label: "Unitised curtain wall (glazed)", unit: "m²fac", category: "facade",
      regions: { AU: 1250, US: 850, UK: 950 }, note: "Per m² of façade area" },
    { id: "hr_precast_facade", label: "Precast concrete panel façade", unit: "m²fac", category: "facade",
      regions: { AU: 780, US: 520, UK: 580 } },
    { id: "hr_window_wall", label: "Window-wall system", unit: "m²fac", category: "facade",
      regions: { AU: 920, US: 620, UK: 690 } },

    // ---- VERTICAL TRANSPORT ----
    { id: "hr_lift_passenger", label: "Passenger lift (per car, full rise)", unit: "ea", category: "transport",
      regions: { AU: 185000, US: 130000, UK: 145000 }, note: "Scales with floors served" },
    { id: "hr_lift_goods", label: "Goods / service lift", unit: "ea", category: "transport",
      regions: { AU: 240000, US: 165000, UK: 185000 } },
    { id: "hr_escalator", label: "Escalator (podium levels)", unit: "ea", category: "transport",
      regions: { AU: 165000, US: 115000, UK: 130000 } },

    // ---- BUILDING SERVICES (MEP) ----
    { id: "hr_hvac_central", label: "Central HVAC (chilled water/VAV)", unit: "m²gfa", category: "services",
      regions: { AU: 420, US: 290, UK: 320 } },
    { id: "hr_electrical_dist", label: "Electrical distribution + standby", unit: "m²gfa", category: "services",
      regions: { AU: 280, US: 190, UK: 210 } },
    { id: "hr_hydraulic", label: "Hydraulics (water/sewer/booster)", unit: "m²gfa", category: "services",
      regions: { AU: 180, US: 120, UK: 135 } },
    { id: "hr_bms", label: "Building management system", unit: "m²gfa", category: "services",
      regions: { AU: 75, US: 50, UK: 56 } },

    // ---- FIRE & LIFE SAFETY ----
    { id: "hr_sprinkler", label: "Sprinkler + fire hydrant system", unit: "m²gfa", category: "fire",
      regions: { AU: 95, US: 62, UK: 70 }, note: "Mandatory all storeys (NCC E1/IBC 903)" },
    { id: "hr_fire_detection", label: "Fire detection + EWIS alarm", unit: "m²gfa", category: "fire",
      regions: { AU: 65, US: 42, UK: 48 } },
    { id: "hr_fire_stairs", label: "Fire-isolated stairs + pressurisation", unit: "ea", category: "fire",
      regions: { AU: 320000, US: 220000, UK: 245000 }, note: "Min 2 egress stairs; scales with rise" },

    // ---- FIT-OUT (base building) ----
    { id: "hr_fitout_core", label: "Core fit-out (lobbies, amenities, WCs)", unit: "m²gfa", category: "fitout",
      regions: { AU: 240, US: 160, UK: 180 } },
    { id: "hr_ceilings_floors", label: "Raised floors + suspended ceilings", unit: "m²gfa", category: "fitout",
      regions: { AU: 185, US: 125, UK: 140 } },
    { id: "hr_carpark", label: "Car park fit-out + ventilation", unit: "m²base", category: "fitout",
      regions: { AU: 320, US: 210, UK: 235 } },
  ],
  get(id) { return this.systems.find((s) => s.id === id); },
  rate(id, region) { const s = this.get(id); return s ? s.regions[region] ?? 0 : 0; },
};

const HighRiseCodes = {
  AU: {
    name: "National Construction Code — Volume One (Class 2–9)",
    authority: "Australian Building Codes Board (ABCB)",
    url: "https://ncc.abcb.gov.au/",
    sections: [
      { topic: "Rise in storeys / Type A", detail: "Buildings >25m effective height require Type A fire-resisting construction throughout.", ref: "NCC Vol.1 C2D2" },
      { topic: "Fire-isolated egress", detail: "Min 2 fire-isolated exits; travel distance limits; stair pressurisation for high-rise.", ref: "NCC Vol.1 D2/D3" },
      { topic: "Sprinklers", detail: "Automatic sprinkler protection mandatory; fast-response heads above effective height thresholds.", ref: "NCC Vol.1 E1D / AS 2118.1" },
      { topic: "Fire-rated core", detail: "Lift/stair shafts and service risers fire-separated; FRLs to AS 1530.4.", ref: "NCC Vol.1 C3/C4" },
      { topic: "Structural actions", detail: "Wind (region-specific), seismic, and live loads per the Australian Standards loading suite.", ref: "AS 1170 series" },
      { topic: "Lift provision / accessibility", detail: "Accessible lift access to all storeys; emergency lift operation.", ref: "NCC Vol.1 E3 / AS 1735" },
      { topic: "Energy (commercial)", detail: "Section J — façade thermal performance, HVAC efficiency, metering.", ref: "NCC Vol.1 Section J" },
      { topic: "Approvals", detail: "Performance Solution by fire engineer often required; certified by building surveyor.", ref: "Building Act / NCC A2" },
    ],
  },
  US: {
    name: "International Building Code (IBC) — commercial",
    authority: "International Code Council (ICC)",
    url: "https://codes.iccsafe.org/content/IBC2021P1",
    sections: [
      { topic: "Construction type / high-rise", detail: "Buildings >75ft to top occupied floor = high-rise; Type I-A construction typical.", ref: "IBC 403 / 602" },
      { topic: "Sprinklers + standpipes", detail: "Automatic sprinklers and Class I standpipes required throughout high-rises.", ref: "IBC 403.3 / 905" },
      { topic: "Egress", detail: "Min 2 exits; smokeproof enclosures; occupant-load-based stair width.", ref: "IBC 1006 / 1023" },
      { topic: "Fire command + areas of refuge", detail: "Fire command center and emergency systems for high-rises.", ref: "IBC 403.4 / 911" },
      { topic: "Structural loads", detail: "Wind, seismic (SDC), live and dead loads per ASCE 7.", ref: "IBC 1605 / ASCE 7" },
      { topic: "Accessibility", detail: "Accessible route and elevators to all floors.", ref: "IBC 1009 / ICC A117.1" },
      { topic: "Energy", detail: "Envelope, HVAC, lighting power density per IECC commercial.", ref: "IECC-C / ASHRAE 90.1" },
    ],
  },
  UK: {
    name: "Building Regulations — higher-risk / commercial",
    authority: "Building Safety Regulator (HSE) / DLUHC",
    url: "https://www.gov.uk/government/collections/approved-documents",
    sections: [
      { topic: "Higher-risk buildings", detail: "Buildings ≥18m or ≥7 storeys fall under the Building Safety Act gateway regime.", ref: "Building Safety Act 2022" },
      { topic: "Fire safety", detail: "Means of escape, compartmentation, sprinklers ≥11m residential; cladding combustibility limits.", ref: "Approved Document B" },
      { topic: "Structure", detail: "Disproportionate collapse provisions for tall buildings.", ref: "Approved Document A" },
      { topic: "Energy", detail: "Conservation of fuel and power, commercial.", ref: "Approved Document L2" },
      { topic: "Access", detail: "Access to and use of buildings; lift provision.", ref: "Approved Document M" },
      { topic: "Gateways", detail: "BSR approval at design (Gateway 2) and completion (Gateway 3).", ref: "BSR / Gateway regime" },
    ],
  },
};

/* =========================================================================
   MODULE: legislation.js
   An authoritative directory of the governing building Act + regulator for
   each jurisdiction, linked to the official source. This is a links
   directory (not a reproduction of the law) so it stays current and correct.
   AU is broken down by state/territory; pick yours from the selector.
   ========================================================================= */
const Legislation = {
  AU: {
    national: { name: "National Construction Code (NCC)", body: "Australian Building Codes Board (ABCB)", url: "https://ncc.abcb.gov.au/", note: "The NCC is given legal force by each state/territory's own building Act below." },
    jurisdictions: [
      { code: "QLD", name: "Queensland", act: "Building Act 1975 (QLD) + QBCC Act 1991", regulator: "Queensland Building and Construction Commission (QBCC)", regulatorUrl: "https://www.qbcc.qld.gov.au/", actUrl: "https://www.legislation.qld.gov.au/view/html/inforce/current/act-1975-011", qbccActUrl: "https://www.legislation.qld.gov.au/view/html/inforce/current/act-1991-098" },
      { code: "NSW", name: "New South Wales", act: "Home Building Act 1989 + DBP Act 2020", regulator: "Building Commission NSW", regulatorUrl: "https://www.nsw.gov.au/departments-and-agencies/building-commission", actUrl: "https://legislation.nsw.gov.au/view/html/inforce/current/act-1989-147" },
      { code: "VIC", name: "Victoria", act: "Building Act 1993 (VIC) + Building Regulations 2018", regulator: "Building & Plumbing Commission (BPC) / VBA", regulatorUrl: "https://www.vba.vic.gov.au/", actUrl: "https://www.legislation.vic.gov.au/in-force/acts/building-act-1993" },
      { code: "SA", name: "South Australia", act: "Planning, Development and Infrastructure Act 2016 (SA)", regulator: "Consumer & Business Services / PlanSA", regulatorUrl: "https://plan.sa.gov.au/", actUrl: "https://www.legislation.sa.gov.au/lz?path=/c/a/planning%20development%20and%20infrastructure%20act%202016" },
      { code: "WA", name: "Western Australia", act: "Building Act 2011 (WA)", regulator: "Building & Energy (DEMIRS)", regulatorUrl: "https://www.demirs.wa.gov.au/building-and-energy", actUrl: "https://www.legislation.wa.gov.au/legislation/statutes.nsf/main_mrtitle_12333_homepage.html" },
      { code: "TAS", name: "Tasmania", act: "Building Act 2016 (TAS)", regulator: "Consumer, Building & Occupational Services (CBOS)", regulatorUrl: "https://www.cbos.tas.gov.au/", actUrl: "https://www.legislation.tas.gov.au/view/html/inforce/current/act-2016-012" },
      { code: "ACT", name: "Aust. Capital Territory", act: "Building Act 2004 (ACT)", regulator: "Access Canberra", regulatorUrl: "https://www.accesscanberra.act.gov.au/", actUrl: "https://www.legislation.act.gov.au/a/2004-11/" },
      { code: "NT", name: "Northern Territory", act: "Building Act 1993 (NT)", regulator: "NT Building Advisory Services", regulatorUrl: "https://nt.gov.au/property/building-and-development", actUrl: "https://legislation.nt.gov.au/Legislation/BUILDING-ACT-1993" },
    ],
  },
  US: {
    national: { name: "International Codes (I-Codes): IRC / IBC", body: "International Code Council (ICC)", url: "https://codes.iccsafe.org/", note: "The ICC publishes model codes; each state and many local jurisdictions adopt and amend their own version. Always confirm the locally adopted code with your Authority Having Jurisdiction (AHJ)." },
    jurisdictions: [
      { code: "MODEL", name: "Model codes (ICC)", act: "International Residential Code (IRC) / International Building Code (IBC)", regulator: "International Code Council", regulatorUrl: "https://www.iccsafe.org/", actUrl: "https://codes.iccsafe.org/" },
      { code: "CA", name: "California", act: "California Building Standards Code (Title 24)", regulator: "California Building Standards Commission", regulatorUrl: "https://www.dgs.ca.gov/BSC", actUrl: "https://codes.iccsafe.org/codes/california" },
      { code: "TX", name: "Texas", act: "Adopted IRC/IBC (local adoption varies)", regulator: "Texas Dept. of Licensing & Regulation", regulatorUrl: "https://www.tdlr.texas.gov/", actUrl: "https://codes.iccsafe.org/" },
      { code: "FL", name: "Florida", act: "Florida Building Code", regulator: "Florida Building Commission", regulatorUrl: "https://www.floridabuilding.org/", actUrl: "https://codes.iccsafe.org/codes/florida" },
      { code: "NY", name: "New York", act: "NYS Uniform Code / NYC Construction Codes", regulator: "NYS Div. of Building Standards & Codes", regulatorUrl: "https://dos.ny.gov/building-standards-and-codes", actUrl: "https://codes.iccsafe.org/codes/new-york" },
    ],
  },
  UK: {
    national: { name: "The Building Regulations 2010 + Approved Documents", body: "Building Safety Regulator (HSE) / MHCLG", url: "https://www.gov.uk/government/collections/approved-documents", note: "England's Approved Documents shown. Scotland, Wales and Northern Ireland operate separate building standards systems — pick yours below." },
    jurisdictions: [
      { code: "ENG", name: "England", act: "Building Regulations 2010 + Building Safety Act 2022", regulator: "Building Safety Regulator (HSE)", regulatorUrl: "https://www.hse.gov.uk/building-safety/regulator.htm", actUrl: "https://www.gov.uk/government/collections/approved-documents" },
      { code: "WAL", name: "Wales", act: "Building Regulations (Wales)", regulator: "Welsh Government", regulatorUrl: "https://www.gov.wales/building-regulations", actUrl: "https://www.gov.wales/building-regulations-guidance" },
      { code: "SCO", name: "Scotland", act: "Building (Scotland) Act 2003 + Technical Handbooks", regulator: "Scottish Government Building Standards", regulatorUrl: "https://www.gov.scot/policies/building-standards/", actUrl: "https://www.gov.scot/collections/building-standards-technical-handbooks/" },
      { code: "NI", name: "Northern Ireland", act: "Building Regulations (NI) 2012", regulator: "Dept. of Finance (NI)", regulatorUrl: "https://www.finance-ni.gov.uk/topics/building-regulations-and-energy-efficiency-buildings", actUrl: "https://www.finance-ni.gov.uk/articles/technical-booklets" },
    ],
  },
};

const HighRiseEstimator = {
  /* spec: { floorPlateM2, floors, floorHeightM, basementLevels, structureType,
            facadeType, occupancy, passengerLifts, goodsLifts, hasEscalators,
            siteCondition } */
  takeoff(spec) {
    const { floorPlateM2, floors, floorHeightM, basementLevels, facadeType, structureType } = spec;
    const gfa = floorPlateM2 * floors;
    const basementArea = floorPlateM2 * (basementLevels || 0);
    const totalHeightM = floors * floorHeightM;
    // façade area: assume ~square plate, perimeter × height; +20% for articulation
    const plateSide = Math.sqrt(Math.max(1, floorPlateM2));
    const perimeter = 4 * plateSide;
    const facadeArea = perimeter * totalHeightM * 1.2;
    // excavation for basements: area × depth × levels
    const excavationM3 = basementArea * 3.5;
    // fire stairs: 2 minimum, +1 per ~1500 m² plate over 1000
    const fireStairs = Math.max(2, Math.ceil(floorPlateM2 / 1500) + 1);
    return {
      gfaM2: gfa, floorPlateM2, floors, totalHeightM, basementArea,
      facadeArea, excavationM3, fireStairs,
      siteAreaM2: floorPlateM2 * 1.3, // footprint + setbacks
      facadeType, structureType,
    };
  },

  systemCosts(t, spec, region) {
    const lines = [];
    const add = (id, qty) => {
      const s = HighRiseMaterials.get(id);
      if (!s || qty <= 0) return;
      const rate = HighRiseMaterials.rate(id, region);
      lines.push({ category: s.category, label: s.label, unit: s.unit, qty: round(qty, 1), rate: round(rate, 2), total: round(rate * qty, 2) });
    };

    // substructure
    add("hr_piling", t.siteAreaM2);
    add("hr_excavation", t.excavationM3);
    if (t.basementArea > 0) add("hr_basement", t.basementArea);

    // superstructure: core always RC; frame by type
    add("hr_core_rc", t.gfaM2);
    const frame = t.structureType === "steel" ? "hr_frame_steel"
                : t.structureType === "composite" ? "hr_frame_composite"
                : "hr_frame_rc";
    add(frame, t.gfaM2);

    // façade
    const fac = t.facadeType === "precast" ? "hr_precast_facade"
              : t.facadeType === "window_wall" ? "hr_window_wall"
              : "hr_curtain_wall";
    add(fac, t.facadeArea);

    // vertical transport — lift cost scales with rise (floors/10 factor, min 1)
    const riseFactor = Math.max(1, t.floors / 10);
    const pax = spec.passengerLifts || Math.max(1, Math.ceil(t.floors / 8));
    for (let i = 0; i < pax; i++) add("hr_lift_passenger", riseFactor);
    if (spec.goodsLifts) for (let i = 0; i < spec.goodsLifts; i++) add("hr_lift_goods", riseFactor);
    if (spec.hasEscalators) add("hr_escalator", 2);

    // services (MEP)
    add("hr_hvac_central", t.gfaM2);
    add("hr_electrical_dist", t.gfaM2);
    add("hr_hydraulic", t.gfaM2);
    add("hr_bms", t.gfaM2);

    // fire & life safety
    add("hr_sprinkler", t.gfaM2);
    add("hr_fire_detection", t.gfaM2);
    add("hr_fire_stairs", t.fireStairs);

    // fit-out (base building)
    add("hr_fitout_core", t.gfaM2);
    add("hr_ceilings_floors", t.gfaM2);
    if (t.basementArea > 0) add("hr_carpark", t.basementArea);

    return lines;
  },

  timeline(t, spec) {
    // high-rise programme: mobilisation + substructure + (floor cycle × floors) + fit-out + commissioning
    const floorCycleDays = { rc: 7, composite: 6, steel: 5 }[spec.structureType] || 7; // days per typical floor
    const structureWeeks = Math.ceil((t.floors * floorCycleDays) / 5);
    const substructureWeeks = 8 + (spec.basementLevels || 0) * 6;
    const facadeWeeks = Math.ceil(t.floors * 0.6);
    const fitoutWeeks = Math.ceil(t.floors * 0.8);
    const totalWeeks = 12 + substructureWeeks + structureWeeks + Math.round(facadeWeeks * 0.5) + fitoutWeeks + 12;
    const stages = [
      { name: "Mobilisation & site establishment", weeks: 8 },
      { name: "Piling & substructure", weeks: substructureWeeks },
      { name: "Core & superstructure cycle", weeks: structureWeeks },
      { name: "Façade installation (trails structure)", weeks: facadeWeeks },
      { name: "Services rough-in (MEP risers)", weeks: Math.ceil(t.floors * 0.5) },
      { name: "Vertical transport installation", weeks: 10 },
      { name: "Base-building fit-out", weeks: fitoutWeeks },
      { name: "Fire & life-safety commissioning", weeks: 8 },
      { name: "Testing, certification & handover", weeks: 6 },
    ];
    let week = 0;
    return {
      totalWeeks,
      stages: stages.map((s) => { const startWeek = week + 1; week += s.weeks; return { ...s, startWeek, endWeek: week }; }),
    };
  },

  buildEstimate(spec, region) {
    const takeoff = this.takeoff(spec);
    const taxRate = { AU: 0.10, US: 0.0, UK: 0.20 }[region];
    const taxLabel = { AU: "GST (10%)", US: "Sales tax (varies)", UK: "VAT (20%)" }[region];
    if (takeoff.gfaM2 <= 0) {
      return { mode: "highrise", region, spec, takeoff, systemLines: [], systemsTotal: 0,
        prelims: 0, designFees: 0, margin: 0, contingency: 0, total: 0, taxRate, taxLabel,
        timeline: { totalWeeks: 0, stages: [] } };
    }
    const systemLines = this.systemCosts(takeoff, spec, region);
    const systemsTotal = systemLines.reduce((a, l) => a + l.total, 0);
    const timeline = this.timeline(takeoff, spec);
    // commercial loadings differ from residential
    const complexity = { flat: 1.0, sloping: 1.08, difficult: 1.18 }[spec.siteCondition] || 1.0;
    const adjSystems = systemsTotal * complexity;
    const prelims = adjSystems * 0.12;     // site, cranes, hoists, supervision (higher for towers)
    const designFees = adjSystems * 0.10;  // engineering, fire, façade consultants
    const margin = adjSystems * 0.10;      // builder margin (thinner % on large jobs)
    const contingency = adjSystems * 0.08;
    const total = adjSystems + prelims + designFees + margin + contingency;
    return {
      mode: "highrise", region, spec, takeoff,
      systemLines, systemsTotal: adjSystems,
      prelims, designFees, margin, contingency, total,
      taxRate, taxLabel, timeline,
    };
  },
};

/* =========================================================================
   MODULE: materials-only.js
   Pure material pricing — no labour, equipment, margin, or programme.
   You list materials + quantities (or import a sheet) and get the raw
   supply cost, plus order quantities with waste. Ideal for sanity-checking
   the catalogue and for "supply only" quotes.
   ========================================================================= */
/* A small labour & trade rate card so labour lines can auto-price too.
   Rates are indicative supply-of-labour day/hour/unit rates. */
const LabourRates = {
  catalog: [
    { id: "lab_carpenter", label: "Carpenter", unit: "day", regions: { AU: 520, US: 360, UK: 320 } },
    { id: "lab_apprentice", label: "Apprentice", unit: "day", regions: { AU: 280, US: 200, UK: 180 } },
    { id: "lab_bricklayer", label: "Bricklayer", unit: "day", regions: { AU: 560, US: 380, UK: 340 } },
    { id: "lab_concreter", label: "Concreter", unit: "day", regions: { AU: 540, US: 370, UK: 330 } },
    { id: "lab_electrician", label: "Electrician", unit: "day", regions: { AU: 640, US: 440, UK: 390 } },
    { id: "lab_plumber", label: "Plumber", unit: "day", regions: { AU: 640, US: 440, UK: 390 } },
    { id: "lab_plasterer", label: "Plasterer", unit: "day", regions: { AU: 500, US: 340, UK: 300 } },
    { id: "lab_painter", label: "Painter", unit: "day", regions: { AU: 460, US: 320, UK: 280 } },
    { id: "lab_tiler", label: "Tiler", unit: "day", regions: { AU: 520, US: 360, UK: 320 } },
    { id: "lab_roofer", label: "Roofer", unit: "day", regions: { AU: 540, US: 370, UK: 330 } },
    { id: "lab_labourer", label: "General labourer", unit: "day", regions: { AU: 360, US: 250, UK: 220 } },
    { id: "lab_supervisor", label: "Site supervisor", unit: "day", regions: { AU: 720, US: 500, UK: 440 } },
    { id: "lab_crane", label: "Crane + operator", unit: "day", regions: { AU: 2200, US: 1500, UK: 1350 } },
    { id: "lab_excavator", label: "Excavator + operator", unit: "day", regions: { AU: 1100, US: 760, UK: 680 } },
  ],
  get(id) { return this.catalog.find((l) => l.id === id); },
  rate(id, region) { const l = this.get(id); return l ? l.regions[region] ?? 0 : 0; },
};

/* =========================================================================
   MODULE: quote-builder.js  (was materials-only)
   A single editable quote of mixed line items. Each line has a `kind`:
     - "material" → priced from the Materials catalogue (or a fixed/file rate)
     - "labour"   → priced from the LabourRates card (or a fixed rate)
     - "element"  → a free-text job/trade/allowance with the rate you type
   Everything sums into ONE total, grouped by kind, so a client gets a single
   quote covering material + labour + trades, not three separate ones.
   ========================================================================= */
const MaterialsOnly = {
  rateFor(item, region) {
    if (item.kind === "labour" && item.labourId) return LabourRates.rate(item.labourId, region);
    if ((item.kind === "material" || !item.kind) && item.materialId) return Materials.rate(item.materialId, region);
    return null;
  },
  catalogLabel(item) {
    if (item.kind === "labour" && item.labourId) return LabourRates.get(item.labourId)?.label;
    if (item.materialId) return Materials.get(item.materialId)?.label;
    return null;
  },
  catalogUnit(item) {
    if (item.kind === "labour" && item.labourId) return LabourRates.get(item.labourId)?.unit;
    if (item.materialId) return Materials.get(item.materialId)?.unit;
    return "";
  },

  buildEstimate(matSpec, region) {
    const lines = [];
    for (const item of (matSpec.lines || [])) {
      const kind = item.kind || "material";
      const qty = +item.qty || 0;
      const catLabel = this.catalogLabel(item);
      const catUnit = this.catalogUnit(item);
      const catRate = this.rateFor(item, region);
      const materialId = kind === "material" ? (item.materialId || null) : null;

      // pricing priority: file total → fixed rate → catalogue rate
      let rate = null, total = null, priceSource = "";
      if (item.fixedTotal != null && isFinite(item.fixedTotal)) {
        total = item.fixedTotal;
        rate = item.fixedRate != null ? item.fixedRate : (qty ? item.fixedTotal / qty : null);
        priceSource = "file";
      } else if (item.fixedRate != null && isFinite(item.fixedRate)) {
        rate = item.fixedRate; total = item.fixedRate * qty; priceSource = "manual";
      } else if (catRate != null && qty > 0) {
        rate = catRate; total = catRate * qty; priceSource = "catalogue";
      }

      const needsPrice = total == null;
      lines.push({
        kind, materialId,
        labourId: kind === "labour" ? (item.labourId || null) : null,
        category: kind === "labour" ? "labour" : kind === "element" ? "trades & elements" : (item.materialId ? Materials.get(item.materialId)?.category : "materials"),
        label: item.label || catLabel || (kind === "labour" ? "Labour" : kind === "element" ? "Item" : "Material"),
        unit: item.unit || catUnit || "",
        qty: qty || null,
        rate: rate != null ? round(rate, 2) : null,
        total: total != null ? round(total, 2) : 0,
        priceSource, needsPrice,
        alloc: materialId && qty > 0 ? Allocation.forMaterial(materialId, qty) : null,
      });
    }
    const total = lines.reduce((a, l) => a + (l.total || 0), 0);
    const byKind = { material: 0, labour: 0, element: 0 };
    for (const l of lines) byKind[l.kind] = (byKind[l.kind] || 0) + (l.total || 0);
    const taxRate = { AU: 0.10, US: 0.0, UK: 0.20 }[region];
    const taxLabel = { AU: "GST (10%)", US: "Sales tax (varies)", UK: "VAT (20%)" }[region];
    return { mode: "materials", region, spec: matSpec, lines, materialsTotal: total, total, byKind, taxRate, taxLabel };
  },
};

/* =========================================================================
   MODULE: reporter.js
   Builds a downloadable text-format report from an estimate.
   ========================================================================= */
const Reporter = {
  build(estimate, projectNo) {
    const { region, spec, takeoff, materialLines, materialsTotal,
            labourLines, labourTotal, equipmentLines, equipmentTotal,
            subtotal, prelims, margin, contingency, total, taxRate, taxLabel,
            timeline } = estimate;
    const currency = currencySymbol(region);
    const lines = [];
    const rule = "=".repeat(78);
    const half = "-".repeat(78);

    lines.push(rule);
    lines.push("  ESTIMATING TAKEOFF SHEET & COST REPORT");
    lines.push(`  Project No.: ${projectNo}   |   Region: ${region}   |   Date: ${new Date().toISOString().slice(0,10)}`);
    lines.push(rule);
    lines.push("");

    lines.push("PROJECT BRIEF");
    lines.push(half);
    lines.push(pad("Footprint", 32) + `${spec.widthM} m × ${spec.lengthM} m`);
    lines.push(pad("Floors", 32) + `${spec.floors}`);
    lines.push(pad("Wall height (per floor)", 32) + `${spec.wallHeightM} m`);
    lines.push(pad("Roof pitch", 32) + `${spec.roofPitch}°`);
    lines.push(pad("Site condition", 32) + spec.siteCondition);
    lines.push(pad("Framing", 32) + spec.framingType);
    lines.push(pad("Roof material", 32) + spec.roofType);
    lines.push(pad("Cladding", 32) + spec.claddingType);
    lines.push(pad("Floor finish", 32) + spec.floorFinish);
    lines.push(pad("Kitchens / Bathrooms", 32) + `${(spec.kitchens || []).length} / ${(spec.bathrooms || []).length}`);
    lines.push(pad("Rooms scheduled", 32) + `${(spec.rooms || []).length}`);
    lines.push(pad("Garage", 32) + (spec.hasGarage ? "Yes" : "No"));
    lines.push(pad("Solar PV included", 32) + (spec.solar ? "Yes" : "No"));
    lines.push("");

    lines.push("QUANTITY TAKEOFF");
    lines.push(half);
    lines.push(pad("Gross floor area", 32) + `${takeoff.gfaM2.toFixed(1)} m²`);
    lines.push(pad("Wall area (gross / net)", 32) + `${takeoff.wallAreaM2.toFixed(1)} / ${takeoff.netWallAreaM2.toFixed(1)} m²`);
    lines.push(pad("Roof area", 32) + `${takeoff.roofAreaM2.toFixed(1)} m²`);
    lines.push(pad("Concrete (slab + footings)", 32) + `${takeoff.concreteTotalM3.toFixed(2)} m³`);
    lines.push(pad("Reinforcement", 32) + `${takeoff.rebarTonne.toFixed(2)} tonnes`);
    lines.push("");

    lines.push("MATERIALS — ITEMISED");
    lines.push(half);
    lines.push(pad("Item", 36) + pad("Qty", 12) + pad("Rate", 14) + "Total");
    lines.push(half);
    for (const l of materialLines) {
      lines.push(pad(l.label, 36) + pad(`${l.qty} ${l.unit}`, 12) + pad(`${currency}${fmt(l.rate)}`, 14) + `${currency}${fmt(l.total)}`);
    }
    lines.push(half);
    lines.push(pad("Materials subtotal", 62) + `${currency}${fmt(materialsTotal)}`);
    lines.push("");

    lines.push("LABOUR — BY TRADE");
    lines.push(half);
    for (const l of labourLines) {
      lines.push(pad(l.trade, 62) + `${currency}${fmt(l.total)}`);
    }
    lines.push(half);
    lines.push(pad("Labour subtotal", 62) + `${currency}${fmt(labourTotal)}`);
    lines.push("");

    lines.push("EQUIPMENT & PLANT");
    lines.push(half);
    for (const e of equipmentLines) {
      lines.push(pad(`${e.name}`, 36) + pad(`${e.qty} ${e.unit}`, 12) + pad(`${currency}${fmt(e.rate)}`, 14) + `${currency}${fmt(e.total)}`);
    }
    lines.push(half);
    lines.push(pad("Equipment subtotal", 62) + `${currency}${fmt(equipmentTotal)}`);
    lines.push("");

    lines.push("BUILDER ADD-ONS");
    lines.push(half);
    lines.push(pad("Direct costs subtotal", 62) + `${currency}${fmt(subtotal)}`);
    lines.push(pad("Preliminaries (8%)", 62) + `${currency}${fmt(prelims)}`);
    lines.push(pad("Builder margin (15%)", 62) + `${currency}${fmt(margin)}`);
    lines.push(pad("Contingency (7%)", 62) + `${currency}${fmt(contingency)}`);
    lines.push(half);
    lines.push(pad("TOTAL ESTIMATE", 62) + `${currency}${fmt(total)}`);
    if (taxRate > 0) lines.push(pad(`+ ${taxLabel}`, 62) + `${currency}${fmt(total * taxRate)}`);
    lines.push("");

    lines.push("CONSTRUCTION PROGRAMME");
    lines.push(half);
    lines.push(pad("Stage", 40) + pad("Weeks", 10) + "Span");
    lines.push(half);
    for (const s of timeline.stages) {
      lines.push(pad(s.name, 40) + pad(`${s.weeks}`, 10) + `wk ${s.startWeek}–${s.endWeek}`);
    }
    lines.push(half);
    lines.push(pad("Total programme", 40) + `${timeline.totalWeeks} weeks (~${(timeline.totalWeeks / 4.33).toFixed(1)} months)`);
    lines.push("");

    lines.push("REGULATORY NOTE");
    lines.push(half);
    const code = BuildingCodes[region];
    lines.push(`Refer to: ${code.name}`);
    lines.push(`Authority: ${code.authority}`);
    lines.push(`URL:       ${code.url}`);
    lines.push("");
    lines.push("This document is an indicative estimate based on user inputs and");
    lines.push("market rate guides. It is not a fixed-price quotation and does not");
    lines.push("constitute professional advice. Engage a licensed builder, quantity");
    lines.push("surveyor, and certifier for binding figures and code compliance.");
    lines.push("");
    lines.push(rule);

    return lines.join("\n");
  },

  buildHighRise(est, projectNo) {
    const { region, spec, takeoff, systemLines, systemsTotal, prelims, designFees, margin, contingency, total, taxRate, taxLabel, timeline } = est;
    const currency = currencySymbol(region);
    const lines = [];
    const rule = "=".repeat(78), half = "-".repeat(78);
    lines.push(rule);
    lines.push("  HIGH-RISE / COMMERCIAL — FEASIBILITY COST REPORT");
    lines.push(`  Project No.: ${projectNo}   |   Region: ${region}   |   Date: ${new Date().toISOString().slice(0,10)}`);
    lines.push(rule);
    lines.push("");
    lines.push("BUILDING PARAMETERS");
    lines.push(half);
    lines.push(pad("Floor plate", 32) + `${spec.floorPlateM2} m²`);
    lines.push(pad("Floors above ground", 32) + `${spec.floors}`);
    lines.push(pad("Floor-to-floor height", 32) + `${spec.floorHeightM} m`);
    lines.push(pad("Overall height", 32) + `${takeoff.totalHeightM.toFixed(1)} m`);
    lines.push(pad("Basement levels", 32) + `${spec.basementLevels}`);
    lines.push(pad("Gross floor area (GFA)", 32) + `${takeoff.gfaM2.toFixed(0)} m²`);
    lines.push(pad("Structure", 32) + spec.structureType);
    lines.push(pad("Façade", 32) + spec.facadeType);
    lines.push(pad("Passenger / goods lifts", 32) + `${spec.passengerLifts} / ${spec.goodsLifts}`);
    lines.push("");
    lines.push("ELEMENTAL COST PLAN");
    lines.push(half);
    lines.push(pad("System", 40) + pad("Qty", 14) + "Total");
    lines.push(half);
    for (const l of systemLines) {
      lines.push(pad(l.label, 40) + pad(`${l.qty} ${l.unit}`, 14) + `${currency}${fmt(l.total)}`);
    }
    lines.push(half);
    lines.push(pad("Systems subtotal (adj.)", 54) + `${currency}${fmt(systemsTotal)}`);
    lines.push(pad("Preliminaries (12%)", 54) + `${currency}${fmt(prelims)}`);
    lines.push(pad("Design & consultant fees (10%)", 54) + `${currency}${fmt(designFees)}`);
    lines.push(pad("Builder margin (10%)", 54) + `${currency}${fmt(margin)}`);
    lines.push(pad("Contingency (8%)", 54) + `${currency}${fmt(contingency)}`);
    lines.push(half);
    lines.push(pad("TOTAL ESTIMATE", 54) + `${currency}${fmt(total)}`);
    lines.push(pad("Rate per m² GFA", 54) + `${currency}${fmt(total / Math.max(1, takeoff.gfaM2))}/m²`);
    if (taxRate > 0) lines.push(pad(`+ ${taxLabel}`, 54) + `${currency}${fmt(total * taxRate)}`);
    lines.push("");
    lines.push("INDICATIVE PROGRAMME");
    lines.push(half);
    for (const s of timeline.stages) lines.push(pad(s.name, 46) + `wk ${s.startWeek}-${s.endWeek} (${s.weeks}w)`);
    lines.push(half);
    lines.push(pad("Total programme", 46) + `${timeline.totalWeeks} weeks (~${(timeline.totalWeeks/52).toFixed(1)} yrs)`);
    lines.push("");
    lines.push("REGULATORY NOTE");
    lines.push(half);
    const code = HighRiseCodes[region];
    lines.push(`Refer to: ${code.name}`);
    lines.push(`Authority: ${code.authority}`);
    lines.push(`URL:       ${code.url}`);
    lines.push("");
    lines.push("FEASIBILITY-GRADE ESTIMATE. High-rise costs depend on structural,");
    lines.push("wind/seismic, fire-engineering and geotechnical design not modelled");
    lines.push("here. Engage a quantity surveyor, structural & fire engineers and a");
    lines.push("builder for tender-grade figures and code compliance.");
    lines.push("");
    lines.push(rule);
    return lines.join("\n");
  },

  buildMaterials(est, projectNo) {
    const { region, lines: matLines, total, byKind, taxRate, taxLabel } = est;
    const currency = currencySymbol(region);
    const out = [];
    const rule = "=".repeat(78), half = "-".repeat(78);
    const kindLabel = { material: "MATERIAL", labour: "LABOUR", element: "JOB/TRADE" };
    out.push(rule);
    out.push("  QUOTE — MATERIAL, LABOUR & TRADES");
    out.push(`  Project No.: ${projectNo}   |   Region: ${region}   |   Date: ${new Date().toISOString().slice(0,10)}`);
    out.push(rule);
    out.push("");
    out.push(pad("Type", 11) + pad("Description", 34) + pad("Qty", 11) + "Total");
    out.push(half);
    for (const l of matLines) {
      out.push(pad(kindLabel[l.kind] || "ITEM", 11) + pad(l.label, 34) + pad(l.qty != null ? `${l.qty} ${l.unit}` : "—", 11) + `${currency}${fmt(l.total)}`);
    }
    out.push(half);
    if (byKind) {
      if (byKind.material) out.push(pad("  Materials", 56) + `${currency}${fmt(byKind.material)}`);
      if (byKind.labour) out.push(pad("  Labour", 56) + `${currency}${fmt(byKind.labour)}`);
      if (byKind.element) out.push(pad("  Trades & jobs", 56) + `${currency}${fmt(byKind.element)}`);
      out.push(half);
    }
    out.push(pad("QUOTE TOTAL", 56) + `${currency}${fmt(total)}`);
    if (taxRate > 0) out.push(pad(`+ ${taxLabel}`, 56) + `${currency}${fmt(total * taxRate)}`);
    out.push("");
    out.push("Feasibility-grade. Indicative rates; confirm materials with suppliers and");
    out.push("labour with your trades. Material order quantities include trade waste.");
    out.push(rule);
    return out.join("\n");
  },
};

/* =========================================================================
   MODULE: engine3D.js
   Three.js scene. Builds a procedural building from a spec and animates
   the construction sequence.
   ========================================================================= */
/* Slice-and-dice treemap: packs rooms into a rectangle with no gaps/overlaps,
   areas proportional to each room's footprint. Returns [{x,z,w,l,room}]. */
function sliceAndDice(rooms, x, z, w, l, horizontal) {
  const areaOf = (r) => Math.max(0.1, (r.widthM || 0) * (r.lengthM || 0));
  if (rooms.length === 1) {
    return [{ x, z, w, l, room: rooms[0] }];
  }
  const total = rooms.reduce((a, r) => a + areaOf(r), 0);
  // split into two groups near half the area
  let acc = 0, splitIdx = 0;
  for (let i = 0; i < rooms.length; i++) {
    acc += areaOf(rooms[i]);
    if (acc >= total / 2) { splitIdx = i + 1; break; }
  }
  splitIdx = Math.max(1, Math.min(rooms.length - 1, splitIdx));
  const groupA = rooms.slice(0, splitIdx);
  const groupB = rooms.slice(splitIdx);
  const areaA = groupA.reduce((a, r) => a + areaOf(r), 0);
  const ratio = areaA / total;
  if (horizontal) {
    const wA = w * ratio;
    return [
      ...sliceAndDice(groupA, x, z, wA, l, false),
      ...sliceAndDice(groupB, x + wA, z, w - wA, l, false),
    ];
  } else {
    const lA = l * ratio;
    return [
      ...sliceAndDice(groupA, x, z, w, lA, true),
      ...sliceAndDice(groupB, x, z + lA, w, l - lA, true),
    ];
  }
}

class Engine3D {
  constructor(mountEl) {
    this.mount = mountEl;
    this.width = mountEl.clientWidth;
    this.height = mountEl.clientHeight;
    this.scene = new THREE.Scene();
    this.scene.background = new THREE.Color(0xe8eaec);
    this.scene.fog = new THREE.Fog(0xe8eaec, 50, 140);

    this.camera = new THREE.PerspectiveCamera(45, this.width / this.height, 0.1, 500);
    this.camera.position.set(28, 22, 28);
    this.camera.lookAt(0, 4, 0);

    this.renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
    this.renderer.setPixelRatio(window.devicePixelRatio);
    this.renderer.setSize(this.width, this.height);
    this.renderer.shadowMap.enabled = true;
    this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    mountEl.appendChild(this.renderer.domElement);

    // Lights
    const ambient = new THREE.AmbientLight(0xffffff, 0.55);
    this.scene.add(ambient);
    const dir = new THREE.DirectionalLight(0xfff4d6, 0.85);
    dir.position.set(20, 30, 15);
    dir.castShadow = true;
    dir.shadow.mapSize.set(1024, 1024);
    dir.shadow.camera.left = -30;
    dir.shadow.camera.right = 30;
    dir.shadow.camera.top = 30;
    dir.shadow.camera.bottom = -30;
    this.scene.add(dir);

    // Ground
    const groundMat = new THREE.MeshStandardMaterial({ color: 0xb8b3a0, roughness: 0.95 });
    const ground = new THREE.Mesh(new THREE.PlaneGeometry(200, 200), groundMat);
    ground.rotation.x = -Math.PI / 2;
    ground.receiveShadow = true;
    this.scene.add(ground);

    // Grid
    const grid = new THREE.GridHelper(80, 40, 0x6b7279, 0xc9ccd0);
    grid.position.y = 0.01;
    grid.material.opacity = 0.25;
    grid.material.transparent = true;
    this.scene.add(grid);

    // Building group
    this.buildingGroup = new THREE.Group();
    this.scene.add(this.buildingGroup);

    // Animation state
    this.progress = 0; // 0..1 across all stages
    this.cameraAngle = Math.PI * 0.25;
    this.autoRotate = true;
    this.playing = false;
    this.spec = null;

    // Walkthrough state
    this.mode = "orbit"; // "orbit" | "walk"
    this.walkWaypoints = [];
    this.walkT = 0;          // 0..1 along the whole path
    this.walkSpeed = 0.0009; // per frame
    this.roofMeshes = [];    // hidden during walkthrough
    this.onWalkProgress = null;
    this.onModeChange = null;

    this.animate = this.animate.bind(this);
    this._animId = requestAnimationFrame(this.animate);

    this._resizeObs = new ResizeObserver(() => this.resize());
    this._resizeObs.observe(mountEl);
  }

  resize() {
    this.width = this.mount.clientWidth;
    this.height = this.mount.clientHeight;
    this.camera.aspect = this.width / this.height;
    this.camera.updateProjectionMatrix();
    this.renderer.setSize(this.width, this.height);
  }

  /* Build / rebuild the building meshes from spec */
  buildFromSpec(spec) {
    this.spec = spec;
    // Clear previous
    while (this.buildingGroup.children.length) {
      const c = this.buildingGroup.children[0];
      this.buildingGroup.remove(c);
      c.geometry?.dispose();
      if (Array.isArray(c.material)) c.material.forEach((m) => m.dispose());
      else c.material?.dispose();
    }
    /* Scale down for viewport — divide real metres so very large buildings fit. */
    const scale = 1.0;
    const w = spec.widthM * scale;
    const l = spec.lengthM * scale;
    const floorH = spec.wallHeightM * scale;
    const floors = spec.floors;
    const totalH = floorH * floors;

    /* --- Foundation (slab) --- */
    const slabH = 0.4;
    const slabMat = new THREE.MeshStandardMaterial({ color: 0x9a9a9a, roughness: 0.9 });
    const slab = new THREE.Mesh(new THREE.BoxGeometry(w + 0.6, slabH, l + 0.6), slabMat);
    slab.position.y = slabH / 2;
    slab.castShadow = true;
    slab.receiveShadow = true;
    slab.userData.stage = "foundation";
    this.buildingGroup.add(slab);

    /* --- Frame posts (corners + intermediates) --- */
    const frameMat = new THREE.MeshStandardMaterial({ color: 0x8b6f4a, roughness: 0.8 });
    const postGeo = new THREE.BoxGeometry(0.18, totalH, 0.18);
    const cornerOffsets = [
      [-w / 2 + 0.1, l / 2 - 0.1], [w / 2 - 0.1, l / 2 - 0.1],
      [-w / 2 + 0.1, -l / 2 + 0.1], [w / 2 - 0.1, -l / 2 + 0.1],
    ];
    const allPosts = [...cornerOffsets];
    /* intermediate posts at ~2m spacing along each wall */
    const stepX = Math.max(2.0, w / Math.ceil(w / 2.0));
    const stepZ = Math.max(2.0, l / Math.ceil(l / 2.0));
    for (let x = -w / 2 + stepX; x < w / 2 - 0.5; x += stepX) {
      allPosts.push([x, l / 2 - 0.1]);
      allPosts.push([x, -l / 2 + 0.1]);
    }
    for (let z = -l / 2 + stepZ; z < l / 2 - 0.5; z += stepZ) {
      allPosts.push([-w / 2 + 0.1, z]);
      allPosts.push([w / 2 - 0.1, z]);
    }
    for (const [px, pz] of allPosts) {
      const post = new THREE.Mesh(postGeo, frameMat);
      post.position.set(px, slabH + totalH / 2, pz);
      post.castShadow = true;
      post.userData.stage = "frame";
      this.buildingGroup.add(post);
    }
    /* horizontal floor plates between each storey */
    for (let f = 0; f <= floors; f++) {
      const plateY = slabH + f * floorH;
      const plateGeoX = new THREE.BoxGeometry(w, 0.15, 0.15);
      const plateGeoZ = new THREE.BoxGeometry(0.15, 0.15, l);
      const p1 = new THREE.Mesh(plateGeoX, frameMat);
      const p2 = new THREE.Mesh(plateGeoX, frameMat);
      const p3 = new THREE.Mesh(plateGeoZ, frameMat);
      const p4 = new THREE.Mesh(plateGeoZ, frameMat);
      p1.position.set(0, plateY, l / 2 - 0.1);
      p2.position.set(0, plateY, -l / 2 + 0.1);
      p3.position.set(-w / 2 + 0.1, plateY, 0);
      p4.position.set(w / 2 - 0.1, plateY, 0);
      [p1, p2, p3, p4].forEach((m) => { m.castShadow = true; m.userData.stage = "frame"; this.buildingGroup.add(m); });
    }

    /* --- Walls (per floor, per side) — 4 panels per floor --- */
    const claddingColor = spec.claddingType === "weatherboard" ? 0xe8e2d0
                       : spec.claddingType === "render" ? 0xece9e2
                       : 0xb46a4a;
    const wallMat = new THREE.MeshStandardMaterial({ color: claddingColor, roughness: 0.85 });
    const wallThk = 0.2;
    for (let f = 0; f < floors; f++) {
      const cy = slabH + f * floorH + floorH / 2;
      // front
      const wallFront = new THREE.Mesh(new THREE.BoxGeometry(w, floorH, wallThk), wallMat);
      wallFront.position.set(0, cy, l / 2);
      wallFront.userData.stage = "walls";
      // back
      const wallBack = new THREE.Mesh(new THREE.BoxGeometry(w, floorH, wallThk), wallMat);
      wallBack.position.set(0, cy, -l / 2);
      wallBack.userData.stage = "walls";
      // left
      const wallLeft = new THREE.Mesh(new THREE.BoxGeometry(wallThk, floorH, l), wallMat);
      wallLeft.position.set(-w / 2, cy, 0);
      wallLeft.userData.stage = "walls";
      // right
      const wallRight = new THREE.Mesh(new THREE.BoxGeometry(wallThk, floorH, l), wallMat);
      wallRight.position.set(w / 2, cy, 0);
      wallRight.userData.stage = "walls";
      [wallFront, wallBack, wallLeft, wallRight].forEach((m) => { m.castShadow = true; m.receiveShadow = true; this.buildingGroup.add(m); });
    }

    /* --- Windows (front + back, evenly spaced per floor) --- */
    const windowMat = new THREE.MeshStandardMaterial({
      color: 0x6fa8d1, roughness: 0.1, metalness: 0.5,
      emissive: 0x223a4e, emissiveIntensity: 0.3,
    });
    const winW = 1.0, winH = 1.2;
    const winsPerSide = Math.max(2, Math.floor(w / 2.5));
    for (let f = 0; f < floors; f++) {
      const cy = slabH + f * floorH + floorH * 0.55;
      for (let i = 0; i < winsPerSide; i++) {
        const x = -w / 2 + (w / (winsPerSide + 1)) * (i + 1);
        const winF = new THREE.Mesh(new THREE.BoxGeometry(winW, winH, 0.05), windowMat);
        winF.position.set(x, cy, l / 2 + wallThk / 2 + 0.01);
        winF.userData.stage = "finishes";
        const winB = new THREE.Mesh(new THREE.BoxGeometry(winW, winH, 0.05), windowMat);
        winB.position.set(x, cy, -l / 2 - wallThk / 2 - 0.01);
        winB.userData.stage = "finishes";
        this.buildingGroup.add(winF);
        this.buildingGroup.add(winB);
      }
      const winsPerEnd = Math.max(1, Math.floor(l / 3));
      for (let i = 0; i < winsPerEnd; i++) {
        const z = -l / 2 + (l / (winsPerEnd + 1)) * (i + 1);
        const winL = new THREE.Mesh(new THREE.BoxGeometry(0.05, winH, winW), windowMat);
        winL.position.set(-w / 2 - wallThk / 2 - 0.01, cy, z);
        winL.userData.stage = "finishes";
        const winR = new THREE.Mesh(new THREE.BoxGeometry(0.05, winH, winW), windowMat);
        winR.position.set(w / 2 + wallThk / 2 + 0.01, cy, z);
        winR.userData.stage = "finishes";
        this.buildingGroup.add(winL);
        this.buildingGroup.add(winR);
      }
    }

    /* --- Front door --- */
    const doorMat = new THREE.MeshStandardMaterial({ color: 0x3a2a1a, roughness: 0.7 });
    const door = new THREE.Mesh(new THREE.BoxGeometry(0.9, 2.0, 0.06), doorMat);
    door.position.set(0, slabH + 1.0, l / 2 + wallThk / 2 + 0.02);
    door.userData.stage = "finishes";
    this.buildingGroup.add(door);

    /* --- Roof (gable or hip approximated as a prism) --- */
    const roofColor = spec.roofType === "tile" ? 0x6a3a2e
                   : spec.roofType === "shingle" ? 0x3a3a40
                   : 0x4a4f56; // colorbond default
    const roofMat = new THREE.MeshStandardMaterial({ color: roofColor, roughness: 0.7, metalness: 0.2 });
    const ridgeH = (Math.min(w, l) / 2) * Math.tan((spec.roofPitch * Math.PI) / 180);
    /* Build a triangular-prism roof along the longer axis. */
    const roofShape = new THREE.Shape();
    roofShape.moveTo(-w / 2 - 0.4, 0);
    roofShape.lineTo(w / 2 + 0.4, 0);
    roofShape.lineTo(0, ridgeH);
    roofShape.lineTo(-w / 2 - 0.4, 0);
    const extrudeSettings = { depth: l + 0.8, bevelEnabled: false };
    const roofGeo = new THREE.ExtrudeGeometry(roofShape, extrudeSettings);
    roofGeo.translate(0, 0, -(l + 0.8) / 2);
    const roof = new THREE.Mesh(roofGeo, roofMat);
    roof.position.y = slabH + totalH;
    roof.castShadow = true;
    roof.userData.stage = "roof";
    this.buildingGroup.add(roof);

    /* --- Garage attached --- */
    if (spec.hasGarage) {
      const gw = 6, gl = 6.5, gh = 2.6;
      const garageMat = new THREE.MeshStandardMaterial({ color: claddingColor, roughness: 0.85 });
      const garage = new THREE.Group();
      const gWallF = new THREE.Mesh(new THREE.BoxGeometry(gw, gh, wallThk), garageMat);
      gWallF.position.set(0, gh / 2, gl / 2);
      const gWallB = new THREE.Mesh(new THREE.BoxGeometry(gw, gh, wallThk), garageMat);
      gWallB.position.set(0, gh / 2, -gl / 2);
      const gWallR = new THREE.Mesh(new THREE.BoxGeometry(wallThk, gh, gl), garageMat);
      gWallR.position.set(gw / 2, gh / 2, 0);
      const gRoof = new THREE.Mesh(new THREE.BoxGeometry(gw + 0.4, 0.2, gl + 0.4), roofMat);
      gRoof.position.set(0, gh + 0.1, 0);
      const gDoor = new THREE.Mesh(new THREE.BoxGeometry(gw - 1, gh - 0.4, 0.08),
        new THREE.MeshStandardMaterial({ color: 0xc8cdd1, roughness: 0.6 }));
      gDoor.position.set(0, (gh - 0.4) / 2 + 0.1, gl / 2 + wallThk / 2 + 0.01);
      [gWallF, gWallB, gWallR, gRoof, gDoor].forEach((m) => { m.castShadow = true; m.userData.stage = "finishes"; garage.add(m); });
      garage.position.set(-w / 2 - gw / 2 - 0.4, slabH, 0);
      garage.userData.stage = "finishes";
      this.buildingGroup.add(garage);
    }

    /* --- Solar PV array on roof --- */
    if (spec.solar) {
      const panelMat = new THREE.MeshStandardMaterial({ color: 0x12233a, roughness: 0.3, metalness: 0.4, emissive: 0x0a1530, emissiveIntensity: 0.2 });
      const rows = 2, cols = 4;
      const panelW = 1.6, panelH = 1.0;
      for (let r = 0; r < rows; r++) {
        for (let c = 0; c < cols; c++) {
          const panel = new THREE.Mesh(new THREE.BoxGeometry(panelW, 0.05, panelH), panelMat);
          panel.rotation.z = -(spec.roofPitch * Math.PI / 180);
          panel.position.set(-(cols - 1) * panelW / 2 + c * panelW * 1.05,
                             slabH + totalH + ridgeH * 0.55,
                             -(rows - 1) * panelH / 2 + r * panelH * 1.05 + 1);
          panel.userData.stage = "finishes";
          this.buildingGroup.add(panel);
        }
      }
    }

    /* --- Interior partitions + room floors (from room schedule) --- */
    this.roofMeshes = [];
    this.walkWaypoints = [];
    const rooms = (spec.rooms || []).filter((r) => (r.widthM || 0) * (r.lengthM || 0) > 0);
    const inset = 0.25;
    const interiorRect = { x: -w / 2 + inset, z: -l / 2 + inset, w: w - 2 * inset, l: l - 2 * inset };

    if (rooms.length > 0) {
      const layout = sliceAndDice(rooms, interiorRect.x, interiorRect.z, interiorRect.w, interiorRect.l, interiorRect.w >= interiorRect.l);
      const partWallMat = new THREE.MeshStandardMaterial({ color: 0xf0ece3, roughness: 0.92 });
      const partThk = 0.1;
      const partH = floorH - 0.15;
      const doorW = 0.9, doorH = 2.05;
      const floorColors = { timber: 0xb98a55, tile: 0xd7d3c8, carpet: 0x9a8d86 };

      // collect interior edges, dedup so shared walls aren't doubled
      const edgeMap = new Map();
      const isBoundary = (a, b, axis) => {
        // axis 'x' => horizontal edge at constant z; 'z' => vertical edge at constant x
        if (axis === "z") return Math.abs(a - (-w / 2 + inset)) < 0.05 || Math.abs(a - (w / 2 - inset)) < 0.05;
        return Math.abs(a - (-l / 2 + inset)) < 0.05 || Math.abs(a - (l / 2 - inset)) < 0.05;
      };

      for (const cell of layout) {
        // per-room floor patch (subtle colour so rooms read in walkthrough)
        const fcol = floorColors[cell.room.floorFinish] || floorColors.timber;
        const floorPatch = new THREE.Mesh(
          new THREE.BoxGeometry(cell.w - partThk, 0.04, cell.l - partThk),
          new THREE.MeshStandardMaterial({ color: fcol, roughness: 0.85 })
        );
        floorPatch.position.set(cell.x + cell.w / 2, slabH + 0.03, cell.z + cell.l / 2);
        floorPatch.receiveShadow = true;
        floorPatch.userData.stage = "walls";
        this.buildingGroup.add(floorPatch);

        // store walkthrough waypoint at room centre, eye height
        this.walkWaypoints.push({
          x: cell.x + cell.w / 2, z: cell.z + cell.l / 2,
          name: cell.room.name || cell.room.type,
        });

        // four edges -> dedup
        const edges = [
          { axis: "z", at: cell.x, from: cell.z, to: cell.z + cell.l },                 // left (const x)
          { axis: "z", at: cell.x + cell.w, from: cell.z, to: cell.z + cell.l },          // right
          { axis: "x", at: cell.z, from: cell.x, to: cell.x + cell.w },                  // bottom (const z)
          { axis: "x", at: cell.z + cell.l, from: cell.x, to: cell.x + cell.w },          // top
        ];
        for (const e of edges) {
          const key = `${e.axis}:${e.at.toFixed(2)}:${e.from.toFixed(2)}:${e.to.toFixed(2)}`;
          if (edgeMap.has(key)) continue;
          edgeMap.set(key, true);
          if (isBoundary(e.at, null, e.axis)) continue; // skip walls on building boundary (handled by exterior)
          // build a partition wall along this edge with a centred doorway gap
          const len = Math.abs(e.to - e.from);
          const mid = (e.from + e.to) / 2;
          const segLen = Math.max(0.1, (len - doorW) / 2);
          const makeSeg = (segCenter, segLength) => {
            const geo = e.axis === "z"
              ? new THREE.BoxGeometry(partThk, partH, segLength)
              : new THREE.BoxGeometry(segLength, partH, partThk);
            const m = new THREE.Mesh(geo, partWallMat);
            const y = slabH + partH / 2;
            if (e.axis === "z") m.position.set(e.at, y, segCenter);
            else m.position.set(segCenter, y, e.at);
            m.castShadow = true; m.receiveShadow = true; m.userData.stage = "walls";
            this.buildingGroup.add(m);
          };
          if (len > doorW + 0.4) {
            makeSeg(e.from + segLen / 2, segLen);
            makeSeg(e.to - segLen / 2, segLen);
            // lintel above doorway
            const lintelGeo = e.axis === "z"
              ? new THREE.BoxGeometry(partThk, partH - doorH, doorW)
              : new THREE.BoxGeometry(doorW, partH - doorH, partThk);
            const lintel = new THREE.Mesh(lintelGeo, partWallMat);
            const ly = slabH + doorH + (partH - doorH) / 2;
            if (e.axis === "z") lintel.position.set(e.at, ly, mid);
            else lintel.position.set(mid, ly, e.at);
            lintel.userData.stage = "walls";
            this.buildingGroup.add(lintel);
          } else {
            makeSeg(mid, len); // too short for a door — solid
          }
        }
      }
    }

    /* --- Staircase (between each storey) --- */
    if (spec.staircaseType && spec.staircaseType !== "none" && floors > 1) {
      const stairColor = spec.staircaseType === "steel_glass" ? 0x8a9099
                       : spec.staircaseType === "concrete" ? 0xb8b4ad
                       : 0x9c6b3f;
      const stairMat = new THREE.MeshStandardMaterial({ color: stairColor, roughness: 0.7, metalness: spec.staircaseType === "steel_glass" ? 0.5 : 0.1 });
      const railMat = new THREE.MeshStandardMaterial({ color: spec.staircaseType === "steel_glass" ? 0x6fa8d1 : 0x3a2a1a, roughness: 0.4, metalness: 0.3, transparent: spec.staircaseType === "steel_glass", opacity: spec.staircaseType === "steel_glass" ? 0.45 : 1 });
      const stepWidth = 1.1;
      const stepRun = 0.27;
      const x0 = w / 2 - inset - 0.4; // place near right interior edge
      const z0 = -l / 2 + inset + 0.6;
      for (let f = 0; f < floors - 1; f++) {
        const baseY = slabH + f * floorH;
        const rise = floorH;
        const nSteps = Math.max(12, Math.round(rise / 0.18));
        const stepRise = rise / nSteps;
        const runScale = Math.min(1, (l - 2 * inset - 1) / (nSteps * stepRun)); // fit within length
        for (let i = 0; i < nSteps; i++) {
          const h = (i + 1) * stepRise;
          const step = new THREE.Mesh(new THREE.BoxGeometry(stepWidth, h, stepRun * runScale), stairMat);
          step.position.set(x0 - stepWidth / 2, baseY + h / 2, z0 + (i + 0.5) * stepRun * runScale);
          step.castShadow = true; step.receiveShadow = true;
          step.userData.stage = "finishes";
          this.buildingGroup.add(step);
        }
        // handrail along the flight
        const runLen = nSteps * stepRun * runScale;
        const rail = new THREE.Mesh(new THREE.BoxGeometry(0.06, 0.9, runLen), railMat);
        rail.position.set(x0 - stepWidth + 0.05, baseY + rise / 2 + 0.5, z0 + runLen / 2);
        rail.rotation.x = -Math.atan2(rise, runLen);
        rail.userData.stage = "finishes";
        this.buildingGroup.add(rail);
      }
    }

    // tag roof meshes for walkthrough hide
    this.buildingGroup.traverse((o) => {
      if (o.userData && o.userData.stage === "roof") this.roofMeshes.push(o);
    });

    /* Stage indices for animation reveal */
    this.stageOrder = ["foundation", "frame", "walls", "roof", "finishes"];
  }

  /* Empty the model entirely — materials-only mode shows just the site. */
  clearBuilding() {
    this.isTower = false;
    while (this.buildingGroup.children.length) {
      const c = this.buildingGroup.children[0];
      this.buildingGroup.remove(c);
      c.geometry?.dispose();
      if (Array.isArray(c.material)) c.material.forEach((m) => m.dispose()); else c.material?.dispose();
    }
    this.roofMeshes = [];
    this.walkWaypoints = [];
  }

  /* Build a high-rise tower: stacked floor plates, central core, façade. */
  buildTower(spec) {
    this.spec = spec;
    this.isTower = true;
    while (this.buildingGroup.children.length) {
      const c = this.buildingGroup.children[0];
      this.buildingGroup.remove(c);
      c.geometry?.dispose();
      if (Array.isArray(c.material)) c.material.forEach((m) => m.dispose()); else c.material?.dispose();
    }
    this.roofMeshes = [];
    this.walkWaypoints = [];

    const plateSide = Math.sqrt(Math.max(1, spec.floorPlateM2));
    const sc = 0.5; // visual scale-down so tall towers fit the viewport
    const side = plateSide * sc;
    const fh = spec.floorHeightM * sc;
    const floors = spec.floors;
    const baseY = 0.4;

    // podium / basement indication
    const basement = spec.basementLevels || 0;
    if (basement > 0) {
      const podMat = new THREE.MeshStandardMaterial({ color: 0x7a7d80, roughness: 0.9 });
      const pod = new THREE.Mesh(new THREE.BoxGeometry(side * 1.3, basement * fh, side * 1.3), podMat);
      pod.position.y = baseY - (basement * fh) / 2;
      pod.userData.stage = "foundation";
      this.buildingGroup.add(pod);
    }

    // slab + core colours by structure type
    const slabColor = spec.structureType === "steel" ? 0x9aa0a6 : 0xbdb9b0;
    const slabMat = new THREE.MeshStandardMaterial({ color: slabColor, roughness: 0.85 });
    const coreMat = new THREE.MeshStandardMaterial({ color: 0x6e7378, roughness: 0.9 });
    // façade material
    const facadeIsGlass = spec.facadeType !== "precast";
    const facadeMat = new THREE.MeshStandardMaterial({
      color: facadeIsGlass ? 0x6fa8d1 : 0xcfcabf,
      roughness: facadeIsGlass ? 0.12 : 0.85,
      metalness: facadeIsGlass ? 0.5 : 0.05,
      transparent: facadeIsGlass, opacity: facadeIsGlass ? 0.55 : 1,
      emissive: facadeIsGlass ? 0x1a2c3a : 0x000000, emissiveIntensity: facadeIsGlass ? 0.25 : 0,
    });
    const mullionMat = new THREE.MeshStandardMaterial({ color: 0x3a3d40, roughness: 0.5, metalness: 0.4 });

    // central core (lift/stair shaft) — runs full height
    const coreSide = side * 0.28;
    const totalH = floors * fh;
    const core = new THREE.Mesh(new THREE.BoxGeometry(coreSide, totalH, coreSide), coreMat);
    core.position.set(0, baseY + totalH / 2, 0);
    core.castShadow = true; core.userData.stage = "frame";
    this.buildingGroup.add(core);

    // per-floor: slab plate + façade ring
    for (let f = 0; f < floors; f++) {
      const fy = baseY + f * fh;
      // slab
      const slab = new THREE.Mesh(new THREE.BoxGeometry(side, fh * 0.12, side), slabMat);
      slab.position.set(0, fy + fh * 0.06, 0);
      slab.castShadow = true; slab.receiveShadow = true; slab.userData.stage = "frame";
      this.buildingGroup.add(slab);
      // façade panels — 4 sides
      const panelH = fh * 0.86;
      const cy = fy + fh / 2;
      const mk = (w, d, x, z) => {
        const m = new THREE.Mesh(new THREE.BoxGeometry(w, panelH, d), facadeMat);
        m.position.set(x, cy, z); m.castShadow = true; m.userData.stage = "walls";
        this.buildingGroup.add(m);
      };
      mk(side, 0.06, 0, side / 2);
      mk(side, 0.06, 0, -side / 2);
      mk(0.06, side, side / 2, 0);
      mk(0.06, side, -side / 2, 0);
      // floor-line mullion band
      const band = new THREE.Mesh(new THREE.BoxGeometry(side + 0.1, fh * 0.06, side + 0.1), mullionMat);
      band.position.set(0, fy + 0.02, 0); band.userData.stage = "walls";
      this.buildingGroup.add(band);

      // walkthrough waypoint at each floor's lobby (next to core), eye height
      this.walkWaypoints.push({ x: coreSide / 2 + 1.2, z: 0, y: fy + 1.55 * sc, name: `Level ${f + 1}` });
    }

    // crown / plant level
    const crown = new THREE.Mesh(new THREE.BoxGeometry(side * 0.9, fh * 0.6, side * 0.9), coreMat);
    crown.position.set(0, baseY + totalH + fh * 0.3, 0);
    crown.castShadow = true; crown.userData.stage = "roof";
    this.roofMeshes.push(crown);
    this.buildingGroup.add(crown);

    // ground plane reference already exists; frame camera for tower height
    this.towerHeight = totalH;
    this.stageOrder = ["foundation", "frame", "walls", "roof", "finishes"];
    this.progress = 1;
  }

  /* progress 0..1: reveal stages in order */
  setProgress(p) {
    this.progress = Math.max(0, Math.min(1, p));
    if (!this.spec) return;
    const stageCount = this.stageOrder.length;
    const stageProgress = this.progress * stageCount;
    this.buildingGroup.traverse((obj) => {
      if (!obj.isMesh && !(obj.isGroup && obj.userData.stage)) return;
      const stage = obj.userData.stage;
      if (!stage) return;
      const stageIdx = this.stageOrder.indexOf(stage);
      const reveal = stageProgress - stageIdx; // 0..1+
      if (reveal <= 0) {
        obj.visible = false;
      } else if (reveal >= 1) {
        obj.visible = true;
        obj.scale.set(1, 1, 1);
        if (obj.userData._origY === undefined) obj.userData._origY = obj.position.y;
        obj.position.y = obj.userData._origY;
      } else {
        obj.visible = true;
        const e = easeOutCubic(reveal);
        if (stage === "foundation") {
          obj.scale.set(e, 1, e);
        } else if (stage === "frame") {
          obj.scale.set(1, e, 1);
          if (obj.userData._origY === undefined) obj.userData._origY = obj.position.y;
        } else if (stage === "walls") {
          obj.scale.set(1, e, 1);
          if (obj.userData._origY === undefined) obj.userData._origY = obj.position.y;
          /* Wall grows from the floor — shift down. Each wall is centred so scale Y is enough but visually a slide-up looks nicer */
        } else if (stage === "roof") {
          if (obj.userData._origY === undefined) obj.userData._origY = obj.position.y;
          obj.position.y = obj.userData._origY + (1 - e) * 8;
          obj.scale.set(1, 1, 1);
        } else if (stage === "finishes") {
          obj.scale.set(e, e, e);
        }
      }
    });
  }

  setAutoRotate(v) { this.autoRotate = v; }
  setPlaying(v) { this.playing = v; }

  /* ----- Walkthrough ----- */
  startWalk() {
    if (this.walkWaypoints.length === 0) return false;
    // ensure fully built so interior exists
    this.progress = 1;
    this.setProgress(1);
    this.mode = "walk";
    this.autoRotate = false;
    this.walkT = 0;
    // hide roof so we can see inside; soften fog
    this.roofMeshes.forEach((m) => (m.visible = false));
    this.scene.fog.near = 60; this.scene.fog.far = 200;
    if (this.onModeChange) this.onModeChange("walk");
    return true;
  }
  stopWalk() {
    this.mode = "orbit";
    this.roofMeshes.forEach((m) => (m.visible = true));
    this.scene.fog.near = 50; this.scene.fog.far = 140;
    this.autoRotate = true;
    if (this.onModeChange) this.onModeChange("orbit");
  }
  setWalkT(t) { this.walkT = Math.max(0, Math.min(1, t)); }

  /* Sample camera position + look target along the waypoint path at param t (0..1) */
  _sampleWalk(t) {
    const wp = this.walkWaypoints;
    const n = wp.length;
    const ey = (p) => (p.y != null ? p.y : this._eyeY());
    if (n === 1) {
      return { pos: [wp[0].x, ey(wp[0]), wp[0].z], look: [wp[0].x + 1, ey(wp[0]), wp[0].z], name: wp[0].name };
    }
    const segs = n - 1;
    const scaled = t * segs;
    const i = Math.min(segs - 1, Math.floor(scaled));
    const local = scaled - i;
    const a = wp[i], b = wp[i + 1];
    const px = a.x + (b.x - a.x) * local;
    const pz = a.z + (b.z - a.z) * local;
    const py = ey(a) + (ey(b) - ey(a)) * local;
    return {
      pos: [px, py, pz],
      look: [b.x, ey(b), b.z],
      name: local < 0.5 ? a.name : b.name,
    };
  }
  _eyeY() {
    const slabH = 0.4;
    return slabH + 1.55;
  }

  animate() {
    this._animId = requestAnimationFrame(this.animate);

    if (this.mode === "walk") {
      this.walkT += this.walkSpeed;
      if (this.walkT >= 1) this.walkT = 0; // loop the tour
      const s = this._sampleWalk(this.walkT);
      this.camera.position.set(s.pos[0], s.pos[1], s.pos[2]);
      this.camera.lookAt(s.look[0], s.look[1], s.look[2]);
      if (this.onWalkProgress) this.onWalkProgress(this.walkT, s.name);
      this.renderer.render(this.scene, this.camera);
      return;
    }

    if (this.autoRotate) {
      this.cameraAngle += 0.0025;
      if (this.isTower && this.towerHeight) {
        const h = this.towerHeight;
        const r = Math.max(30, h * 1.1);
        this.camera.position.x = Math.cos(this.cameraAngle) * r;
        this.camera.position.z = Math.sin(this.cameraAngle) * r;
        this.camera.position.y = h * 0.6 + 6;
        this.camera.lookAt(0, h * 0.45, 0);
      } else {
        const r = 30;
        this.camera.position.x = Math.cos(this.cameraAngle) * r;
        this.camera.position.z = Math.sin(this.cameraAngle) * r;
        this.camera.position.y = 18;
        this.camera.lookAt(0, 4, 0);
      }
    }
    if (this.playing) {
      this.progress += 0.0035;
      if (this.progress >= 1) {
        this.progress = 1;
        this.playing = false;
        if (this.onComplete) this.onComplete();
      }
      this.setProgress(this.progress);
    }
    this.renderer.render(this.scene, this.camera);
  }

  dispose() {
    cancelAnimationFrame(this._animId);
    this._resizeObs.disconnect();
    this.renderer.dispose();
    if (this.renderer.domElement.parentNode === this.mount) {
      this.mount.removeChild(this.renderer.domElement);
    }
  }
}

/* =========================================================================
   Utility helpers
   ========================================================================= */
function round(n, d = 2) { const f = Math.pow(10, d); return Math.round(n * f) / f; }
function fmt(n) { return n.toLocaleString(undefined, { minimumFractionDigits: 0, maximumFractionDigits: 0 }); }
function pad(s, n) { s = String(s); return s.length >= n ? s.slice(0, n - 1) + " " : s + " ".repeat(n - s.length); }
function easeOutCubic(t) { return 1 - Math.pow(1 - t, 3); }
function currencySymbol(region) { return { AU: "A$", US: "$", UK: "£" }[region] || "$"; }
function humaniseTradeName(k) {
  return ({
    siteworks: "Siteworks & earthworks",
    concrete: "Concretors",
    frame: "Carpenters / framers",
    roof: "Roofers",
    brick: "Bricklayers / cladders",
    electrical: "Electricians",
    plumbing: "Plumbers & drainers",
    hvac: "HVAC technicians",
    plaster: "Plasterers",
    paint: "Painters",
    tile: "Tilers & floor-layers",
    joinery: "Cabinet-makers & joiners",
    kitchen_bath_fit: "Joinery — kitchen & bath fit",
    finishes: "Finishing carpenters",
  })[k] || k;
}
function genProjectNo() {
  const d = new Date();
  return `EST-${d.getFullYear()}${String(d.getMonth() + 1).padStart(2, "0")}${String(d.getDate()).padStart(2, "0")}-${Math.floor(Math.random() * 9000 + 1000)}`;
}

/* =========================================================================
   REACT — UI shell
   ========================================================================= */
const DEFAULT_HR_SPEC = {
  floorPlateM2: 1200,
  floors: 24,
  floorHeightM: 3.6,
  basementLevels: 3,
  structureType: "rc",
  facadeType: "curtain_wall",
  occupancy: "office",
  passengerLifts: 4,
  goodsLifts: 1,
  hasEscalators: true,
  siteCondition: "flat",
};

const DEFAULT_MAT_SPEC = {
  lines: [
    { id: "m1", kind: "material", materialId: "concrete_25mpa", qty: 25 },
    { id: "m2", kind: "material", materialId: "brick_veneer", qty: 168 },
    { id: "m3", kind: "material", materialId: "timber_mgp10", qty: 640 },
    { id: "l1", kind: "labour", labourId: "lab_carpenter", qty: 8 },
    { id: "l2", kind: "labour", labourId: "lab_bricklayer", qty: 5 },
    { id: "e1", kind: "element", label: "Site clean & rubbish removal", qty: 1, unit: "item", fixedRate: 850 },
  ],
};

let _rid = 0;
const nextId = () => `r${++_rid}`;

const ROOM_TYPES = ["Bedroom", "Living", "Dining", "Study", "Media", "Laundry", "Hallway", "Walk-in robe", "Other"];
const ROOM_DEFAULT_FINISH = {
  Bedroom: "carpet", Living: "timber", Dining: "timber", Study: "carpet",
  Media: "carpet", Laundry: "tile", Hallway: "timber", "Walk-in robe": "carpet", Other: "timber",
};

const DEFAULT_SPEC = {
  widthM: 12, lengthM: 15, floors: 1, wallHeightM: 2.7, roofPitch: 22,
  siteCondition: "flat",
  framingType: "timber", roofType: "colorbond", claddingType: "brick", floorFinish: "timber",
  hasGarage: true, solar: true,
  staircaseType: "none",  // none | timber | steel_glass | concrete
  slabThicknessM: 0.1,
  openings: { windowsCount: 10, windowsM2: 14, doors: 2 },

  /* Room schedule — drives internal finishes, robes, internal doors */
  rooms: [
    { id: nextId(), name: "Master bedroom", type: "Bedroom", widthM: 4.2, lengthM: 3.8, floorFinish: "carpet", robe: "built_in", robeLengthM: 3.0 },
    { id: nextId(), name: "Bedroom 2", type: "Bedroom", widthM: 3.6, lengthM: 3.2, floorFinish: "carpet", robe: "built_in", robeLengthM: 2.4 },
    { id: nextId(), name: "Bedroom 3", type: "Bedroom", widthM: 3.4, lengthM: 3.0, floorFinish: "carpet", robe: "built_in", robeLengthM: 1.8 },
    { id: nextId(), name: "Open living", type: "Living", widthM: 6.5, lengthM: 5.5, floorFinish: "timber", robe: "none", robeLengthM: 0 },
    { id: nextId(), name: "Laundry", type: "Laundry", widthM: 2.2, lengthM: 2.0, floorFinish: "tile", robe: "none", robeLengthM: 0 },
  ],

  /* Detailed kitchen configs (one per kitchen) */
  kitchens: [
    { id: nextId(), benchLengthM: 7, cabinetry: "custom", benchtop: "stone", splashback: "tile", appliances: "mid", island: true, sinkTap: true },
  ],

  /* Detailed bathroom configs (one per bathroom) */
  bathrooms: [
    { id: nextId(), label: "Main bathroom", widthM: 3.0, lengthM: 2.4, hasBath: true, hasShower: true, vanityCount: 1, toiletCount: 1, wallTileFullHeight: false },
    { id: nextId(), label: "Ensuite", widthM: 2.6, lengthM: 2.0, hasBath: false, hasShower: true, vanityCount: 1, toiletCount: 1, wallTileFullHeight: true },
  ],
};

/* ---- Reset templates ----
   EMPTY_* = everything zeroed (Clear all). *_SECTION_CLEAR = per-card zeroing. */
const EMPTY_SPEC = {
  widthM: 0, lengthM: 0, floors: 1, wallHeightM: 2.4, roofPitch: 0,
  siteCondition: "flat",
  framingType: "timber", roofType: "colorbond", claddingType: "brick", floorFinish: "timber",
  hasGarage: false, solar: false,
  staircaseType: "none",
  slabThicknessM: 0.1,
  openings: { windowsCount: 0, windowsM2: 0, doors: 1 },
  rooms: [], kitchens: [], bathrooms: [],
};

const RES_SECTION_CLEAR = {
  dimensions: { widthM: 0, lengthM: 0, floors: 1, wallHeightM: 2.4, roofPitch: 0, slabThicknessM: 0.1 },
  materials: { framingType: "timber", roofType: "colorbond", claddingType: "brick", floorFinish: "timber", staircaseType: "none" },
  openings: { openings: { windowsCount: 0, windowsM2: 0, doors: 1 }, hasGarage: false, solar: false },
  site: { siteCondition: "flat" },
};

const EMPTY_HR_SPEC = {
  floorPlateM2: 0, floors: 5, floorHeightM: 3.6, basementLevels: 0,
  structureType: "rc", facadeType: "curtain_wall", occupancy: "office",
  passengerLifts: 1, goodsLifts: 0, hasEscalators: false, siteCondition: "flat",
};

const HR_SECTION_CLEAR = {
  massing: { floorPlateM2: 0, floors: 5, floorHeightM: 3.6, basementLevels: 0 },
  structure: { structureType: "rc", facadeType: "curtain_wall", occupancy: "office" },
  transport: { passengerLifts: 1, goodsLifts: 0, hasEscalators: false },
  site: { siteCondition: "flat" },
};

/* Convert an imported takeoff into a fully editable parametric spec:
   inferred dimensions + materials, and a seeded room/kitchen/bathroom
   schedule derived from detected element counts. No importedLines, so the
   estimator computes parametrically and every card is editable. */
function buildTemplateSpecFromImport(lines, source) {
  const inf = inferSpecFromImport(lines);
  const c = inf.counts;

  const nBath = Math.max(1, Math.max(c.toilets || 0, c.vanities || 0));
  const bathrooms = [];
  for (let i = 0; i < nBath; i++) {
    bathrooms.push({ id: nextId(), label: i === 0 ? "Main bathroom" : (i === nBath - 1 ? "Ensuite" : `Bathroom ${i + 1}`),
      widthM: 2.6, lengthM: 2.2, hasBath: i === 0, hasShower: true, vanityCount: 1, toiletCount: 1, wallTileFullHeight: i > 0 });
  }

  const nKit = Math.max(1, c.kitchenSinks || 0);
  const kitchens = [];
  for (let i = 0; i < nKit; i++) {
    kitchens.push({ id: nextId(), benchLengthM: 6, cabinetry: "flatpack", benchtop: "stone", splashback: "tile", appliances: "mid", island: true, sinkTap: true });
  }

  // bedrooms scaled to inferred GFA (~1 per 45 m², capped), plus living + laundry
  const nBed = Math.min(5, Math.max(1, Math.round(inf.gfa / 45)));
  const rooms = [];
  for (let i = 0; i < nBed; i++) {
    rooms.push({ id: nextId(), name: i === 0 ? "Master bedroom" : `Bedroom ${i + 1}`, type: "Bedroom",
      widthM: i === 0 ? 4.0 : 3.4, lengthM: i === 0 ? 3.6 : 3.0, floorFinish: "carpet",
      robe: i < 2 ? "built_in" : "none", robeLengthM: i < 2 ? 2.4 : 0 });
  }
  rooms.push({ id: nextId(), name: "Open living", type: "Living", widthM: 6, lengthM: 5, floorFinish: inf.floorFinish, robe: "none", robeLengthM: 0 });
  rooms.push({ id: nextId(), name: "Laundry", type: "Laundry", widthM: 2.2, lengthM: 2.0, floorFinish: "tile", robe: "none", robeLengthM: 0 });

  return {
    widthM: inf.side, lengthM: inf.side, floors: 1, wallHeightM: 2.7, roofPitch: 20, slabThicknessM: 0.1,
    siteCondition: "flat",
    framingType: "timber", roofType: inf.roof, claddingType: inf.cladding, floorFinish: inf.floorFinish,
    hasGarage: inf.hasGarage, solar: false, staircaseType: inf.staircaseType,
    openings: { windowsCount: c.windows || 10, windowsM2: Math.max(8, (c.windows || 10) * 1.2), doors: Math.max(1, c.doorsExt || 2) },
    rooms, kitchens, bathrooms,
    templateFrom: source || "import",   // marker only; no importedLines so it's fully editable
  };
}

export default function App() {
  const [region, setRegion] = useState("AU");
  const [buildMode, setBuildMode] = useState("residential"); // residential | highrise
  const [spec, setSpec] = useState(DEFAULT_SPEC);
  const [hrSpec, setHrSpec] = useState(DEFAULT_HR_SPEC);
  const [matSpec, setMatSpec] = useState(DEFAULT_MAT_SPEC);
  const [tab, setTab] = useState("estimate");
  const [projectNo] = useState(genProjectNo);
  const [autoRotate, setAutoRotate] = useState(true);
  const [progress, setProgress] = useState(1); // start fully built
  const [walkMode, setWalkMode] = useState(false);
  const [walkRoom, setWalkRoom] = useState("");
  const [walkT, setWalkT] = useState(0);
  const viewportRef = useRef(null);
  const engineRef = useRef(null);
  const shaderCanvasRef = useShaderBackground();

  /* Mount Three.js once */
  useEffect(() => {
    if (!viewportRef.current) return;
    const eng = new Engine3D(viewportRef.current);
    engineRef.current = eng;
    eng.buildFromSpec(spec);
    eng.setProgress(progress);
    eng.onComplete = () => setProgress(1);
    eng.onWalkProgress = (t, name) => { setWalkT(t); setWalkRoom(name || ""); };
    eng.onModeChange = (m) => setWalkMode(m === "walk");
    return () => eng.dispose();
  }, []);

  /* Rebuild on spec or mode change (exit walkthrough first) */
  useEffect(() => {
    const eng = engineRef.current;
    if (!eng) return;
    if (eng.mode === "walk") { eng.stopWalk(); setWalkMode(false); }
    if (buildMode === "highrise") {
      eng.isTower = true;
      eng.buildTower(hrSpec);
      setProgress(1);
    } else if (buildMode === "materials") {
      eng.isTower = false;
      eng.clearBuilding();   // materials-only: no model, just the empty site
    } else {
      eng.isTower = false;
      eng.buildFromSpec(spec);
      eng.setProgress(progress);
    }
  }, [spec, hrSpec, buildMode]);

  useEffect(() => { if (buildMode === "residential") engineRef.current?.setProgress(progress); }, [progress, buildMode]);
  useEffect(() => { if (!walkMode) engineRef.current?.setAutoRotate(autoRotate); }, [autoRotate, walkMode]);

  /* Estimate (memoised) — switches engine by mode */
  const estimate = useMemo(
    () => buildMode === "highrise" ? HighRiseEstimator.buildEstimate(hrSpec, region)
      : buildMode === "materials" ? MaterialsOnly.buildEstimate(matSpec, region)
      : Estimator.buildEstimate(spec, region),
    [spec, hrSpec, matSpec, buildMode, region]
  );

  /* Spec update helper */
  const update = useCallback((patch) => setSpec((s) => ({ ...s, ...patch })), []);
  const updateOpenings = useCallback((patch) =>
    setSpec((s) => ({ ...s, openings: { ...s.openings, ...patch } })), []);

  /* ---- Reset / clear helpers ----
     clearSection zeroes one card's fields; clearAll wipes the active engine. */
  const clearSection = useCallback((section) => {
    if (buildMode === "highrise") {
      setHrSpec((s) => ({ ...s, ...HR_SECTION_CLEAR[section] }));
      return;
    }
    if (section === "rooms") { setSpec((s) => ({ ...s, rooms: [] })); return; }
    if (section === "kitchens") { setSpec((s) => ({ ...s, kitchens: [] })); return; }
    if (section === "bathrooms") { setSpec((s) => ({ ...s, bathrooms: [] })); return; }
    setSpec((s) => ({ ...s, ...(RES_SECTION_CLEAR[section] || {}) }));
  }, [buildMode]);

  const clearAll = useCallback(() => {
    if (buildMode === "highrise") setHrSpec({ ...EMPTY_HR_SPEC });
    else setSpec({ ...EMPTY_SPEC });
  }, [buildMode]);

  const resetDefaults = useCallback(() => {
    if (buildMode === "highrise") setHrSpec({ ...DEFAULT_HR_SPEC });
    else setSpec({ ...DEFAULT_SPEC, rooms: DEFAULT_SPEC.rooms.map((r) => ({ ...r, id: nextId() })), kitchens: DEFAULT_SPEC.kitchens.map((k) => ({ ...k, id: nextId() })), bathrooms: DEFAULT_SPEC.bathrooms.map((b) => ({ ...b, id: nextId() })) });
  }, [buildMode]);

  /* Push imported takeoff lines into the estimator: clears everything first,
     sizes a representative 3D massing from the data, and infers settings. */
  const applyImport = useCallback((lines, sourceLabel) => {
    const inf = inferSpecFromImport(lines);
    setBuildMode("residential");
    setSpec({
      ...EMPTY_SPEC,
      widthM: inf.side, lengthM: inf.side, floors: 1, wallHeightM: 2.7, roofPitch: 20, slabThicknessM: 0.1,
      claddingType: inf.cladding, roofType: inf.roof, floorFinish: inf.floorFinish,
      staircaseType: inf.staircaseType, hasGarage: inf.hasGarage,
      openings: { windowsCount: 0, windowsM2: 0, doors: 1 },
      rooms: [], kitchens: [], bathrooms: [],
      importedLines: lines,
      importMeta: { source: sourceLabel || "import", lineCount: lines.length, gfa: inf.gfa, detected: inf.detected },
    });
    setTab("estimate");
  }, []);

  const clearImport = useCallback(() => {
    setSpec({ ...DEFAULT_SPEC, rooms: DEFAULT_SPEC.rooms.map((r) => ({ ...r, id: nextId() })), kitchens: DEFAULT_SPEC.kitchens.map((k) => ({ ...k, id: nextId() })), bathrooms: DEFAULT_SPEC.bathrooms.map((b) => ({ ...b, id: nextId() })) });
  }, []);

  /* Import as an editable template: seeds rooms/kitchens/bathrooms so the user
     can keep designing. No importedLines, so all cards are editable. */
  const applyImportTemplate = useCallback((lines, sourceLabel) => {
    setBuildMode("residential");
    setSpec(buildTemplateSpecFromImport(lines, sourceLabel));
    setTab("estimate");
  }, []);

  /* Convert an already-applied (locked) import into the editable template. */
  const unlockImport = useCallback(() => {
    setSpec((s) => (s.importedLines && s.importedLines.length
      ? buildTemplateSpecFromImport(s.importedLines, (s.importMeta && s.importMeta.source) || "import")
      : s));
  }, []);

  /* Materials-only: load imported lines as raw material entries (no build). */
  const applyMaterialsImport = useCallback((lines) => {
    const matLines = lines.map((l) => ({
      id: nextId(),
      kind: "material",
      materialId: l.materialId || null,
      label: l.label || (l.catalogueLabel || "Item"),
      qty: l.qty,
      unit: l.unit || "",
      fixedRate: (l.priceSource === "file" || l.priceSource === "manual") ? l.rate : null,
      fixedTotal: l.priceSource === "file" ? l.total : null,
    }));
    setMatSpec({ lines: matLines });
    setBuildMode("materials");
    setTab("estimate");
  }, []);

  /* Toggle interior walkthrough */
  const toggleWalk = () => {
    const eng = engineRef.current;
    if (!eng) return;
    if (eng.mode === "walk") {
      eng.stopWalk();
      setWalkMode(false);
    } else {
      const ok = eng.startWalk();
      if (!ok) { setWalkRoom("Add rooms to enable the walkthrough"); return; }
      setProgress(1);
      setWalkMode(true);
    }
  };

  /* Play construction animation */
  const playConstruction = () => {
    const eng = engineRef.current;
    if (!eng) return;
    eng.progress = 0;
    setProgress(0);
    eng.setProgress(0);
    eng.setPlaying(true);
    /* poll React state during play */
    const tick = () => {
      if (!eng.playing) {
        setProgress(eng.progress);
        return;
      }
      setProgress(eng.progress);
      requestAnimationFrame(tick);
    };
    requestAnimationFrame(tick);
  };

  /* Download report as .txt */
  const downloadReport = () => {
    const text = buildMode === "highrise"
      ? Reporter.buildHighRise(estimate, projectNo)
      : buildMode === "materials"
      ? Reporter.buildMaterials(estimate, projectNo)
      : Reporter.build(estimate, projectNo);
    const blob = new Blob([text], { type: "text/plain;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `${projectNo}_${buildMode}_estimate.txt`;
    document.body.appendChild(a); a.click(); document.body.removeChild(a);
    URL.revokeObjectURL(url);
  };

  const updateHr = useCallback((patch) => setHrSpec((s) => ({ ...s, ...patch })), []);
  const currency = currencySymbol(region);

  return (
    <div style={{ background: TOKENS.paper, minHeight: "100vh", color: TOKENS.ink, fontFamily: "'Inter', sans-serif" }}>
      {/* Inline style block for fonts + custom colors (Tailwind core only supports utility classes) */}
      <style>{`
        @import url('${FONT_URL}');
        :root {
          --paper: ${TOKENS.paper};
          --paper-light: ${TOKENS.paperLight};
          --card: ${TOKENS.card};
          --ink: ${TOKENS.ink};
          --ink-soft: ${TOKENS.inkSoft};
          --steel: ${TOKENS.steel};
          --rule: ${TOKENS.rule};
          --hivis: ${TOKENS.hivis};
          --hivis-deep: ${TOKENS.hivisDeep};
          --ember: ${TOKENS.ember};
          --ember-deep: ${TOKENS.emberDeep};
          --alert: ${TOKENS.alert};
          --ok: ${TOKENS.ok};
          --grid: ${TOKENS.grid};
        }
        html { scroll-behavior: smooth; }
        body { background: var(--paper); }
        .ec-display { font-family: 'Barlow Condensed', sans-serif; font-weight: 700; letter-spacing: 0.01em; }
        .ec-mono { font-family: 'JetBrains Mono', monospace; font-feature-settings: "tnum"; }
        .ec-eyebrow { font-family: 'JetBrains Mono', monospace; font-size: 10px; letter-spacing: 0.18em; text-transform: uppercase; color: var(--steel); }
        .ec-rule { border-top: 1px solid var(--rule); }
        .ec-rule-strong { border-top: 2px solid var(--ink); }
        .ec-paper {
          background-image:
            linear-gradient(var(--grid) 1px, transparent 1px),
            linear-gradient(90deg, var(--grid) 1px, transparent 1px);
          background-size: 24px 24px;
        }
        .ec-card {
          background: var(--card);
          border: 1px solid var(--rule);
          transition: border-color 0.18s, box-shadow 0.18s, transform 0.18s;
        }
        .ec-card:hover { border-color: var(--ink); }
        .ec-tag {
          display: inline-flex; align-items: center; gap: 6px;
          padding: 2px 8px;
          background: var(--ink); color: var(--paper);
          font-family: 'JetBrains Mono', monospace; font-size: 10px;
          letter-spacing: 0.12em; text-transform: uppercase;
        }
        .ec-tag-hivis { background: var(--hivis); color: var(--ink); }
        .ec-input, .ec-select {
          width: 100%;
          background: var(--paper-light);
          border: 1px solid var(--rule);
          padding: 9px 11px;
          font-family: 'JetBrains Mono', monospace;
          font-size: 13px;
          color: var(--ink);
          outline: none;
          transition: border-color 0.15s, background 0.15s;
        }
        .ec-input:hover, .ec-select:hover { background: var(--card); }
        .ec-input:focus, .ec-select:focus { border-color: var(--ink); background: var(--card); }
        .ec-label {
          font-family: 'JetBrains Mono', monospace;
          font-size: 10px;
          letter-spacing: 0.14em;
          text-transform: uppercase;
          color: var(--ink-soft);
          margin-bottom: 5px;
          display: block;
        }
        .ec-btn {
          display: inline-flex; align-items: center; gap: 6px;
          padding: 9px 16px;
          background: var(--ink); color: var(--paper);
          font-family: 'Barlow Condensed', sans-serif;
          font-weight: 600;
          font-size: 14px;
          letter-spacing: 0.08em;
          text-transform: uppercase;
          border: none;
          cursor: pointer;
          transition: background 0.18s, transform 0.18s;
        }
        .ec-btn:hover { background: #000; }
        .ec-btn:active { transform: translateY(1px); }
        .ec-btn-hivis { background: var(--hivis); color: var(--ink); }
        .ec-btn-hivis:hover { background: var(--hivis-deep); }
        .ec-btn-ghost { background: transparent; color: var(--ink); border: 1px solid var(--ink); }
        .ec-btn-ghost:hover { background: var(--ink); color: var(--paper); }
        .ec-tab { padding: 11px 18px; font-family: 'Barlow Condensed', sans-serif; font-weight: 600; font-size: 14px; letter-spacing: 0.08em; text-transform: uppercase; color: var(--steel); cursor: pointer; border-bottom: 2px solid transparent; transition: all 0.18s; white-space: nowrap; }
        .ec-tab:hover { color: var(--ink); }
        .ec-tab-active { color: var(--ink); border-bottom-color: var(--hivis); }
        .ec-link { color: var(--ink); text-decoration: underline; text-decoration-color: var(--hivis); text-decoration-thickness: 2px; text-underline-offset: 3px; }
        .ec-link:hover { text-decoration-color: var(--ink); }

        /* ===== HERO ===== */
        .ec-hero-canvas { position: absolute; inset: 0; width: 100%; height: 100%; display: block; }
        .ec-hero-vignette {
          position: absolute; inset: 0;
          background: radial-gradient(ellipse at center, transparent 30%, rgba(0,0,0,0.55) 100%);
          pointer-events: none;
        }
        .ec-hero-bottom-fade {
          position: absolute; left: 0; right: 0; bottom: 0; height: 30%;
          background: linear-gradient(to bottom, transparent, var(--paper));
          pointer-events: none;
        }
        @keyframes fade-in-down {
          from { opacity: 0; transform: translate3d(0, -20px, 0); }
          to   { opacity: 1; transform: translate3d(0, 0, 0); }
        }
        @keyframes fade-in-up {
          from { opacity: 0; transform: translate3d(0, 30px, 0); }
          to   { opacity: 1; transform: translate3d(0, 0, 0); }
        }
        @keyframes scroll-bob {
          0%, 100% { transform: translateY(0); opacity: 0.7; }
          50%      { transform: translateY(8px); opacity: 1; }
        }
        .ec-fade-down { animation: fade-in-down 0.9s cubic-bezier(0.16, 1, 0.3, 1) both; }
        .ec-fade-up   { animation: fade-in-up   0.9s cubic-bezier(0.16, 1, 0.3, 1) both; }
        .ec-delay-1 { animation-delay: 0.15s; }
        .ec-delay-2 { animation-delay: 0.30s; }
        .ec-delay-3 { animation-delay: 0.45s; }
        .ec-delay-4 { animation-delay: 0.60s; }
        .ec-scroll-bob { animation: scroll-bob 2s ease-in-out infinite; }

        /* Live blip */
        @keyframes blink { 50% { opacity: 0.3; } }
        .ec-live { animation: blink 1.4s infinite; }
        /* keyboard focus */
        button:focus-visible, input:focus-visible, select:focus-visible, a:focus-visible { outline: 2px solid var(--hivis); outline-offset: 2px; }
        @media (prefers-reduced-motion: reduce) {
          html { scroll-behavior: auto; }
          .ec-live, .ec-scroll-bob, .ec-fade-down, .ec-fade-up { animation: none !important; }
        }
      `}</style>

      {/* ============== HERO ============== */}
      <section style={{ position: "relative", width: "100%", height: "100vh", overflow: "hidden", background: "#000" }}>
        <canvas ref={shaderCanvasRef} className="ec-hero-canvas" style={{ touchAction: "none" }} />
        <div className="ec-hero-vignette" />
        <div className="ec-hero-bottom-fade" />

        {/* Top hero bar — minimal, transparent over shader */}
        <div style={{ position: "absolute", top: 0, left: 0, right: 0, zIndex: 20, padding: "20px 28px", display: "flex", alignItems: "center", justifyContent: "space-between", gap: 16, flexWrap: "wrap" }}>
          <div style={{ display: "flex", alignItems: "center", gap: 10 }} className="ec-fade-down">
            <BYOLogo size={34} />
            <div className="ec-display" style={{ fontSize: 18, color: "#fff", letterSpacing: "0.02em" }}>BUILD YOUR OWN</div>
          </div>
          <div className="ec-fade-down ec-delay-1" style={{ display: "flex", alignItems: "center", gap: 12 }}>
            <div className="ec-mono" style={{ fontSize: 10, letterSpacing: "0.16em", color: "rgba(255,255,255,0.7)" }}>REGION</div>
            <div style={{ display: "flex", border: "1px solid rgba(255,255,255,0.35)", borderRadius: 2, overflow: "hidden" }}>
              {["AU","US","UK"].map((r) => (
                <button key={r} onClick={() => setRegion(r)} className="ec-mono"
                  style={{
                    padding: "6px 11px",
                    background: region === r ? TOKENS.hivis : "transparent",
                    color: region === r ? TOKENS.ink : "rgba(255,255,255,0.9)",
                    border: "none", cursor: "pointer",
                    fontSize: 11, letterSpacing: "0.12em", fontWeight: 500,
                  }}>{r}</button>
              ))}
            </div>
          </div>
        </div>

        {/* Centered copy */}
        <div style={{ position: "absolute", inset: 0, zIndex: 10, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", padding: "0 24px", textAlign: "center" }}>
          {/* Trust badge */}
          <div className="ec-fade-down ec-delay-1" style={{ marginBottom: 28 }}>
            <div style={{
              display: "inline-flex", alignItems: "center", gap: 10,
              padding: "8px 18px",
              background: "rgba(245, 197, 24, 0.12)",
              border: "1px solid rgba(245, 197, 24, 0.45)",
              backdropFilter: "blur(8px)",
              WebkitBackdropFilter: "blur(8px)",
              borderRadius: 100,
              fontSize: 12, letterSpacing: "0.06em",
              color: "rgba(255, 230, 160, 0.95)",
              fontFamily: "'JetBrains Mono', monospace",
            }}>
              <span style={{ width: 6, height: 6, background: TOKENS.hivis, borderRadius: "50%", display: "inline-block" }} className="ec-live" />
              Built for trades · owner-builders · curious homeowners
            </div>
          </div>

          {/* Headline */}
          <h1 className="ec-display ec-fade-up ec-delay-2" style={{
            fontSize: "clamp(48px, 9vw, 132px)",
            lineHeight: 0.92,
            margin: 0,
            color: "#fff",
            letterSpacing: "-0.01em",
            maxWidth: 1100,
          }}>
            Build your own.
          </h1>
          <h1 className="ec-display ec-fade-up ec-delay-3" style={{
            fontSize: "clamp(48px, 9vw, 132px)",
            lineHeight: 0.92,
            margin: "0.06em 0 0",
            background: "linear-gradient(90deg, #FFE5A0 0%, #F5C518 40%, #F58E1A 70%, #D96E0A 100%)",
            WebkitBackgroundClip: "text",
            backgroundClip: "text",
            WebkitTextFillColor: "transparent",
            color: "transparent",
            letterSpacing: "-0.01em",
            maxWidth: 1100,
          }}>
            Know the cost.
          </h1>

          <p className="ec-fade-up ec-delay-4" style={{
            marginTop: 28, maxWidth: 720,
            fontSize: "clamp(15px, 1.4vw, 19px)",
            lineHeight: 1.55,
            color: "rgba(255, 240, 220, 0.85)",
            fontWeight: 400,
          }}>
            A live 3D estimator for homes and high-rises. Turn dimensions, materials, and site conditions into itemised costs, a construction programme, and direct supplier searches — before you ever break ground.
          </p>

          <div className="ec-fade-up ec-delay-4" style={{ marginTop: 36, display: "flex", gap: 12, flexWrap: "wrap", justifyContent: "center" }}>
            <button onClick={() => document.getElementById("tool")?.scrollIntoView({ behavior: "smooth" })}
              style={{
                padding: "14px 28px",
                background: "linear-gradient(90deg, #F5C518 0%, #F58E1A 100%)",
                color: TOKENS.ink,
                border: "none",
                borderRadius: 100,
                fontFamily: "'Barlow Condensed', sans-serif",
                fontWeight: 700,
                fontSize: 16,
                letterSpacing: "0.08em",
                textTransform: "uppercase",
                cursor: "pointer",
                boxShadow: "0 10px 30px -10px rgba(245, 142, 26, 0.6)",
                transition: "transform 0.2s, box-shadow 0.2s",
              }}
              onMouseEnter={(e) => { e.currentTarget.style.transform = "translateY(-2px)"; e.currentTarget.style.boxShadow = "0 14px 36px -8px rgba(245, 142, 26, 0.7)"; }}
              onMouseLeave={(e) => { e.currentTarget.style.transform = "translateY(0)"; e.currentTarget.style.boxShadow = "0 10px 30px -10px rgba(245, 142, 26, 0.6)"; }}>
              Start estimating →
            </button>
            <button onClick={() => document.getElementById("how")?.scrollIntoView({ behavior: "smooth" })}
              style={{
                padding: "14px 28px",
                background: "rgba(255,255,255,0.06)",
                color: "rgba(255,255,255,0.95)",
                border: "1px solid rgba(255,255,255,0.35)",
                borderRadius: 100,
                fontFamily: "'Barlow Condensed', sans-serif",
                fontWeight: 600,
                fontSize: 16,
                letterSpacing: "0.08em",
                textTransform: "uppercase",
                cursor: "pointer",
                backdropFilter: "blur(8px)",
                WebkitBackdropFilter: "blur(8px)",
                transition: "background 0.2s, border-color 0.2s",
              }}
              onMouseEnter={(e) => { e.currentTarget.style.background = "rgba(255,255,255,0.12)"; e.currentTarget.style.borderColor = "rgba(255,255,255,0.55)"; }}
              onMouseLeave={(e) => { e.currentTarget.style.background = "rgba(255,255,255,0.06)"; e.currentTarget.style.borderColor = "rgba(255,255,255,0.35)"; }}>
              How it works
            </button>
          </div>
        </div>

        {/* Scroll indicator */}
        <div style={{ position: "absolute", bottom: 32, left: "50%", transform: "translateX(-50%)", zIndex: 10, display: "flex", flexDirection: "column", alignItems: "center", gap: 8, pointerEvents: "none" }} className="ec-scroll-bob">
          <span className="ec-mono" style={{ fontSize: 10, letterSpacing: "0.2em", color: "rgba(255,255,255,0.6)" }}>SCROLL</span>
          <svg width="14" height="20" viewBox="0 0 14 20" fill="none" stroke="rgba(255,255,255,0.6)" strokeWidth="1.5">
            <path d="M7 2v14M2 11l5 5 5-5" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
        </div>
      </section>

      {/* ============== STICKY HEADER (appears after hero) ============== */}
      <header style={{
        position: "sticky", top: 0, zIndex: 30,
        borderBottom: `1px solid ${TOKENS.rule}`,
        background: "rgba(246, 247, 248, 0.92)",
        backdropFilter: "blur(10px)",
        WebkitBackdropFilter: "blur(10px)",
      }}>
        <div style={{ maxWidth: 1480, margin: "0 auto", padding: "12px 24px", display: "flex", alignItems: "center", justifyContent: "space-between", gap: 16, flexWrap: "wrap" }}>
          <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
            <BYOLogo size={28} />
            <div className="ec-display" style={{ fontSize: 16, color: TOKENS.ink, letterSpacing: "0.02em" }}>BUILD YOUR OWN</div>
          </div>
          <div style={{ display: "flex", alignItems: "center", gap: 14, flexWrap: "wrap" }}>
            <div style={{ display: "flex", border: `1px solid ${TOKENS.emberDeep}`, borderRadius: 2, overflow: "hidden" }}>
              {[["residential","Residential"],["highrise","High-rise"],["materials","Quote"]].map(([m, label]) => (
                <button key={m} onClick={() => { setBuildMode(m); setTab("estimate"); }}
                  className="ec-mono"
                  style={{
                    padding: "6px 12px",
                    background: buildMode === m ? TOKENS.emberDeep : "transparent",
                    color: buildMode === m ? "#fff" : TOKENS.emberDeep,
                    border: "none", cursor: "pointer",
                    fontSize: 10, letterSpacing: "0.1em", fontWeight: 700,
                  }}>{label}</button>
              ))}
            </div>
            <div className="ec-mono" style={{ fontSize: 10, color: TOKENS.inkSoft }}>
              <span style={{ color: TOKENS.steel, marginRight: 5 }}>PROJ</span>{projectNo}
            </div>
            <div style={{ display: "flex", border: `1px solid ${TOKENS.ink}` }}>
              {["AU","US","UK"].map((r) => (
                <button key={r} onClick={() => setRegion(r)}
                  className="ec-mono"
                  style={{
                    padding: "5px 10px",
                    background: region === r ? TOKENS.ink : "transparent",
                    color: region === r ? TOKENS.paper : TOKENS.ink,
                    border: "none", cursor: "pointer",
                    fontSize: 10, letterSpacing: "0.12em",
                  }}>{r}</button>
              ))}
            </div>
            <button className="ec-btn ec-btn-hivis" onClick={downloadReport}>
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><path d="M12 4v12m0 0l-5-5m5 5l5-5M4 20h16" /></svg>
              Download report
            </button>
          </div>
        </div>
      </header>

      {/* ============== HOW IT WORKS ============== */}
      <section id="how" style={{ padding: "96px 24px 64px", background: TOKENS.paper }}>
        <div style={{ maxWidth: 1200, margin: "0 auto" }}>
          <Reveal variant="fade-up">
            <div className="ec-eyebrow" style={{ marginBottom: 10 }}>How it works</div>
            <h2 className="ec-display" style={{ fontSize: "clamp(32px, 5vw, 56px)", lineHeight: 1, margin: 0, letterSpacing: "-0.01em", maxWidth: 800 }}>
              Four steps from <span style={{ color: TOKENS.emberDeep }}>idea</span> to a defendable number.
            </h2>
          </Reveal>
          <Reveal variant="fade-up" delay={0.1}>
            <p style={{ marginTop: 16, fontSize: 16, lineHeight: 1.6, color: TOKENS.inkSoft, maxWidth: 640 }}>
              No login, no upload, no waiting. Type in your dimensions and watch everything else compute live.
            </p>
          </Reveal>

          <div style={{ marginTop: 56, display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(240px, 1fr))", gap: 20 }}>
            {[
              { n: "01", title: "Configure", body: "Dimensions, floors, framing, cladding, roof, openings, site condition. Metric for now — toggle region for AU, US, or UK rates.", icon: "config" },
              { n: "02", title: "Watch it rise", body: "A 3D model rebuilds the moment you change a value. Hit play to scrub the construction sequence stage by stage.", icon: "build" },
              { n: "03", title: "See the numbers", body: "Itemised materials, trade-by-trade labour, equipment hire, builder build-up, and a programme in weeks. All live.", icon: "data" },
              { n: "04", title: "Take it further", body: "Search live prices at Bunnings, Reece, Home Depot, Wickes and more. Download a takeoff sheet for your records.", icon: "share" },
            ].map((s, i) => (
              <Reveal key={s.n} variant="fade-up" delay={0.15 + i * 0.08}>
                <div className="ec-card" style={{ padding: 24, height: "100%", display: "flex", flexDirection: "column", gap: 14, position: "relative", overflow: "hidden" }}>
                  <div className="ec-mono" style={{ fontSize: 11, letterSpacing: "0.18em", color: TOKENS.emberDeep, fontWeight: 700 }}>{s.n}</div>
                  <HowItWorksIcon kind={s.icon} />
                  <h3 className="ec-display" style={{ fontSize: 22, margin: 0, letterSpacing: "0.01em" }}>{s.title}</h3>
                  <p style={{ fontSize: 14, lineHeight: 1.55, color: TOKENS.inkSoft, margin: 0 }}>{s.body}</p>
                </div>
              </Reveal>
            ))}
          </div>
        </div>
      </section>

      {/* ============== MAIN GRID (estimator tool) ============== */}
      <main id="tool" style={{ maxWidth: 1480, margin: "0 auto", padding: "48px 24px 64px", display: "grid", gridTemplateColumns: "minmax(320px, 380px) 1fr", gap: 28 }} className="grid-responsive">
        <style>{`
          @media (max-width: 960px) {
            main.grid-responsive, main[style*="grid-template-columns"] { grid-template-columns: 1fr !important; }
          }
        `}</style>

        {/* ===== LEFT — INPUT PANEL ===== */}
        <section>
          <Reveal variant="slide-left">
            <div className="ec-eyebrow" style={{ marginBottom: 8 }}>01 — Configure</div>
            <h2 className="ec-display" style={{ fontSize: 28, lineHeight: 1, marginBottom: 12 }}>Building specification</h2>
            <div style={{ display: "flex", gap: 8, marginBottom: 16 }}>
              <button onClick={clearAll}
                className="ec-mono"
                style={{ flex: 1, padding: "8px 10px", border: `1px solid ${TOKENS.alert}`, background: "transparent", color: TOKENS.alert, cursor: "pointer", fontSize: 10, letterSpacing: "0.1em", textTransform: "uppercase" }}
                onMouseEnter={(e) => { e.currentTarget.style.background = TOKENS.alert; e.currentTarget.style.color = "#fff"; }}
                onMouseLeave={(e) => { e.currentTarget.style.background = "transparent"; e.currentTarget.style.color = TOKENS.alert; }}>
                ⨯ Clear all figures
              </button>
              <button onClick={resetDefaults}
                className="ec-mono"
                style={{ flex: 1, padding: "8px 10px", border: `1px solid ${TOKENS.ink}`, background: "transparent", color: TOKENS.ink, cursor: "pointer", fontSize: 10, letterSpacing: "0.1em", textTransform: "uppercase" }}
                onMouseEnter={(e) => { e.currentTarget.style.background = TOKENS.ink; e.currentTarget.style.color = "#fff"; }}
                onMouseLeave={(e) => { e.currentTarget.style.background = "transparent"; e.currentTarget.style.color = TOKENS.ink; }}>
                ↺ Reset to sample
              </button>
            </div>
          </Reveal>

          {buildMode === "materials" ? (
            <MaterialsPanel matSpec={matSpec} setMatSpec={setMatSpec} estimate={estimate} currency={currencySymbol(region)} />
          ) : buildMode === "highrise" ? (
            <HighRisePanel hrSpec={hrSpec} updateHr={updateHr} estimate={estimate} clearSection={clearSection} />
          ) : spec.importedLines && spec.importedLines.length > 0 ? (
            <ImportedPanel spec={spec} estimate={estimate} currency={currencySymbol(region)} onClear={clearImport} onUnlock={unlockImport} />
          ) : (
          <>
          <InputCard title="Dimensions" onClear={() => clearSection("dimensions")}>
            <InputRow>
              <Field label="Width (m)"><input className="ec-input" type="number" min="3" max="60" step="0.5" value={spec.widthM} onChange={(e) => update({ widthM: +e.target.value })} /></Field>
              <Field label="Length (m)"><input className="ec-input" type="number" min="3" max="60" step="0.5" value={spec.lengthM} onChange={(e) => update({ lengthM: +e.target.value })} /></Field>
            </InputRow>
            <InputRow>
              <Field label="Floors"><input className="ec-input" type="number" min="1" max="4" step="1" value={spec.floors} onChange={(e) => update({ floors: +e.target.value })} /></Field>
              <Field label="Wall height (m)"><input className="ec-input" type="number" min="2.4" max="4.0" step="0.1" value={spec.wallHeightM} onChange={(e) => update({ wallHeightM: +e.target.value })} /></Field>
            </InputRow>
            <InputRow>
              <Field label="Roof pitch (°)"><input className="ec-input" type="number" min="0" max="45" step="1" value={spec.roofPitch} onChange={(e) => update({ roofPitch: +e.target.value })} /></Field>
              <Field label="Slab thickness (m)"><input className="ec-input" type="number" min="0.08" max="0.3" step="0.01" value={spec.slabThicknessM} onChange={(e) => update({ slabThicknessM: +e.target.value })} /></Field>
            </InputRow>
          </InputCard>

          <InputCard title="Materials" onClear={() => clearSection("materials")}>
            <Field label="Framing">
              <select className="ec-select" value={spec.framingType} onChange={(e) => update({ framingType: e.target.value })}>
                <option value="timber">Timber (MGP10 / LVL)</option>
                <option value="steel">Light steel frame</option>
              </select>
            </Field>
            <Field label="Roof material">
              <select className="ec-select" value={spec.roofType} onChange={(e) => update({ roofType: e.target.value })}>
                <option value="colorbond">Colorbond steel sheet</option>
                <option value="tile">Concrete tile</option>
                <option value="shingle">Asphalt shingle</option>
              </select>
            </Field>
            <Field label="External cladding">
              <select className="ec-select" value={spec.claddingType} onChange={(e) => update({ claddingType: e.target.value })}>
                <option value="brick">Brick veneer</option>
                <option value="weatherboard">Weatherboard (fibre cement)</option>
                <option value="render">Acrylic render</option>
              </select>
            </Field>
            <Field label="Floor finish">
              <select className="ec-select" value={spec.floorFinish} onChange={(e) => update({ floorFinish: e.target.value })}>
                <option value="timber">Engineered timber</option>
                <option value="tile">Tile</option>
                <option value="carpet">Carpet</option>
              </select>
            </Field>
            <Field label="Staircase">
              <select className="ec-select" value={spec.staircaseType} onChange={(e) => update({ staircaseType: e.target.value })}>
                <option value="none">None (single storey)</option>
                <option value="timber">Timber flight + stringers</option>
                <option value="steel_glass">Steel + glass balustrade</option>
                <option value="concrete">Precast concrete</option>
              </select>
            </Field>
            {spec.staircaseType !== "none" && spec.floors < 2 && (
              <p className="ec-mono" style={{ fontSize: 10, color: TOKENS.alert, marginTop: 4, lineHeight: 1.4 }}>
                Set floors to 2+ for the staircase to appear in the model & estimate.
              </p>
            )}
          </InputCard>

          <InputCard title="Openings" onClear={() => clearSection("openings")}>
            <InputRow>
              <Field label="Windows (count)"><input className="ec-input" type="number" min="0" max="60" step="1" value={spec.openings.windowsCount} onChange={(e) => updateOpenings({ windowsCount: +e.target.value })} /></Field>
              <Field label="Window area (m²)"><input className="ec-input" type="number" min="0" max="200" step="0.5" value={spec.openings.windowsM2} onChange={(e) => updateOpenings({ windowsM2: +e.target.value })} /></Field>
            </InputRow>
            <InputRow>
              <Field label="External doors"><input className="ec-input" type="number" min="1" max="8" step="1" value={spec.openings.doors} onChange={(e) => updateOpenings({ doors: +e.target.value })} /></Field>
              <Field label=" "><div style={{ display: "flex", gap: 8 }}>
                <Toggle label="Garage" value={spec.hasGarage} onChange={(v) => update({ hasGarage: v })} />
                <Toggle label="Solar" value={spec.solar} onChange={(v) => update({ solar: v })} />
              </div></Field>
            </InputRow>
          </InputCard>

          <RoomScheduleCard spec={spec} setSpec={setSpec} />

          <KitchenCard spec={spec} setSpec={setSpec} />

          <BathroomCard spec={spec} setSpec={setSpec} />

          <InputCard title="Site conditions" onClear={() => clearSection("site")}>
            <Field label="Block type">
              <select className="ec-select" value={spec.siteCondition} onChange={(e) => update({ siteCondition: e.target.value })}>
                <option value="flat">Flat / good access</option>
                <option value="sloping">Sloping / battered</option>
                <option value="difficult">Difficult / reactive soil / restricted</option>
              </select>
            </Field>
            <p className="ec-mono" style={{ fontSize: 11, color: TOKENS.steel, marginTop: 8, lineHeight: 1.5 }}>
              Sloping sites add ~12% to labour, difficult sites add ~25%, reflecting earthworks, retaining, and crane access.
            </p>
          </InputCard>
          </>
          )}
        </section>

        {/* ===== RIGHT — VIEWPORT & RESULTS ===== */}
        <section>
          <Reveal variant="slide-right">
            <div className="ec-eyebrow" style={{ marginBottom: 8 }}>02 — Preview &amp; Estimate</div>
            <h2 className="ec-display" style={{ fontSize: 28, lineHeight: 1, marginBottom: 16 }}>Live model &amp; takeoff</h2>
          </Reveal>

          {/* 3D viewport */}
          <div className="ec-card ec-paper" style={{ position: "relative", padding: 0, height: 460, overflow: "hidden" }}>
            <div ref={viewportRef} style={{ position: "absolute", inset: 0 }} />
            {/* Dimension annotations overlay */}
            <div style={{ position: "absolute", top: 16, left: 16, display: "flex", flexDirection: "column", gap: 6, pointerEvents: "none" }}>
              <span className="ec-tag ec-tag-hivis">VIEWPORT</span>
              {buildMode === "materials" ? (
                <div className="ec-mono" style={{ fontSize: 11, background: "rgba(255,255,255,0.85)", padding: "4px 8px", color: TOKENS.ink }}>
                  Quote builder · no build model
                </div>
              ) : buildMode === "highrise" ? (
                <>
                  <div className="ec-mono" style={{ fontSize: 11, background: "rgba(255,255,255,0.85)", padding: "4px 8px", color: TOKENS.ink }}>
                    {hrSpec.floors} floors · {(estimate.takeoff?.totalHeightM || 0).toFixed(0)}m
                  </div>
                  <div className="ec-mono" style={{ fontSize: 11, background: "rgba(255,255,255,0.85)", padding: "4px 8px", color: TOKENS.ink }}>
                    GFA · {fmt(estimate.takeoff?.gfaM2 || 0)} m²
                  </div>
                </>
              ) : (
                <>
                  <div className="ec-mono" style={{ fontSize: 11, background: "rgba(255,255,255,0.85)", padding: "4px 8px", color: TOKENS.ink }}>
                    {spec.widthM}m × {spec.lengthM}m × {(spec.wallHeightM * spec.floors).toFixed(1)}m
                  </div>
                  <div className="ec-mono" style={{ fontSize: 11, background: "rgba(255,255,255,0.85)", padding: "4px 8px", color: TOKENS.ink }}>
                    GFA · {(estimate.takeoff?.gfaM2 || 0).toFixed(0)} m²
                  </div>
                </>
              )}
            </div>
            {/* Live indicator + current room (walk mode) */}
            <div style={{ position: "absolute", top: 16, right: 16, pointerEvents: "none", display: "flex", flexDirection: "column", alignItems: "flex-end", gap: 6 }}>
              <span className="ec-tag"><span className="ec-live" style={{ width: 6, height: 6, background: TOKENS.hivis, borderRadius: "50%", display: "inline-block" }} />{walkMode ? "WALKTHROUGH" : "LIVE"}</span>
              {walkMode && walkRoom && (
                <div className="ec-mono" style={{ fontSize: 12, background: TOKENS.ink, color: TOKENS.hivis, padding: "5px 10px", letterSpacing: "0.04em" }}>
                  ▸ {walkRoom}
                </div>
              )}
            </div>
            {/* Controls */}
            <div style={{ position: "absolute", bottom: 16, left: 16, right: 16, display: "flex", alignItems: "center", gap: 12, flexWrap: "wrap" }}>
              {buildMode === "materials" ? (
                <div className="ec-mono" style={{ fontSize: 11, color: TOKENS.steel, background: "rgba(255,255,255,0.9)", padding: "8px 12px", border: `1px solid ${TOKENS.rule}` }}>
                  Quote builder — material, labour & trades in one total
                </div>
              ) : !walkMode ? (
                <>
                  <button className="ec-btn ec-btn-hivis" onClick={playConstruction}>
                    <svg width="12" height="12" viewBox="0 0 24 24" fill="currentColor"><path d="M8 5v14l11-7z" /></svg>
                    Play construction
                  </button>
                  <div style={{ flex: 1, minWidth: 160, display: "flex", alignItems: "center", gap: 8, background: "rgba(255,255,255,0.9)", padding: "6px 10px", border: `1px solid ${TOKENS.rule}` }}>
                    <span className="ec-mono" style={{ fontSize: 10, color: TOKENS.steel, letterSpacing: "0.12em" }}>STAGE</span>
                    <input type="range" min="0" max="1" step="0.01" value={progress}
                      onChange={(e) => { setProgress(+e.target.value); engineRef.current?.setPlaying(false); }}
                      style={{ flex: 1, accentColor: TOKENS.ink }} />
                    <span className="ec-mono" style={{ fontSize: 11, color: TOKENS.ink, minWidth: 50, textAlign: "right" }}>
                      {stageLabel(progress)}
                    </span>
                  </div>
                  <button className="ec-btn" onClick={toggleWalk} style={{ background: TOKENS.emberDeep }}>
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="12" cy="4" r="2" fill="currentColor" stroke="none"/><path d="M12 7v6m0 0l-3 7m3-7l3 7M8 9h8" strokeLinecap="round"/></svg>
                    Walk through
                  </button>
                  <button className="ec-btn ec-btn-ghost" onClick={() => setAutoRotate((v) => !v)} style={{ background: autoRotate ? TOKENS.ink : "transparent", color: autoRotate ? TOKENS.paper : TOKENS.ink }}>
                    {autoRotate ? "Auto-rotate ON" : "Auto-rotate OFF"}
                  </button>
                </>
              ) : (
                <>
                  <button className="ec-btn ec-btn-hivis" onClick={toggleWalk}>
                    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><path d="M6 6l12 12M6 18L18 6" strokeLinecap="round"/></svg>
                    Exit walkthrough
                  </button>
                  <div style={{ flex: 1, minWidth: 160, display: "flex", alignItems: "center", gap: 8, background: "rgba(255,255,255,0.9)", padding: "6px 10px", border: `1px solid ${TOKENS.rule}` }}>
                    <span className="ec-mono" style={{ fontSize: 10, color: TOKENS.steel, letterSpacing: "0.12em" }}>TOUR</span>
                    <input type="range" min="0" max="1" step="0.005" value={walkT}
                      onChange={(e) => { engineRef.current?.setWalkT(+e.target.value); setWalkT(+e.target.value); }}
                      style={{ flex: 1, accentColor: TOKENS.emberDeep }} />
                    <span className="ec-mono" style={{ fontSize: 11, color: TOKENS.ink, minWidth: 40, textAlign: "right" }}>{Math.round(walkT * 100)}%</span>
                  </div>
                </>
              )}
            </div>
          </div>

          {/* Headline cost cards */}
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))", gap: 12, marginTop: 16 }}>
            <StaggerReveal variant="fade-up" stagger={0.06}>
              {buildMode === "materials" ? [
                <CostCard key="t" label="Quote total" value={`${currency}${fmt(estimate.total)}`} hivis sub={estimate.taxRate > 0 ? `+ ${currency}${fmt(estimate.total * estimate.taxRate)} ${estimate.taxLabel}` : "Excl. tax"} />,
                <CostCard key="m" label="Materials" value={`${currency}${fmt((estimate.byKind || {}).material || 0)}`} />,
                <CostCard key="l" label="Labour" value={`${currency}${fmt((estimate.byKind || {}).labour || 0)}`} />,
                <CostCard key="e" label="Trades & jobs" value={`${currency}${fmt((estimate.byKind || {}).element || 0)}`} sub={`${estimate.lines.length} lines`} />,
              ] : buildMode === "highrise" ? [
                <CostCard key="t" label="Total estimate" value={`${currency}${fmt(estimate.total)}`} hivis sub={estimate.taxRate > 0 ? `+ ${currency}${fmt(estimate.total * estimate.taxRate)} ${estimate.taxLabel}` : "Excl. tax"} />,
                <CostCard key="s" label="Systems (adj.)" value={`${currency}${fmt(estimate.systemsTotal)}`} />,
                <CostCard key="d" label="Design fees" value={`${currency}${fmt(estimate.designFees)}`} />,
                <CostCard key="g" label="GFA" value={`${fmt(estimate.takeoff.gfaM2)} m²`} sub={`${estimate.spec.floors} floors`} />,
                <CostCard key="p" label="Programme" value={`${estimate.timeline.totalWeeks} wks`} sub={`~${(estimate.timeline.totalWeeks / 52).toFixed(1)} yrs`} />,
                <CostCard key="r" label={`${currency}/m² GFA`} value={`${currency}${fmt(estimate.total / Math.max(1, estimate.takeoff.gfaM2))}`} />,
              ] : [
                <CostCard key="t" label="Total estimate" value={`${currency}${fmt(estimate.total)}`} hivis sub={estimate.taxRate > 0 ? `+ ${currency}${fmt(estimate.total * estimate.taxRate)} ${estimate.taxLabel}` : "Excl. tax"} />,
                <CostCard key="m" label="Materials" value={`${currency}${fmt(estimate.materialsTotal)}`} />,
                <CostCard key="l" label="Labour" value={`${currency}${fmt(estimate.labourTotal)}`} />,
                <CostCard key="e" label="Equipment" value={`${currency}${fmt(estimate.equipmentTotal)}`} />,
                <CostCard key="p" label="Programme" value={`${estimate.timeline.totalWeeks} wks`} sub={`~${(estimate.timeline.totalWeeks / 4.33).toFixed(1)} months`} />,
                <CostCard key="r" label={`${currency}/m² GFA`} value={`${currency}${fmt(estimate.total / Math.max(1, estimate.takeoff.gfaM2))}`} />,
              ]}
            </StaggerReveal>
          </div>

          {/* ===== TABS ===== */}
          <div className="ec-rule-strong" style={{ marginTop: 28 }} />
          <div style={{ display: "flex", gap: 0, overflowX: "auto", borderBottom: `1px solid ${TOKENS.rule}` }}>
            {(buildMode === "highrise"
              ? [{ id: "estimate", label: "Elemental cost plan" }, { id: "timeline", label: "Programme" }, { id: "codes", label: "Codes & compliance" }, { id: "suppliers", label: "Suppliers" }]
              : buildMode === "materials"
              ? [{ id: "estimate", label: "Quote breakdown" }, { id: "spreadsheet", label: "Import spreadsheet" }, { id: "suppliers", label: "Suppliers" }]
              : [{ id: "estimate", label: "Cost breakdown" }, { id: "timeline", label: "Programme" }, { id: "spreadsheet", label: "Import spreadsheet" }, { id: "sketchup", label: "Import SketchUp" }, { id: "codes", label: "Codes & compliance" }, { id: "suppliers", label: "Suppliers" }]
            ).map((t) => (
              <div key={t.id} className={"ec-tab" + (tab === t.id ? " ec-tab-active" : "")} onClick={() => setTab(t.id)}>{t.label}</div>
            ))}
          </div>

          <div style={{ marginTop: 20 }}>
            {tab === "estimate" && (buildMode === "highrise" ? <HighRiseEstimateTab estimate={estimate} currency={currency} /> : buildMode === "materials" ? <MaterialsEstimateTab estimate={estimate} currency={currency} /> : <EstimateTab estimate={estimate} currency={currency} />)}
            {tab === "timeline" && buildMode !== "materials" && (buildMode === "highrise" ? <HighRiseTimelineTab estimate={estimate} /> : <TimelineTab estimate={estimate} />)}
            {tab === "spreadsheet" && buildMode === "residential" && <SpreadsheetTab region={region} currency={currency} onApply={applyImport} onApplyTemplate={applyImportTemplate} />}
            {tab === "spreadsheet" && buildMode === "materials" && <SpreadsheetTab region={region} currency={currency} onApplyMaterials={applyMaterialsImport} materialsMode />}
            {tab === "sketchup" && buildMode === "residential" && <SketchUpTab region={region} currency={currency} onApply={applyImport} onApplyTemplate={applyImportTemplate} />}
            {tab === "codes" && buildMode !== "materials" && <CodesTab region={region} highrise={buildMode === "highrise"} />}
            {tab === "suppliers" && <SuppliersTab region={region} estimate={estimate} highrise={buildMode === "highrise"} />}
          </div>
        </section>
      </main>

      {/* Footer disclaimer */}
      <footer style={{ borderTop: `1px solid ${TOKENS.rule}`, marginTop: 48, padding: "20px 24px", background: TOKENS.paperLight }}>
        <div style={{ maxWidth: 1480, margin: "0 auto", display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: 24, flexWrap: "wrap" }}>
          <div style={{ maxWidth: 720 }}>
            <div className="ec-eyebrow" style={{ marginBottom: 6 }}>Disclaimer</div>
            <p style={{ fontSize: 12, lineHeight: 1.6, color: TOKENS.inkSoft, margin: 0 }}>
              All figures are <em>indicative estimates</em> generated from market-rate guides and the inputs above. Real costs vary by supplier, region, season, and scope. Use this as a planning tool — not a contract. Engage a licensed builder, quantity surveyor, and certifier before relying on these numbers.
            </p>
          </div>
          <div className="ec-mono" style={{ fontSize: 10, color: TOKENS.steel, letterSpacing: "0.12em" }}>
            BUILD YOUR OWN · 3D ESTIMATOR<br />
            REGION · {region} · REV A
          </div>
        </div>
      </footer>
    </div>
  );
}

/* =========================================================================
   UI subcomponents
   ========================================================================= */
/* ---- Room schedule (with built-in robes) ---- */
function RoomScheduleCard({ spec, setSpec }) {
  const rooms = spec.rooms || [];
  const setRooms = (next) => setSpec((s) => ({ ...s, rooms: next }));
  const updateRoom = (id, patch) => setRooms(rooms.map((r) => (r.id === id ? { ...r, ...patch } : r)));
  const addRoom = () => {
    const type = "Bedroom";
    setRooms([...rooms, { id: nextId(), name: `Room ${rooms.length + 1}`, type, widthM: 3.5, lengthM: 3.0, floorFinish: ROOM_DEFAULT_FINISH[type], robe: "none", robeLengthM: 0 }]);
  };
  const removeRoom = (id) => setRooms(rooms.filter((r) => r.id !== id));

  const totalArea = rooms.reduce((a, r) => a + (r.widthM || 0) * (r.lengthM || 0), 0);
  const robeLM = rooms.reduce((a, r) => a + (r.robe !== "none" ? (r.robeLengthM || 0) : 0), 0);

  return (
    <InputCard title="Room schedule" badge={`${rooms.length} rooms · ${totalArea.toFixed(0)} m²`} onClear={() => setRooms([])}>
      <p className="ec-mono" style={{ fontSize: 10, color: TOKENS.steel, marginBottom: 12, lineHeight: 1.5, letterSpacing: "0.02em" }}>
        Drives flooring, internal walls, doors & robes. {robeLM > 0 ? `${robeLM.toFixed(1)} lin.m of robes scheduled.` : ""}
      </p>
      <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
        {rooms.map((r) => (
          <div key={r.id} style={{ border: `1px solid ${TOKENS.rule}`, padding: 10, background: TOKENS.paperLight }}>
            <div style={{ display: "flex", gap: 8, marginBottom: 8 }}>
              <input className="ec-input" style={{ flex: 1 }} value={r.name} onChange={(e) => updateRoom(r.id, { name: e.target.value })} />
              <button onClick={() => removeRoom(r.id)} title="Remove room"
                style={{ width: 34, flexShrink: 0, border: `1px solid ${TOKENS.rule}`, background: TOKENS.card, color: TOKENS.alert, cursor: "pointer", fontFamily: "'JetBrains Mono', monospace", fontSize: 16 }}>×</button>
            </div>
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8, marginBottom: 8 }}>
              <select className="ec-select" value={r.type} onChange={(e) => updateRoom(r.id, { type: e.target.value, floorFinish: ROOM_DEFAULT_FINISH[e.target.value] || r.floorFinish })}>
                {ROOM_TYPES.map((t) => <option key={t} value={t}>{t}</option>)}
              </select>
              <select className="ec-select" value={r.floorFinish} onChange={(e) => updateRoom(r.id, { floorFinish: e.target.value })}>
                <option value="timber">Timber floor</option>
                <option value="tile">Tile floor</option>
                <option value="carpet">Carpet floor</option>
              </select>
            </div>
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8, marginBottom: 8 }}>
              <label><span className="ec-label">Width (m)</span><input className="ec-input" type="number" min="0.5" max="20" step="0.1" value={r.widthM} onChange={(e) => updateRoom(r.id, { widthM: +e.target.value })} /></label>
              <label><span className="ec-label">Length (m)</span><input className="ec-input" type="number" min="0.5" max="20" step="0.1" value={r.lengthM} onChange={(e) => updateRoom(r.id, { lengthM: +e.target.value })} /></label>
            </div>
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8 }}>
              <label><span className="ec-label">Built-in robe</span>
                <select className="ec-select" value={r.robe} onChange={(e) => updateRoom(r.id, { robe: e.target.value, robeLengthM: e.target.value === "none" ? 0 : (r.robeLengthM || 2.4) })}>
                  <option value="none">None</option>
                  <option value="built_in">Sliding BIR</option>
                  <option value="hinged">Hinged BIR</option>
                  <option value="walk_in">Walk-in</option>
                </select>
              </label>
              <label><span className="ec-label">Robe length (m)</span>
                <input className="ec-input" type="number" min="0" max="12" step="0.1" value={r.robeLengthM} disabled={r.robe === "none"}
                  style={{ opacity: r.robe === "none" ? 0.4 : 1 }}
                  onChange={(e) => updateRoom(r.id, { robeLengthM: +e.target.value })} />
              </label>
            </div>
          </div>
        ))}
      </div>
      <button className="ec-btn ec-btn-ghost" style={{ marginTop: 12, width: "100%", justifyContent: "center" }} onClick={addRoom}>+ Add room</button>
    </InputCard>
  );
}

/* ---- Kitchen estimating ---- */
function KitchenCard({ spec, setSpec }) {
  const kitchens = spec.kitchens || [];
  const setKitchens = (next) => setSpec((s) => ({ ...s, kitchens: next }));
  const updateKit = (id, patch) => setKitchens(kitchens.map((k) => (k.id === id ? { ...k, ...patch } : k)));
  const addKit = () => setKitchens([...kitchens, { id: nextId(), benchLengthM: 5, cabinetry: "flatpack", benchtop: "laminate", splashback: "tile", appliances: "basic", island: false, sinkTap: true }]);
  const removeKit = (id) => setKitchens(kitchens.filter((k) => k.id !== id));

  return (
    <InputCard title="Kitchens" badge={`${kitchens.length}`} onClear={() => setKitchens([])}>
      <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
        {kitchens.map((k, i) => (
          <div key={k.id} style={{ border: `1px solid ${TOKENS.rule}`, padding: 10, background: TOKENS.paperLight }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 8 }}>
              <span className="ec-mono" style={{ fontSize: 11, letterSpacing: "0.1em", color: TOKENS.emberDeep, fontWeight: 700 }}>KITCHEN {i + 1}</span>
              {kitchens.length > 0 && <button onClick={() => removeKit(k.id)} style={{ width: 28, height: 24, border: `1px solid ${TOKENS.rule}`, background: TOKENS.card, color: TOKENS.alert, cursor: "pointer", fontSize: 15 }}>×</button>}
            </div>
            <label style={{ display: "block", marginBottom: 8 }}><span className="ec-label">Bench run total (lin.m)</span>
              <input className="ec-input" type="number" min="1" max="30" step="0.5" value={k.benchLengthM} onChange={(e) => updateKit(k.id, { benchLengthM: +e.target.value })} /></label>
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8, marginBottom: 8 }}>
              <label><span className="ec-label">Cabinetry</span>
                <select className="ec-select" value={k.cabinetry} onChange={(e) => updateKit(k.id, { cabinetry: e.target.value })}>
                  <option value="flatpack">Flat-pack</option>
                  <option value="custom">Custom joinery</option>
                </select></label>
              <label><span className="ec-label">Benchtop</span>
                <select className="ec-select" value={k.benchtop} onChange={(e) => updateKit(k.id, { benchtop: e.target.value })}>
                  <option value="laminate">Laminate</option>
                  <option value="stone">Engineered stone</option>
                  <option value="natural">Natural stone</option>
                  <option value="timber">Solid timber</option>
                </select></label>
            </div>
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8, marginBottom: 8 }}>
              <label><span className="ec-label">Splashback</span>
                <select className="ec-select" value={k.splashback} onChange={(e) => updateKit(k.id, { splashback: e.target.value })}>
                  <option value="tile">Tiled</option>
                  <option value="glass">Glass</option>
                  <option value="stone">Stone slab</option>
                </select></label>
              <label><span className="ec-label">Appliances</span>
                <select className="ec-select" value={k.appliances} onChange={(e) => updateKit(k.id, { appliances: e.target.value })}>
                  <option value="basic">Basic</option>
                  <option value="mid">Mid-range</option>
                  <option value="premium">Premium</option>
                </select></label>
            </div>
            <div style={{ display: "flex", gap: 8 }}>
              <Toggle label="Island" value={k.island} onChange={(v) => updateKit(k.id, { island: v })} />
              <Toggle label="Sink + tap" value={k.sinkTap} onChange={(v) => updateKit(k.id, { sinkTap: v })} />
            </div>
          </div>
        ))}
      </div>
      <button className="ec-btn ec-btn-ghost" style={{ marginTop: 12, width: "100%", justifyContent: "center" }} onClick={addKit}>+ Add kitchen</button>
    </InputCard>
  );
}

/* ---- Bathroom estimating ---- */
function BathroomCard({ spec, setSpec }) {
  const bathrooms = spec.bathrooms || [];
  const setBaths = (next) => setSpec((s) => ({ ...s, bathrooms: next }));
  const updateBath = (id, patch) => setBaths(bathrooms.map((b) => (b.id === id ? { ...b, ...patch } : b)));
  const addBath = () => setBaths([...bathrooms, { id: nextId(), label: `Bathroom ${bathrooms.length + 1}`, widthM: 2.4, lengthM: 2.0, hasBath: false, hasShower: true, vanityCount: 1, toiletCount: 1, wallTileFullHeight: false }]);
  const removeBath = (id) => setBaths(bathrooms.filter((b) => b.id !== id));

  return (
    <InputCard title="Bathrooms" badge={`${bathrooms.length}`} onClear={() => setBaths([])}>
      <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
        {bathrooms.map((b) => (
          <div key={b.id} style={{ border: `1px solid ${TOKENS.rule}`, padding: 10, background: TOKENS.paperLight }}>
            <div style={{ display: "flex", gap: 8, marginBottom: 8 }}>
              <input className="ec-input" style={{ flex: 1 }} value={b.label} onChange={(e) => updateBath(b.id, { label: e.target.value })} />
              <button onClick={() => removeBath(b.id)} style={{ width: 34, flexShrink: 0, border: `1px solid ${TOKENS.rule}`, background: TOKENS.card, color: TOKENS.alert, cursor: "pointer", fontSize: 16 }}>×</button>
            </div>
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8, marginBottom: 8 }}>
              <label><span className="ec-label">Width (m)</span><input className="ec-input" type="number" min="0.8" max="8" step="0.1" value={b.widthM} onChange={(e) => updateBath(b.id, { widthM: +e.target.value })} /></label>
              <label><span className="ec-label">Length (m)</span><input className="ec-input" type="number" min="0.8" max="8" step="0.1" value={b.lengthM} onChange={(e) => updateBath(b.id, { lengthM: +e.target.value })} /></label>
            </div>
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8, marginBottom: 8 }}>
              <label><span className="ec-label">Vanities</span><input className="ec-input" type="number" min="0" max="3" step="1" value={b.vanityCount} onChange={(e) => updateBath(b.id, { vanityCount: +e.target.value })} /></label>
              <label><span className="ec-label">Toilets</span><input className="ec-input" type="number" min="0" max="2" step="1" value={b.toiletCount} onChange={(e) => updateBath(b.id, { toiletCount: +e.target.value })} /></label>
            </div>
            <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
              <Toggle label="Shower" value={b.hasShower} onChange={(v) => updateBath(b.id, { hasShower: v })} />
              <Toggle label="Bath" value={b.hasBath} onChange={(v) => updateBath(b.id, { hasBath: v })} />
              <Toggle label="Full-height tile" value={b.wallTileFullHeight} onChange={(v) => updateBath(b.id, { wallTileFullHeight: v })} />
            </div>
          </div>
        ))}
      </div>
      <button className="ec-btn ec-btn-ghost" style={{ marginTop: 12, width: "100%", justifyContent: "center" }} onClick={addBath}>+ Add bathroom</button>
    </InputCard>
  );
}

function BYOLogo({ size = 34, dark = false }) {
  // "BYO" monogram in a hi-vis tile — the stacked bars evoke building floors
  return (
    <div style={{ width: size, height: size, background: TOKENS.hivis, display: "flex", alignItems: "center", justifyContent: "center", borderRadius: 2, flexShrink: 0 }}>
      <span className="ec-display" style={{ fontSize: size * 0.42, lineHeight: 1, color: TOKENS.ink, letterSpacing: "-0.02em", fontWeight: 800 }}>BYO</span>
    </div>
  );
}

function HowItWorksIcon({ kind }) {
  const common = { width: 30, height: 30, viewBox: "0 0 24 24", fill: "none", stroke: TOKENS.ink, strokeWidth: 1.6, strokeLinecap: "round", strokeLinejoin: "round" };
  const paths = {
    config: <><path d="M3 6h18M3 12h18M3 18h18" /><circle cx="8" cy="6" r="2" fill={TOKENS.hivis} /><circle cx="15" cy="12" r="2" fill={TOKENS.hivis} /><circle cx="10" cy="18" r="2" fill={TOKENS.hivis} /></>,
    build: <><path d="M3 21V8l9-5 9 5v13M9 21v-7h6v7" /></>,
    data: <><path d="M4 20V10M10 20V4M16 20v-7M22 20H2" /></>,
    share: <><circle cx="6" cy="12" r="2.4" /><circle cx="18" cy="6" r="2.4" /><circle cx="18" cy="18" r="2.4" /><path d="M8.1 11l7.8-4M8.1 13l7.8 4" /></>,
  };
  return <svg {...common}>{paths[kind] || paths.config}</svg>;
}

function InputCard({ title, badge, children, onClear }) {
  return (
    <div style={{ background: TOKENS.card, border: `1px solid ${TOKENS.rule}`, padding: 16, marginBottom: 12 }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 12, paddingBottom: 8, borderBottom: `1px solid ${TOKENS.rule}` }}>
        <h3 className="ec-display" style={{ fontSize: 16, letterSpacing: "0.04em", textTransform: "uppercase", margin: 0 }}>{title}</h3>
        <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
          {badge != null && <span className="ec-mono" style={{ fontSize: 10, letterSpacing: "0.1em", color: TOKENS.steel }}>{badge}</span>}
          {onClear && (
            <button onClick={onClear} title={`Clear ${title}`}
              className="ec-mono"
              style={{ fontSize: 9, letterSpacing: "0.1em", padding: "3px 8px", border: `1px solid ${TOKENS.rule}`, background: "transparent", color: TOKENS.steel, cursor: "pointer", textTransform: "uppercase" }}
              onMouseEnter={(e) => { e.currentTarget.style.borderColor = TOKENS.alert; e.currentTarget.style.color = TOKENS.alert; }}
              onMouseLeave={(e) => { e.currentTarget.style.borderColor = TOKENS.rule; e.currentTarget.style.color = TOKENS.steel; }}>
              Clear
            </button>
          )}
        </div>
      </div>
      {children}
    </div>
  );
}

function InputRow({ children }) {
  return <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10, marginBottom: 10 }}>{children}</div>;
}

function Field({ label, children }) {
  return (
    <label style={{ display: "block", marginBottom: 8 }}>
      <span className="ec-label">{label}</span>
      {children}
    </label>
  );
}

function Toggle({ label, value, onChange }) {
  return (
    <button onClick={() => onChange(!value)}
      style={{
        flex: 1, padding: "8px 10px", border: `1px solid ${value ? TOKENS.ink : TOKENS.rule}`,
        background: value ? TOKENS.ink : TOKENS.paperLight,
        color: value ? TOKENS.paper : TOKENS.ink,
        fontFamily: "'JetBrains Mono', monospace", fontSize: 11, letterSpacing: "0.1em",
        textTransform: "uppercase", cursor: "pointer",
      }}>
      {value ? "✓ " : ""}{label}
    </button>
  );
}

function CostCard({ label, value, sub, hivis }) {
  return (
    <div style={{
      background: hivis ? TOKENS.hivis : TOKENS.card,
      border: `1px solid ${hivis ? TOKENS.hivis : TOKENS.rule}`,
      padding: "14px 16px",
      position: "relative",
    }}>
      <div className="ec-eyebrow" style={{ marginBottom: 8 }}>{label}</div>
      <div className="ec-display" style={{ fontSize: 26, lineHeight: 1, color: TOKENS.ink }}>{value}</div>
      {sub && <div className="ec-mono" style={{ fontSize: 10, color: TOKENS.inkSoft, marginTop: 6 }}>{sub}</div>}
    </div>
  );
}

function stageLabel(p) {
  if (p < 0.05) return "SITE";
  if (p < 0.2) return "FOUNDATION";
  if (p < 0.4) return "FRAME";
  if (p < 0.6) return "WALLS";
  if (p < 0.8) return "ROOF";
  if (p < 0.99) return "FINISHES";
  return "COMPLETE";
}

/* ---- Cost breakdown tab ---- */
/* ---- High-rise input panel ---- */
/* ---- Unified quote builder: material + labour + trades in one list ---- */
function MaterialsPanel({ matSpec, setMatSpec, estimate, currency }) {
  const lines = matSpec.lines || [];
  const setLines = (next) => setMatSpec({ lines: next });
  const updateLine = (id, patch) => setLines(lines.map((l) => (l.id === id ? { ...l, ...patch } : l)));
  const removeLine = (id) => setLines(lines.filter((l) => l.id !== id));
  const clearLines = () => setLines([]);

  const addMaterial = () => { const m = Materials.catalog[0]; setLines([...lines, { id: nextId(), kind: "material", materialId: m.id, label: m.label, qty: 1, unit: m.unit }]); };
  const addLabour = () => { const l = LabourRates.catalog[0]; setLines([...lines, { id: nextId(), kind: "labour", labourId: l.id, label: l.label, qty: 1, unit: l.unit }]); };
  const addElement = () => setLines([...lines, { id: nextId(), kind: "element", label: "", qty: 1, unit: "item", fixedRate: 0 }]);

  const matCats = useMemo(() => {
    const g = {};
    for (const m of Materials.catalog) { (g[m.category] = g[m.category] || []).push(m); }
    return g;
  }, []);

  const calcLine = (l) => {
    if (l.fixedTotal != null && isFinite(l.fixedTotal) && !l.qty) return { rate: l.fixedRate || 0, total: +l.fixedTotal || 0 };
    if (l.fixedRate != null && isFinite(l.fixedRate)) return { rate: +l.fixedRate, total: (+l.fixedRate) * (+l.qty || 0) };
    if (l.kind === "labour" && l.labourId) { const r = LabourRates.rate(l.labourId, estimate.region); return { rate: r, total: r * (+l.qty || 0) }; }
    if (l.materialId) { const r = Materials.rate(l.materialId, estimate.region); return { rate: r, total: r * (+l.qty || 0) }; }
    return { rate: 0, total: +l.fixedTotal || 0 };
  };

  const kindMeta = {
    material: { tag: "MAT", color: TOKENS.hivisDeep },
    labour: { tag: "LAB", color: TOKENS.emberDeep },
    element: { tag: "JOB", color: TOKENS.steel },
  };

  const renderLine = (l) => {
    const kind = l.kind || "material";
    const meta = kindMeta[kind];
    const calc = calcLine(l);
    const usesCatalogue = (kind === "material" && l.materialId) || (kind === "labour" && l.labourId);
    return (
      <div key={l.id} style={{ border: `1px solid ${TOKENS.rule}`, borderLeft: `3px solid ${meta.color}`, padding: 8, background: TOKENS.paperLight }}>
        {/* row 1: tag + name/select + delete */}
        <div style={{ display: "grid", gridTemplateColumns: "auto 1fr auto", gap: 6, alignItems: "center", marginBottom: 6 }}>
          <span className="ec-mono" style={{ fontSize: 9, fontWeight: 700, letterSpacing: "0.08em", color: meta.color, border: `1px solid ${meta.color}`, padding: "2px 4px", borderRadius: 2 }}>{meta.tag}</span>
          {kind === "material" ? (
            <select className="ec-select" style={{ minWidth: 0 }} value={l.materialId || ""} onChange={(e) => { const m = Materials.get(e.target.value); updateLine(l.id, { materialId: e.target.value, label: m.label, unit: m.unit, fixedRate: null, fixedTotal: null }); }}>
              {Object.entries(matCats).map(([cat, items]) => (
                <optgroup key={cat} label={cat}>{items.map((m) => <option key={m.id} value={m.id}>{m.label}</option>)}</optgroup>
              ))}
            </select>
          ) : kind === "labour" ? (
            <select className="ec-select" style={{ minWidth: 0 }} value={l.labourId || ""} onChange={(e) => { const lr = LabourRates.get(e.target.value); updateLine(l.id, { labourId: e.target.value, label: lr.label, unit: lr.unit, fixedRate: null, fixedTotal: null }); }}>
              {LabourRates.catalog.map((lr) => <option key={lr.id} value={lr.id}>{lr.label}</option>)}
            </select>
          ) : (
            <input className="ec-input" style={{ minWidth: 0 }} placeholder="Describe the job / trade / allowance" value={l.label || ""} onChange={(e) => updateLine(l.id, { label: e.target.value })} />
          )}
          <button onClick={() => removeLine(l.id)} title="Delete line" style={{ width: 26, height: 26, flexShrink: 0, border: `1px solid ${TOKENS.rule}`, background: TOKENS.card, color: TOKENS.alert, cursor: "pointer", fontSize: 14, lineHeight: 1, borderRadius: 2 }}>×</button>
        </div>
        {/* row 2: qty | unit | rate | total — fixed grid, never overlaps */}
        <div style={{ display: "grid", gridTemplateColumns: "1fr 0.8fr 1fr 1.1fr", gap: 5, alignItems: "center" }}>
          <label style={{ display: "block" }}>
            <span className="ec-mono" style={{ fontSize: 8, color: TOKENS.steel, letterSpacing: "0.1em" }}>QTY</span>
            <input className="ec-input" style={{ width: "100%", padding: "4px 5px" }} type="number" min="0" step="0.5" value={l.qty ?? ""} onChange={(e) => updateLine(l.id, { qty: e.target.value === "" ? null : +e.target.value })} />
          </label>
          <label style={{ display: "block" }}>
            <span className="ec-mono" style={{ fontSize: 8, color: TOKENS.steel, letterSpacing: "0.1em" }}>UNIT</span>
            <input className="ec-input" style={{ width: "100%", padding: "4px 5px" }} value={l.unit || ""} onChange={(e) => updateLine(l.id, { unit: e.target.value })} />
          </label>
          <label style={{ display: "block" }}>
            <span className="ec-mono" style={{ fontSize: 8, color: TOKENS.steel, letterSpacing: "0.1em" }}>RATE {currency}</span>
            {usesCatalogue && (l.fixedRate == null) ? (
              <div className="ec-mono" style={{ padding: "5px 5px", fontSize: 12, color: TOKENS.inkSoft, background: TOKENS.card, border: `1px solid ${TOKENS.rule}`, borderRadius: 2, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{fmt(calc.rate)}</div>
            ) : (
              <input className="ec-input" style={{ width: "100%", padding: "4px 5px" }} type="number" min="0" step="1" value={l.fixedRate ?? ""} placeholder={fmt(calc.rate)} onChange={(e) => updateLine(l.id, { fixedRate: e.target.value === "" ? null : +e.target.value, fixedTotal: null })} />
            )}
          </label>
          <label style={{ display: "block" }}>
            <span className="ec-mono" style={{ fontSize: 8, color: TOKENS.steel, letterSpacing: "0.1em" }}>TOTAL</span>
            <div className="ec-mono" style={{ padding: "5px 5px", fontSize: 12, fontWeight: 700, color: TOKENS.ink, textAlign: "right", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{currency}{fmt(calc.total)}</div>
          </label>
        </div>
      </div>
    );
  };

  const bk = estimate.byKind || {};
  return (
    <>
      <div style={{ padding: 12, border: `1px solid ${TOKENS.emberDeep}`, background: "rgba(245,142,26,0.06)", marginBottom: 12 }}>
        <div className="ec-mono" style={{ fontSize: 10, letterSpacing: "0.14em", color: TOKENS.emberDeep, fontWeight: 700, marginBottom: 4 }}>QUOTE BUILDER — MATERIAL · LABOUR · TRADES</div>
        <p style={{ fontSize: 12, color: TOKENS.inkSoft, margin: 0, lineHeight: 1.5 }}>
          One quote, every line. Add materials, labour days, or any job/trade/allowance — all priced into a single total. Catalogue lines auto-price; type your own rate on anything.
        </p>
      </div>

      <InputCard title="Quote lines" badge={`${currency}${fmt(estimate.total)}`} onClear={clearLines}>
        <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
          {lines.length === 0 && <div className="ec-mono" style={{ fontSize: 11, color: TOKENS.steel, padding: "8px 0" }}>Empty quote — add a line below or import a sheet.</div>}
          {lines.map(renderLine)}
        </div>
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 6, marginTop: 12 }}>
          <button className="ec-btn ec-btn-ghost" style={{ justifyContent: "center", padding: "8px 6px", fontSize: 11 }} onClick={addMaterial}>+ Material</button>
          <button className="ec-btn ec-btn-ghost" style={{ justifyContent: "center", padding: "8px 6px", fontSize: 11 }} onClick={addLabour}>+ Labour</button>
          <button className="ec-btn" style={{ justifyContent: "center", padding: "8px 6px", fontSize: 11, background: TOKENS.emberDeep }} onClick={addElement}>+ Job/Trade</button>
        </div>
      </InputCard>

      <div style={{ padding: 14, border: `2px solid ${TOKENS.ink}`, background: TOKENS.card }}>
        <div className="ec-eyebrow" style={{ marginBottom: 8 }}>Quote total</div>
        <div className="ec-display" style={{ fontSize: 30, lineHeight: 1, color: TOKENS.ink }}>{currency}{fmt(estimate.total)}</div>
        <div style={{ display: "flex", flexDirection: "column", gap: 3, marginTop: 10 }}>
          {[["material", "Materials"], ["labour", "Labour"], ["element", "Trades & jobs"]].map(([k, lbl]) => (
            (bk[k] > 0) ? (
              <div key={k} className="ec-mono" style={{ display: "flex", justifyContent: "space-between", fontSize: 11, color: TOKENS.inkSoft }}>
                <span>{lbl}</span><span>{currency}{fmt(bk[k])}</span>
              </div>
            ) : null
          ))}
          {estimate.taxRate > 0 && (
            <div className="ec-mono" style={{ display: "flex", justifyContent: "space-between", fontSize: 11, color: TOKENS.steel, marginTop: 4, paddingTop: 4, borderTop: `1px dashed ${TOKENS.rule}` }}>
              <span>+ {estimate.taxLabel}</span><span>{currency}{fmt(estimate.total * estimate.taxRate)}</span>
            </div>
          )}
        </div>
      </div>
    </>
  );
}

/* ---- Materials-only cost breakdown (with order quantities) ---- */
function MaterialsEstimateTab({ estimate, currency }) {
  const grouped = useMemo(() => {
    const g = {};
    for (const l of estimate.lines) { (g[l.category] = g[l.category] || []).push(l); }
    return g;
  }, [estimate]);

  if (estimate.lines.length === 0) {
    return <div className="ec-mono" style={{ fontSize: 13, color: TOKENS.steel, padding: 20, textAlign: "center", border: `1px dashed ${TOKENS.rule}` }}>Add materials on the left, or import a spreadsheet, to see the supply cost.</div>;
  }

  return (
    <div>
      <SectionHeader index="M" title="Quote breakdown — material, labour & trades" />
      {Object.entries(grouped).map(([cat, lines]) => (
        <div key={cat} style={{ marginBottom: 16 }}>
          <div className="ec-mono" style={{ fontSize: 11, letterSpacing: "0.16em", textTransform: "uppercase", color: TOKENS.hivisDeep, marginBottom: 6, fontWeight: 700 }}>{cat}</div>
          <div className="ec-mono" style={{ fontSize: 12 }}>
            <div style={{ display: "grid", gridTemplateColumns: "1.6fr 0.9fr 1.1fr 0.9fr", padding: "6px 0", fontSize: 10, letterSpacing: "0.12em", color: TOKENS.steel, borderBottom: `1px solid ${TOKENS.rule}` }}>
              <span>MATERIAL</span><span style={{ textAlign: "right" }}>QTY</span><span style={{ textAlign: "right" }}>ORDER (waste)</span><span style={{ textAlign: "right" }}>COST</span>
            </div>
            {lines.map((l, i) => (
              <div key={i} style={{ display: "grid", gridTemplateColumns: "1.6fr 0.9fr 1.1fr 0.9fr", padding: "7px 0", borderBottom: `1px dashed ${TOKENS.rule}`, alignItems: "baseline" }}>
                <span style={{ color: TOKENS.ink }}>{l.label}</span>
                <span style={{ textAlign: "right", color: TOKENS.inkSoft }}>{l.qty} {l.unit}</span>
                <span style={{ textAlign: "right", color: TOKENS.ink }}>
                  {l.alloc ? `${fmt(l.alloc.orderQty)} ${l.alloc.buyUnit}` : <span style={{ color: TOKENS.steel }}>—</span>}
                  {l.alloc && <span style={{ color: TOKENS.hivisDeep, fontSize: 10 }}> +{Math.round(l.alloc.wastePct * 100)}%</span>}
                </span>
                <span style={{ textAlign: "right", color: TOKENS.ink, fontWeight: 500 }}>{currency}{fmt(l.total)}</span>
              </div>
            ))}
          </div>
        </div>
      ))}
      <div className="ec-mono" style={{ display: "flex", justifyContent: "space-between", padding: "10px 0", borderTop: `2px solid ${TOKENS.ink}`, fontSize: 14, fontWeight: 700 }}>
        <span>MATERIALS TOTAL (SUPPLY ONLY)</span><span>{currency}{fmt(estimate.materialsTotal)}</span>
      </div>
      {estimate.taxRate > 0 && (
        <div className="ec-mono" style={{ display: "flex", justifyContent: "space-between", padding: "6px 0", fontSize: 12, color: TOKENS.inkSoft }}>
          <span>+ {estimate.taxLabel}</span><span>{currency}{fmt(estimate.materialsTotal * estimate.taxRate)}</span>
        </div>
      )}
    </div>
  );
}

function ImportedPanel({ spec, estimate, currency, onClear, onUnlock }) {
  const meta = spec.importMeta || {};
  const grouped = useMemo(() => {
    const g = {};
    for (const l of estimate.materialLines) { (g[l.category] = g[l.category] || []).push(l); }
    return g;
  }, [estimate]);
  return (
    <>
      <div style={{ padding: 14, border: `2px solid ${TOKENS.emberDeep}`, background: "rgba(245,142,26,0.06)", marginBottom: 12 }}>
        <div className="ec-mono" style={{ fontSize: 10, letterSpacing: "0.14em", color: TOKENS.emberDeep, fontWeight: 700, marginBottom: 6 }}>IMPORTED TAKEOFF — DRIVING ESTIMATE</div>
        <div className="ec-display" style={{ fontSize: 18, lineHeight: 1.1, marginBottom: 6 }}>{meta.source || "Imported data"}</div>
        <div className="ec-mono" style={{ fontSize: 11, color: TOKENS.inkSoft, lineHeight: 1.6 }}>
          {meta.lineCount} line items · materials {currency}{fmt(estimate.materialsTotal)}<br />
          Representative GFA ≈ {fmt(meta.gfa)} m² (sized for the 3D model)
        </div>
        <button className="ec-btn" style={{ marginTop: 12, width: "100%", justifyContent: "center", background: TOKENS.emberDeep }} onClick={onUnlock}>
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" style={{ marginRight: 4 }}><path d="M12 20h9M3 17l9-9 4 4-9 9H3v-4z" strokeLinecap="round" strokeLinejoin="round" /></svg>
          Unlock &amp; edit as template
        </button>
        <button className="ec-btn ec-btn-ghost" style={{ marginTop: 8, width: "100%", justifyContent: "center" }} onClick={onClear}>
          ↺ Clear import &amp; return to manual
        </button>
      </div>

      {meta.detected && meta.detected.length > 0 && (
        <InputCard title="Detected elements">
          <div className="ec-mono" style={{ fontSize: 12 }}>
            {meta.detected.map((d, i) => (
              <div key={i} style={{ display: "flex", justifyContent: "space-between", padding: "5px 0", borderBottom: `1px dashed ${TOKENS.rule}` }}>
                <span style={{ color: TOKENS.ink }}>{d.label}</span>
                <span style={{ color: TOKENS.inkSoft }}>{fmt(d.qty)} {d.unit}</span>
              </div>
            ))}
          </div>
        </InputCard>
      )}

      <InputCard title="Imported line items" badge={`${estimate.materialLines.length}`}>
        <div className="ec-mono" style={{ fontSize: 11 }}>
          {Object.entries(grouped).map(([cat, lines]) => (
            <div key={cat} style={{ marginBottom: 10 }}>
              <div style={{ fontSize: 10, letterSpacing: "0.14em", textTransform: "uppercase", color: TOKENS.hivisDeep, fontWeight: 700, marginBottom: 4 }}>{cat}</div>
              {lines.map((l, i) => (
                <div key={i} style={{ display: "flex", justifyContent: "space-between", padding: "3px 0", color: TOKENS.inkSoft }}>
                  <span>{l.label}</span><span>{currency}{fmt(l.total)}</span>
                </div>
              ))}
            </div>
          ))}
        </div>
      </InputCard>
    </>
  );
}

function HighRisePanel({ hrSpec, updateHr, estimate, clearSection }) {
  const t = estimate.takeoff;
  return (
    <>
      <div style={{ padding: 12, border: `1px solid ${TOKENS.emberDeep}`, background: "rgba(245,142,26,0.06)", marginBottom: 12 }}>
        <div className="ec-mono" style={{ fontSize: 10, letterSpacing: "0.14em", color: TOKENS.emberDeep, fontWeight: 700, marginBottom: 4 }}>HIGH-RISE / COMMERCIAL ENGINE</div>
        <p style={{ fontSize: 12, color: TOKENS.inkSoft, margin: 0, lineHeight: 1.5 }}>
          Costed by structural & façade systems per m² GFA, with a per-floor structural cycle. Feasibility-grade — not a tender figure.
        </p>
      </div>

      <InputCard title="Massing" badge={`${fmt(t.gfaM2)} m² GFA`} onClear={() => clearSection("massing")}>
        <InputRow>
          <Field label="Floor plate (m²)"><input className="ec-input" type="number" min="300" max="5000" step="50" value={hrSpec.floorPlateM2} onChange={(e) => updateHr({ floorPlateM2: +e.target.value })} /></Field>
          <Field label="Floors (above ground)"><input className="ec-input" type="number" min="5" max="120" step="1" value={hrSpec.floors} onChange={(e) => updateHr({ floors: +e.target.value })} /></Field>
        </InputRow>
        <InputRow>
          <Field label="Floor-to-floor (m)"><input className="ec-input" type="number" min="3.0" max="6.0" step="0.1" value={hrSpec.floorHeightM} onChange={(e) => updateHr({ floorHeightM: +e.target.value })} /></Field>
          <Field label="Basement levels"><input className="ec-input" type="number" min="0" max="8" step="1" value={hrSpec.basementLevels} onChange={(e) => updateHr({ basementLevels: +e.target.value })} /></Field>
        </InputRow>
        <p className="ec-mono" style={{ fontSize: 10, color: TOKENS.steel, marginTop: 4 }}>
          Overall height ≈ {t.totalHeightM.toFixed(0)} m{t.totalHeightM > 25 ? " · Type A construction (NCC) / high-rise (IBC)" : ""}
        </p>
      </InputCard>

      <InputCard title="Structure & façade" onClear={() => clearSection("structure")}>
        <Field label="Structural system">
          <select className="ec-select" value={hrSpec.structureType} onChange={(e) => updateHr({ structureType: e.target.value })}>
            <option value="rc">RC core + PT slabs</option>
            <option value="composite">Composite steel / concrete</option>
            <option value="steel">Structural steel frame</option>
          </select>
        </Field>
        <Field label="Façade system">
          <select className="ec-select" value={hrSpec.facadeType} onChange={(e) => updateHr({ facadeType: e.target.value })}>
            <option value="curtain_wall">Unitised curtain wall</option>
            <option value="window_wall">Window-wall</option>
            <option value="precast">Precast concrete panels</option>
          </select>
        </Field>
        <Field label="Occupancy">
          <select className="ec-select" value={hrSpec.occupancy} onChange={(e) => updateHr({ occupancy: e.target.value })}>
            <option value="office">Commercial office</option>
            <option value="residential">Residential apartments</option>
            <option value="mixed">Mixed use</option>
          </select>
        </Field>
        <p className="ec-mono" style={{ fontSize: 10, color: TOKENS.steel, marginTop: 4 }}>Façade area ≈ {fmt(t.facadeArea)} m²</p>
      </InputCard>

      <InputCard title="Vertical transport" onClear={() => clearSection("transport")}>
        <InputRow>
          <Field label="Passenger lifts"><input className="ec-input" type="number" min="1" max="40" step="1" value={hrSpec.passengerLifts} onChange={(e) => updateHr({ passengerLifts: +e.target.value })} /></Field>
          <Field label="Goods lifts"><input className="ec-input" type="number" min="0" max="10" step="1" value={hrSpec.goodsLifts} onChange={(e) => updateHr({ goodsLifts: +e.target.value })} /></Field>
        </InputRow>
        <Toggle label="Escalators (podium)" value={hrSpec.hasEscalators} onChange={(v) => updateHr({ hasEscalators: v })} />
      </InputCard>

      <InputCard title="Site conditions" onClear={() => clearSection("site")}>
        <Field label="Site type">
          <select className="ec-select" value={hrSpec.siteCondition} onChange={(e) => updateHr({ siteCondition: e.target.value })}>
            <option value="flat">Flat / good access</option>
            <option value="sloping">Constrained urban site</option>
            <option value="difficult">Difficult / deep services</option>
          </select>
        </Field>
        <p className="ec-mono" style={{ fontSize: 11, color: TOKENS.steel, marginTop: 8, lineHeight: 1.5 }}>
          {t.fireStairs} fire-isolated egress stairs required for this plate.
        </p>
      </InputCard>
    </>
  );
}

/* ---- High-rise elemental cost plan ---- */
function HighRiseEstimateTab({ estimate, currency }) {
  const grouped = useMemo(() => {
    const g = {};
    for (const l of estimate.systemLines) { (g[l.category] = g[l.category] || []).push(l); }
    return g;
  }, [estimate]);
  const catLabels = { substructure: "Substructure", superstructure: "Superstructure", facade: "Façade", transport: "Vertical transport", services: "Building services (MEP)", fire: "Fire & life safety", fitout: "Base-building fit-out" };
  return (
    <div>
      <SectionHeader index="A" title="Elemental cost plan" />
      {Object.entries(grouped).map(([cat, lines]) => (
        <div key={cat} style={{ marginBottom: 18 }}>
          <div className="ec-mono" style={{ fontSize: 11, letterSpacing: "0.16em", textTransform: "uppercase", color: TOKENS.hivisDeep, marginBottom: 6, fontWeight: 700 }}>{catLabels[cat] || cat}</div>
          <TakeoffTable rows={lines.map((l) => ({ label: l.label, qty: `${fmt(l.qty)} ${l.unit}`, rate: `${currency}${fmt(l.rate)}`, total: `${currency}${fmt(l.total)}` }))} />
        </div>
      ))}
      <div style={{ marginTop: 12, background: TOKENS.card, border: `2px solid ${TOKENS.ink}`, padding: 16 }}>
        <SectionHeader index="B" title="Cost build-up" />
        <div className="ec-mono" style={{ fontSize: 13 }}>
          {[["Systems subtotal (adj.)", estimate.systemsTotal], ["Preliminaries (12%)", estimate.prelims], ["Design & consultant fees (10%)", estimate.designFees], ["Builder margin (10%)", estimate.margin], ["Contingency (8%)", estimate.contingency]].map(([label, val]) => (
            <div key={label} style={{ display: "flex", justifyContent: "space-between", padding: "6px 0", borderBottom: `1px dashed ${TOKENS.rule}` }}>
              <span>{label}</span><span>{currency}{fmt(val)}</span>
            </div>
          ))}
          <div style={{ display: "flex", justifyContent: "space-between", padding: "10px 16px", marginTop: 4, marginLeft: -16, marginRight: -16, marginBottom: -16, fontSize: 18, fontWeight: 700, background: TOKENS.hivis }}>
            <span>TOTAL ESTIMATE</span><span>{currency}{fmt(estimate.total)}</span>
          </div>
        </div>
      </div>
    </div>
  );
}

/* ---- High-rise programme ---- */
function HighRiseTimelineTab({ estimate }) {
  const { timeline } = estimate;
  const maxWeek = timeline.totalWeeks;
  return (
    <div>
      <SectionHeader index="C" title="Indicative programme" />
      <div className="ec-mono" style={{ fontSize: 12, color: TOKENS.steel, marginBottom: 16, letterSpacing: "0.06em" }}>
        TOTAL · {timeline.totalWeeks} WEEKS · ~{(timeline.totalWeeks / 52).toFixed(1)} YEARS
      </div>
      <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
        {timeline.stages.map((s, i) => {
          const leftPct = ((s.startWeek - 1) / maxWeek) * 100;
          const widthPct = (s.weeks / maxWeek) * 100;
          return (
            <div key={i} style={{ display: "grid", gridTemplateColumns: "1.4fr 2.5fr 70px", alignItems: "center", gap: 12 }}>
              <div className="ec-mono" style={{ fontSize: 11, color: TOKENS.ink }}>
                <span style={{ color: TOKENS.steel, marginRight: 6 }}>{String(i + 1).padStart(2, "0")}</span>{s.name}
              </div>
              <div style={{ position: "relative", height: 22, background: TOKENS.paperLight, border: `1px solid ${TOKENS.rule}` }}>
                <div style={{ position: "absolute", top: 0, bottom: 0, left: `${leftPct}%`, width: `${widthPct}%`, background: TOKENS.emberDeep, borderRight: `2px solid ${TOKENS.ink}` }} />
              </div>
              <div className="ec-mono" style={{ fontSize: 11, color: TOKENS.inkSoft, textAlign: "right" }}>{s.weeks} wk</div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

function EstimateTab({ estimate, currency }) {
  const groupedMaterials = useMemo(() => {
    const groups = {};
    for (const l of estimate.materialLines) {
      groups[l.category] = groups[l.category] || [];
      groups[l.category].push(l);
    }
    return groups;
  }, [estimate]);

  return (
    <div>
      <SectionHeader index="A" title="Materials — itemised takeoff" />
      <div style={{ overflowX: "auto" }}>
        {Object.entries(groupedMaterials).map(([cat, lines]) => (
          <div key={cat} style={{ marginBottom: 18 }}>
            <div className="ec-mono" style={{ fontSize: 11, letterSpacing: "0.16em", textTransform: "uppercase", color: TOKENS.hivisDeep, marginBottom: 6, fontWeight: 700 }}>
              {cat}
            </div>
            <TakeoffTable rows={lines.map((l) => ({ label: l.label, qty: `${l.qty} ${l.unit}`, rate: `${currency}${fmt(l.rate)}`, total: `${currency}${fmt(l.total)}` }))} />
          </div>
        ))}
      </div>
      <div className="ec-mono" style={{ display: "flex", justifyContent: "space-between", padding: "10px 0", borderTop: `2px solid ${TOKENS.ink}`, fontSize: 14, fontWeight: 700 }}>
        <span>MATERIALS SUBTOTAL</span><span>{currency}{fmt(estimate.materialsTotal)}</span>
      </div>

      <div style={{ marginTop: 28 }}>
        <SectionHeader index="B" title="Labour — by trade" />
        <TakeoffTable rows={estimate.labourLines.map((l) => ({ label: l.trade, qty: "", rate: "", total: `${currency}${fmt(l.total)}` }))} />
        <div className="ec-mono" style={{ display: "flex", justifyContent: "space-between", padding: "10px 0", borderTop: `2px solid ${TOKENS.ink}`, fontSize: 14, fontWeight: 700 }}>
          <span>LABOUR SUBTOTAL</span><span>{currency}{fmt(estimate.labourTotal)}</span>
        </div>
      </div>

      <div style={{ marginTop: 28 }}>
        <SectionHeader index="C" title="Equipment & plant" />
        <TakeoffTable rows={estimate.equipmentLines.map((l) => ({ label: l.name, qty: `${l.qty} ${l.unit}`, rate: `${currency}${fmt(l.rate)}`, total: `${currency}${fmt(l.total)}` }))} />
        <div className="ec-mono" style={{ display: "flex", justifyContent: "space-between", padding: "10px 0", borderTop: `2px solid ${TOKENS.ink}`, fontSize: 14, fontWeight: 700 }}>
          <span>EQUIPMENT SUBTOTAL</span><span>{currency}{fmt(estimate.equipmentTotal)}</span>
        </div>
      </div>

      <div style={{ marginTop: 28, background: TOKENS.card, border: `2px solid ${TOKENS.ink}`, padding: 16 }}>
        <SectionHeader index="D" title="Builder build-up" />
        <div className="ec-mono" style={{ fontSize: 13 }}>
          {[
            ["Direct costs subtotal", estimate.subtotal],
            ["Preliminaries (8%)", estimate.prelims],
            ["Builder margin (15%)", estimate.margin],
            ["Contingency (7%)", estimate.contingency],
          ].map(([label, val]) => (
            <div key={label} style={{ display: "flex", justifyContent: "space-between", padding: "6px 0", borderBottom: `1px dashed ${TOKENS.rule}` }}>
              <span>{label}</span><span>{currency}{fmt(val)}</span>
            </div>
          ))}
          <div style={{ display: "flex", justifyContent: "space-between", padding: "10px 0", marginTop: 4, fontSize: 18, fontWeight: 700, color: TOKENS.ink, background: TOKENS.hivis, marginLeft: -16, marginRight: -16, paddingLeft: 16, paddingRight: 16, marginBottom: -16 }}>
            <span>TOTAL ESTIMATE</span><span>{currency}{fmt(estimate.total)}</span>
          </div>
        </div>
      </div>
    </div>
  );
}

function SectionHeader({ index, title }) {
  return (
    <div style={{ display: "flex", alignItems: "baseline", gap: 12, marginBottom: 12 }}>
      <span className="ec-mono" style={{ fontSize: 22, color: TOKENS.hivis, fontWeight: 700 }}>{index}</span>
      <h3 className="ec-display" style={{ fontSize: 18, letterSpacing: "0.04em", textTransform: "uppercase", margin: 0 }}>{title}</h3>
      <div style={{ flex: 1, borderTop: `1px solid ${TOKENS.rule}` }} />
    </div>
  );
}

function TakeoffTable({ rows }) {
  return (
    <div className="ec-mono" style={{ fontSize: 12 }}>
      <div style={{ display: "grid", gridTemplateColumns: "1fr 100px 100px 110px", padding: "6px 0", fontSize: 10, letterSpacing: "0.14em", color: TOKENS.steel, borderBottom: `1px solid ${TOKENS.rule}` }}>
        <span>ITEM</span><span style={{ textAlign: "right" }}>QTY</span><span style={{ textAlign: "right" }}>RATE</span><span style={{ textAlign: "right" }}>TOTAL</span>
      </div>
      {rows.map((r, i) => (
        <div key={i} style={{ display: "grid", gridTemplateColumns: "1fr 100px 100px 110px", padding: "6px 0", borderBottom: `1px dashed ${TOKENS.rule}`, alignItems: "baseline" }}>
          <span style={{ color: TOKENS.ink }}>{r.label}</span>
          <span style={{ textAlign: "right", color: TOKENS.inkSoft }}>{r.qty}</span>
          <span style={{ textAlign: "right", color: TOKENS.inkSoft }}>{r.rate}</span>
          <span style={{ textAlign: "right", color: TOKENS.ink, fontWeight: 500 }}>{r.total}</span>
        </div>
      ))}
    </div>
  );
}

/* ---- Timeline tab ---- */
function TimelineTab({ estimate }) {
  const { timeline } = estimate;
  const maxWeek = timeline.totalWeeks;
  return (
    <div>
      <SectionHeader index="E" title="Construction programme" />
      <div className="ec-mono" style={{ fontSize: 12, color: TOKENS.steel, marginBottom: 16, letterSpacing: "0.06em" }}>
        TOTAL · {timeline.totalWeeks} WEEKS  ·  ~{(timeline.totalWeeks / 4.33).toFixed(1)} MONTHS
      </div>
      <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
        {timeline.stages.map((s, i) => {
          const leftPct = ((s.startWeek - 1) / maxWeek) * 100;
          const widthPct = (s.weeks / maxWeek) * 100;
          return (
            <div key={i} style={{ display: "grid", gridTemplateColumns: "1fr 2.5fr 70px", alignItems: "center", gap: 12 }}>
              <div className="ec-mono" style={{ fontSize: 11, color: TOKENS.ink }}>
                <span style={{ color: TOKENS.steel, marginRight: 6 }}>{String(i + 1).padStart(2, "0")}</span>{s.name}
              </div>
              <div style={{ position: "relative", height: 22, background: TOKENS.paperLight, border: `1px solid ${TOKENS.rule}` }}>
                <div style={{
                  position: "absolute", top: 0, bottom: 0,
                  left: `${leftPct}%`, width: `${widthPct}%`,
                  background: TOKENS.hivis,
                  borderRight: `2px solid ${TOKENS.ink}`,
                }} />
                <div style={{
                  position: "absolute", top: 2, left: `calc(${leftPct}% + 6px)`,
                  fontFamily: "'JetBrains Mono', monospace", fontSize: 10, color: TOKENS.ink, fontWeight: 600,
                }}>
                  W{s.startWeek}–{s.endWeek}
                </div>
              </div>
              <div className="ec-mono" style={{ fontSize: 11, color: TOKENS.inkSoft, textAlign: "right" }}>{s.weeks} wk</div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

/* ---- Codes tab ---- */
function CodesTab({ region, highrise }) {
  const code = highrise ? HighRiseCodes[region] : BuildingCodes[region];
  const leg = Legislation[region];
  const [juris, setJuris] = useState(0);
  const j = leg.jurisdictions[juris] || leg.jurisdictions[0];
  return (
    <div>
      <SectionHeader index="F" title="Code & compliance reference" />
      <div className="ec-card" style={{ padding: 16, marginBottom: 16, background: TOKENS.paperLight }}>
        <div className="ec-eyebrow" style={{ marginBottom: 6 }}>Authority</div>
        <div className="ec-display" style={{ fontSize: 20, lineHeight: 1.2, marginBottom: 4 }}>{code.name}</div>
        <div className="ec-mono" style={{ fontSize: 12, color: TOKENS.inkSoft, marginBottom: 8 }}>{code.authority}</div>
        <a href={code.url} target="_blank" rel="noopener noreferrer" className="ec-link ec-mono" style={{ fontSize: 12 }}>
          Open authoritative source ↗
        </a>
      </div>

      <div className="ec-mono" style={{ fontSize: 11, color: TOKENS.steel, marginBottom: 12, letterSpacing: "0.12em" }}>
        KEY PROVISIONS RELEVANT TO YOUR DESIGN
      </div>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(280px, 1fr))", gap: 12 }}>
        {code.sections.map((s, i) => (
          <div key={i} className="ec-card" style={{ padding: 14 }}>
            <div className="ec-display" style={{ fontSize: 14, letterSpacing: "0.02em", marginBottom: 6 }}>{s.topic}</div>
            <p style={{ fontSize: 13, lineHeight: 1.5, color: TOKENS.inkSoft, margin: "0 0 8px" }}>{s.detail}</p>
            <div className="ec-mono" style={{ fontSize: 10, letterSpacing: "0.1em", color: TOKENS.hivisDeep, fontWeight: 700 }}>REF · {s.ref}</div>
          </div>
        ))}
      </div>

      {/* ---- Legislation directory (official Acts + regulators) ---- */}
      <div style={{ marginTop: 28 }}>
        <div className="ec-mono" style={{ fontSize: 11, color: TOKENS.steel, marginBottom: 4, letterSpacing: "0.12em" }}>
          GOVERNING LEGISLATION &amp; REGULATOR
        </div>
        <p style={{ fontSize: 12, color: TOKENS.inkSoft, margin: "0 0 12px", lineHeight: 1.5, maxWidth: 720 }}>
          {leg.national.note} Select your jurisdiction for the Act that applies and the regulator who administers it.
        </p>

        {/* national / model code card */}
        <div className="ec-card" style={{ padding: 14, marginBottom: 12, borderLeft: `3px solid ${TOKENS.hivisDeep}` }}>
          <div className="ec-display" style={{ fontSize: 15, marginBottom: 2 }}>{leg.national.name}</div>
          <div className="ec-mono" style={{ fontSize: 11, color: TOKENS.inkSoft, marginBottom: 8 }}>{leg.national.body}</div>
          <a href={leg.national.url} target="_blank" rel="noopener noreferrer" className="ec-link ec-mono" style={{ fontSize: 11 }}>Open official source ↗</a>
        </div>

        {/* jurisdiction selector */}
        <div style={{ display: "flex", flexWrap: "wrap", gap: 6, marginBottom: 12 }}>
          {leg.jurisdictions.map((jj, i) => (
            <button key={jj.code} onClick={() => setJuris(i)} className="ec-mono"
              style={{ padding: "6px 10px", fontSize: 10, letterSpacing: "0.08em", fontWeight: 700, cursor: "pointer",
                border: `1px solid ${juris === i ? TOKENS.ink : TOKENS.rule}`,
                background: juris === i ? TOKENS.ink : "transparent",
                color: juris === i ? TOKENS.paper : TOKENS.ink }}>
              {jj.code}
            </button>
          ))}
        </div>

        {/* selected jurisdiction detail */}
        <div className="ec-card" style={{ padding: 16, borderLeft: `3px solid ${TOKENS.emberDeep}` }}>
          <div className="ec-eyebrow" style={{ marginBottom: 4 }}>{j.name}</div>
          <div className="ec-display" style={{ fontSize: 16, lineHeight: 1.25, marginBottom: 6 }}>{j.act}</div>
          <div className="ec-mono" style={{ fontSize: 12, color: TOKENS.inkSoft, marginBottom: 12 }}>Regulator: {j.regulator}</div>
          <div style={{ display: "flex", flexWrap: "wrap", gap: 10 }}>
            <a href={j.actUrl} target="_blank" rel="noopener noreferrer" className="ec-btn ec-btn-hivis" style={{ fontSize: 11 }}>Read the Act ↗</a>
            {j.qbccActUrl && <a href={j.qbccActUrl} target="_blank" rel="noopener noreferrer" className="ec-btn ec-btn-ghost" style={{ fontSize: 11 }}>QBCC Act ↗</a>}
            <a href={j.regulatorUrl} target="_blank" rel="noopener noreferrer" className="ec-btn ec-btn-ghost" style={{ fontSize: 11 }}>Regulator ↗</a>
          </div>
        </div>
      </div>

      <div style={{ marginTop: 20, padding: 14, border: `1px dashed ${TOKENS.alert}`, background: "rgba(200,72,14,0.04)" }}>
        <div className="ec-mono" style={{ fontSize: 10, letterSpacing: "0.14em", color: TOKENS.alert, fontWeight: 700, marginBottom: 4 }}>NOTE</div>
        <p style={{ fontSize: 12, lineHeight: 1.5, color: TOKENS.inkSoft, margin: 0 }}>
          This is a curated summary with links to the official, current legislation — not a reproduction of the law, which is updated by each authority. Always verify with your certifier or building control authority before construction.
        </p>
      </div>
    </div>
  );
}

/* ---- Suppliers tab ---- */
/* ---- SketchUp import tab ---- */
/* ---- Spreadsheet import tab: read -> review -> allocate -> estimate ---- */
function SpreadsheetTab({ region, currency, onApply, onApplyTemplate, onApplyMaterials, materialsMode }) {
  const [stage, setStage] = useState(1);            // 1 upload, 2 map cols, 3 review, 4 allocate
  const [headers, setHeaders] = useState([]);
  const [rows, setRows] = useState([]);
  const [mapping, setMapping] = useState({ material: -1, quantity: -1, unit: -1 });
  const [result, setResult] = useState(null);
  const [error, setError] = useState("");
  const [fileName, setFileName] = useState("");
  const fileRef = useRef(null);

  const parseWorkbook = (data, name, isText) => {
    try {
      const wb = isText ? XLSX.read(data, { type: "string" }) : XLSX.read(data, { type: "array" });
      const sheet = wb.Sheets[wb.SheetNames[0]];
      const aoa = XLSX.utils.sheet_to_json(sheet, { header: 1, blankrows: false });
      if (!aoa.length) { setError("That sheet looks empty."); return; }
      // find the real header row (real quotes often have a title/blank rows above the table)
      const hr = SpreadsheetImport.findHeaderRow(aoa);
      const hdr = aoa[hr.index] || aoa[0];
      const body = aoa.slice(hr.index + 1);
      const detected = SpreadsheetImport.detectColumns(hdr);
      setHeaders(hdr); setRows(body); setMapping(detected);
      setFileName(name); setError(""); setResult(null);
      const canEstimate = detected.material >= 0 && (detected.quantity >= 0 || detected.rate >= 0 || detected.total >= 0);
      setStage(canEstimate ? 3 : 2);
      if (canEstimate) runEstimate(body, detected);
    } catch (e) { setError("Couldn't read that file. Is it a valid .xlsx or .csv?"); }
  };

  const onFile = (e) => {
    const f = e.target.files?.[0];
    if (!f) return;
    const reader = new FileReader();
    const isCsv = /\.csv$/i.test(f.name);
    reader.onload = () => parseWorkbook(isCsv ? reader.result : new Uint8Array(reader.result), f.name, isCsv);
    reader.onerror = () => setError("Could not read that file.");
    if (isCsv) reader.readAsText(f); else reader.readAsArrayBuffer(f);
  };

  const loadSample = () => parseWorkbook(SpreadsheetImport.sampleCsv(), "sample-takeoff.csv", true);

  const runEstimate = (bodyRows, map) => {
    const est = SpreadsheetImport.estimate(bodyRows, map, region);
    setResult(est); setStage(4);
  };

  // Edit/delete lines directly in the preview, before applying anywhere
  const recompute = (lines) => ({
    lines,
    materialsTotal: lines.reduce((a, l) => a + (l.total || 0), 0),
    read: lines.length,
    matched: lines.filter((l) => l.matched).length,
    fromFile: lines.filter((l) => l.priceSource === "file").length,
    needPriceCount: lines.filter((l) => l.needsPrice).length,
    skipped: result ? result.skipped : 0,
  });
  const removePreviewLine = (idx) => setResult((r) => recompute(r.lines.filter((_, i) => i !== idx)));
  const updatePreviewLine = (idx, patch) => setResult((r) => recompute(r.lines.map((l, i) => {
    if (i !== idx) return l;
    const next = { ...l, ...patch };
    // recompute this line's total from whichever of qty/rate/total changed
    if ("rate" in patch || "qty" in patch) {
      const q = +next.qty || 0, rt = +next.rate || 0;
      if (isFinite(q) && isFinite(rt) && (next.qty != null && next.rate != null)) { next.total = round(q * rt, 2); next.needsPrice = false; }
    }
    if ("total" in patch) { next.total = +patch.total || 0; next.needsPrice = false; }
    return next;
  })));

  useEffect(() => {
    if (result && mapping.material >= 0 && mapping.quantity >= 0) {
      setResult(SpreadsheetImport.estimate(rows, mapping, region));
    }
  }, [region]); // eslint-disable-line

  const steps = [
    { n: 1, label: "Upload" },
    { n: 2, label: "Map columns" },
    { n: 3, label: "Review" },
    { n: 4, label: "Allocate" },
  ];

  return (
    <div>
      <SectionHeader index="S" title={`Import spreadsheet · ${region}`} />

      {/* process stepper — always visible */}
      <div style={{ display: "flex", gap: 0, marginBottom: 20, flexWrap: "wrap" }}>
        {steps.map((s, i) => (
          <div key={s.n} style={{ display: "flex", alignItems: "center" }}>
            <div style={{ display: "flex", alignItems: "center", gap: 8, padding: "8px 14px",
              background: stage >= s.n ? TOKENS.ink : TOKENS.paperLight,
              border: `1px solid ${stage >= s.n ? TOKENS.ink : TOKENS.rule}` }}>
              <span className="ec-mono" style={{ fontSize: 12, fontWeight: 700, color: stage >= s.n ? TOKENS.hivis : TOKENS.steel }}>{s.n}</span>
              <span className="ec-mono" style={{ fontSize: 11, letterSpacing: "0.06em", color: stage >= s.n ? "#fff" : TOKENS.steel }}>{s.label}</span>
            </div>
            {i < steps.length - 1 && <div style={{ width: 18, height: 1, background: TOKENS.rule }} />}
          </div>
        ))}
      </div>

      <p style={{ fontSize: 13, color: TOKENS.inkSoft, marginBottom: 16, lineHeight: 1.6, maxWidth: 760 }}>
        Upload a takeoff spreadsheet (.xlsx or .csv). The columns are auto-detected, you confirm the mapping, review what matched, and the allocator converts quantities into orderable amounts with trade waste factors built in.
      </p>

      {/* Stage 1 — upload */}
      <div
        onDragOver={(e) => e.preventDefault()}
        onDrop={(e) => { e.preventDefault(); const f = e.dataTransfer.files?.[0]; if (f) { const isCsv = /\.csv$/i.test(f.name); const r = new FileReader(); r.onload = () => parseWorkbook(isCsv ? r.result : new Uint8Array(r.result), f.name, isCsv); if (isCsv) r.readAsText(f); else r.readAsArrayBuffer(f); } }}
        onClick={() => fileRef.current?.click()}
        style={{ border: `2px dashed ${TOKENS.rule}`, borderRadius: 4, padding: "24px 16px", textAlign: "center", cursor: "pointer", background: TOKENS.paperLight, marginBottom: 14 }}>
        <input ref={fileRef} type="file" accept=".xlsx,.xls,.csv" onChange={onFile} style={{ display: "none" }} />
        <div className="ec-mono" style={{ fontSize: 13, color: TOKENS.inkSoft }}>
          {fileName ? `Loaded: ${fileName} — click to replace` : "Drag a .xlsx or .csv here, or click to browse"}
        </div>
        <div style={{ marginTop: 12 }}>
          <button className="ec-btn ec-btn-hivis" onClick={(e) => { e.stopPropagation(); loadSample(); }}>Try a sample takeoff</button>
        </div>
      </div>
      {error && <div style={{ marginBottom: 14, padding: 10, border: `1px solid ${TOKENS.alert}`, color: TOKENS.alert, fontSize: 12, background: "rgba(200,72,14,0.05)" }} className="ec-mono">{error}</div>}

      {/* Stage 2/3 — column mapping */}
      {headers.length > 0 && (
        <div className="ec-card" style={{ padding: 16, marginBottom: 14 }}>
          <div className="ec-mono" style={{ fontSize: 11, letterSpacing: "0.12em", color: TOKENS.hivisDeep, fontWeight: 700, marginBottom: 4 }}>CONFIRM COLUMN MAPPING</div>
          <p style={{ fontSize: 11, color: TOKENS.steel, margin: "0 0 10px", lineHeight: 1.5 }}>
            If your sheet has Rate or Total columns, they're used directly — your numbers, not ours. Material is the only required column.
          </p>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
            {[["material", "Material / description *"], ["quantity", "Quantity"], ["rate", "Rate (optional)"], ["total", "Total (optional)"], ["unit", "Unit (optional)"]].map(([key, label]) => (
              <label key={key}>
                <span className="ec-label">{label}</span>
                <select className="ec-select" value={mapping[key]}
                  onChange={(e) => { const mp = { ...mapping, [key]: +e.target.value }; setMapping(mp); if (mp.material >= 0 && (mp.quantity >= 0 || mp.rate >= 0 || mp.total >= 0)) runEstimate(rows, mp); }}>
                  <option value={-1}>— none —</option>
                  {headers.map((h, i) => <option key={i} value={i}>{String(h || `Column ${i + 1}`)}</option>)}
                </select>
              </label>
            ))}
          </div>
          <div className="ec-mono" style={{ fontSize: 11, color: TOKENS.steel, marginTop: 8 }}>{rows.length} rows detected</div>
        </div>
      )}

      {/* Stage 4 — results: every line kept */}
      {result && (
        <Reveal variant="fade-up">
          <div style={{ display: "flex", gap: 12, flexWrap: "wrap", marginBottom: 16 }}>
            <CostCard label="Total from sheet" value={`${currency}${fmt(result.materialsTotal)}`} hivis sub={result.fromFile > 0 ? `${result.fromFile} priced from your file` : "priced from catalogue"} />
            <CostCard label="Lines read" value={`${result.read}`} sub={`${result.matched} catalogue-matched`} />
            {result.needPriceCount > 0 && <CostCard label="Need a price" value={`${result.needPriceCount}`} sub="no rate/total in file" />}
          </div>

          <div className="ec-mono" style={{ fontSize: 11, letterSpacing: "0.12em", color: TOKENS.hivisDeep, fontWeight: 700, marginBottom: 4 }}>EVERY LINE FROM YOUR FILE — EDIT OR DELETE HERE</div>
          <p style={{ fontSize: 11, color: TOKENS.steel, margin: "0 0 8px", lineHeight: 1.5 }}>Rename anything (including unnamed lines), fix a qty or rate, or remove a row with ×. Changes here flow through when you apply.</p>
          <div className="ec-mono" style={{ fontSize: 12 }}>
            <div style={{ display: "grid", gridTemplateColumns: "1.7fr 0.7fr 0.7fr 0.8fr 0.4fr 28px", gap: 4, padding: "6px 0", fontSize: 9, letterSpacing: "0.08em", color: TOKENS.steel, borderBottom: `1px solid ${TOKENS.rule}` }}>
              <span>DESCRIPTION</span><span style={{ textAlign: "right" }}>QTY</span><span style={{ textAlign: "right" }}>RATE</span><span style={{ textAlign: "right" }}>TOTAL</span><span style={{ textAlign: "right" }}>SRC</span><span></span>
            </div>
            {result.lines.map((l, i) => (
              <div key={i} style={{ display: "grid", gridTemplateColumns: "1.7fr 0.7fr 0.7fr 0.8fr 0.4fr 28px", gap: 4, padding: "5px 0", borderBottom: `1px dashed ${TOKENS.rule}`, alignItems: "center" }}>
                <input className="ec-input" style={{ fontSize: 11, padding: "3px 5px" }} value={l.label}
                  placeholder="(name this line)"
                  onChange={(e) => updatePreviewLine(i, { label: e.target.value })} />
                <input className="ec-input" style={{ fontSize: 11, padding: "3px 5px", textAlign: "right" }} type="number" placeholder="—"
                  value={l.qty ?? ""} onChange={(e) => updatePreviewLine(i, { qty: e.target.value === "" ? null : +e.target.value })} />
                <input className="ec-input" style={{ fontSize: 11, padding: "3px 5px", textAlign: "right" }} type="number" placeholder="—"
                  value={l.rate ?? ""} onChange={(e) => updatePreviewLine(i, { rate: e.target.value === "" ? null : +e.target.value })} />
                <span style={{ textAlign: "right", color: l.needsPrice ? TOKENS.alert : TOKENS.ink, fontWeight: 600, fontSize: 11 }}>
                  {l.needsPrice ? "—" : `${currency}${fmt(l.total)}`}
                </span>
                <span style={{ textAlign: "right", fontSize: 9, letterSpacing: "0.06em", color: l.priceSource === "file" ? TOKENS.ok : l.priceSource === "catalogue" ? TOKENS.hivisDeep : TOKENS.steel }}>
                  {l.priceSource === "file" ? "FILE" : l.priceSource === "catalogue" ? "CAT" : l.priceSource === "manual" ? "YOU" : "—"}
                </span>
                <button onClick={() => removePreviewLine(i)} title="Delete this line"
                  style={{ width: 24, height: 24, border: `1px solid ${TOKENS.rule}`, background: TOKENS.card, color: TOKENS.alert, cursor: "pointer", fontSize: 14, lineHeight: 1, borderRadius: 2 }}>×</button>
              </div>
            ))}
            <div style={{ display: "flex", justifyContent: "space-between", padding: "10px 0", borderTop: `2px solid ${TOKENS.ink}`, fontSize: 14, fontWeight: 700 }}>
              <span>TOTAL FROM SHEET</span><span>{currency}{fmt(result.materialsTotal)}</span>
            </div>
          </div>

          <div className="ec-mono" style={{ fontSize: 10, color: TOKENS.steel, marginTop: 8, lineHeight: 1.5 }}>
            SRC: <span style={{ color: TOKENS.ok }}>FILE</span> = your sheet's price · <span style={{ color: TOKENS.hivisDeep }}>CAT</span> = catalogue rate · YOU = you edited it. Summary rows (Subtotal, GST, Total) are skipped automatically.
          </div>

          {onApplyMaterials && (
            <div style={{ marginTop: 18, padding: 16, border: `2px solid ${TOKENS.emberDeep}`, background: "rgba(245,142,26,0.06)" }}>
              <div className="ec-display" style={{ fontSize: 16, marginBottom: 4 }}>Use as materials list</div>
              <p style={{ fontSize: 12, color: TOKENS.inkSoft, margin: "0 0 12px", lineHeight: 1.5 }}>
                Loads all {result.read} lines as a supply-only list, keeping your file's pricing where present.
              </p>
              <button className="ec-btn" style={{ background: TOKENS.emberDeep }} onClick={() => onApplyMaterials(result.lines)}>
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4"><path d="M5 12h14M13 6l6 6-6 6" strokeLinecap="round" strokeLinejoin="round" /></svg>
                Load as materials list
              </button>
            </div>
          )}

          {(onApply || onApplyTemplate) && (
            <div style={{ marginTop: 18, padding: 16, border: `2px solid ${TOKENS.emberDeep}`, background: "rgba(245,142,26,0.06)" }}>
              <div className="ec-display" style={{ fontSize: 16, marginBottom: 4 }}>Use this takeoff</div>
              <p style={{ fontSize: 12, color: TOKENS.inkSoft, margin: "0 0 12px", lineHeight: 1.5 }}>
                Both clear your current inputs first. <b>Fixed takeoff</b> keeps all {result.read} lines and their pricing exactly. <b>Edit as template</b> turns the catalogue-matched ones into an editable design you can play with.
              </p>
              <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                {onApplyTemplate && (
                  <button className="ec-btn" style={{ background: TOKENS.emberDeep }} onClick={() => onApplyTemplate(result.lines, fileName)}>
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4"><path d="M12 20h9M3 17l9-9 4 4-9 9H3v-4z" strokeLinecap="round" strokeLinejoin="round" /></svg>
                    Edit as template
                  </button>
                )}
                {onApply && (
                  <button className="ec-btn ec-btn-ghost" onClick={() => onApply(result.lines, fileName)}>
                    Fixed takeoff
                  </button>
                )}
              </div>
            </div>
          )}
        </Reveal>
      )}
    </div>
  );
}

function SketchUpTab({ region, currency, onApply, onApplyTemplate }) {
  const [result, setResult] = useState(null);   // { model, est }
  const [error, setError] = useState("");
  const [fileName, setFileName] = useState("");
  const [showRuby, setShowRuby] = useState(false);
  const [copied, setCopied] = useState(false);
  const fileRef = useRef(null);

  const ingest = (raw, name) => {
    const parsed = SketchUpImport.parse(raw);
    if (!parsed.ok) { setError(parsed.error); setResult(null); return; }
    const est = SketchUpImport.estimateFromModel(parsed.model, region);
    setError("");
    setFileName(name || "model.json");
    setResult({ model: parsed.model, est });
  };

  const onFile = (e) => {
    const f = e.target.files?.[0];
    if (!f) return;
    const reader = new FileReader();
    reader.onload = () => ingest(reader.result, f.name);
    reader.onerror = () => setError("Could not read that file.");
    reader.readAsText(f);
  };

  const loadSample = () => ingest(SketchUpImport.sampleModel(), "sample-model.json");

  const copyRuby = () => {
    const text = SketchUpImport.rubyExporter();
    navigator.clipboard?.writeText(text).then(() => { setCopied(true); setTimeout(() => setCopied(false), 1800); }).catch(() => {});
  };

  // re-estimate when region changes and we have a model
  useEffect(() => {
    if (result?.model) {
      setResult((r) => ({ ...r, est: SketchUpImport.estimateFromModel(r.model, region) }));
    }
  }, [region]);

  const grouped = useMemo(() => {
    if (!result) return {};
    const g = {};
    for (const l of result.est.lines) { (g[l.category] = g[l.category] || []).push(l); }
    return g;
  }, [result]);

  return (
    <div>
      <SectionHeader index="H" title={`Import from SketchUp · ${region}`} />
      <p style={{ fontSize: 13, color: TOKENS.inkSoft, marginBottom: 16, lineHeight: 1.6, maxWidth: 760 }}>
        Browsers can't open native <span className="ec-mono" style={{ fontSize: 12 }}>.skp</span> files, so the workflow is two steps: run the exporter inside SketchUp to measure your model, then drop the resulting <span className="ec-mono" style={{ fontSize: 12 }}>model.json</span> here. Quantities come straight from your geometry, so the estimate reflects the real model — not a guess.
      </p>

      {/* Step 1 */}
      <div className="ec-card" style={{ padding: 16, marginBottom: 14 }}>
        <div style={{ display: "flex", alignItems: "baseline", gap: 10, marginBottom: 10 }}>
          <span className="ec-mono" style={{ fontSize: 18, color: TOKENS.emberDeep, fontWeight: 700 }}>1</span>
          <h4 className="ec-display" style={{ fontSize: 16, margin: 0, letterSpacing: "0.02em" }}>RUN THE EXPORTER IN SKETCHUP</h4>
        </div>
        <p style={{ fontSize: 13, color: TOKENS.inkSoft, margin: "0 0 10px", lineHeight: 1.5 }}>
          In SketchUp: <span className="ec-mono" style={{ fontSize: 12 }}>Window → Ruby Console</span>, paste the script, press Enter. It writes <span className="ec-mono" style={{ fontSize: 12 }}>model.json</span> beside your file. Tag faces with material names like "Brick veneer" or "Colorbond roofing" for best matching.
        </p>
        <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
          <button className="ec-btn ec-btn-ghost" onClick={() => setShowRuby((v) => !v)}>{showRuby ? "Hide script" : "Show Ruby script"}</button>
          <button className="ec-btn" onClick={copyRuby}>{copied ? "✓ Copied" : "Copy script"}</button>
        </div>
        {showRuby && (
          <pre className="ec-mono" style={{ marginTop: 12, padding: 12, background: TOKENS.ink, color: "#d6e2c4", fontSize: 11, lineHeight: 1.5, overflowX: "auto", maxHeight: 280, borderRadius: 2 }}>
            {SketchUpImport.rubyExporter()}
          </pre>
        )}
      </div>

      {/* Step 2 */}
      <div className="ec-card" style={{ padding: 16, marginBottom: 14 }}>
        <div style={{ display: "flex", alignItems: "baseline", gap: 10, marginBottom: 10 }}>
          <span className="ec-mono" style={{ fontSize: 18, color: TOKENS.emberDeep, fontWeight: 700 }}>2</span>
          <h4 className="ec-display" style={{ fontSize: 16, margin: 0, letterSpacing: "0.02em" }}>DROP YOUR MODEL.JSON</h4>
        </div>
        <div
          onDragOver={(e) => e.preventDefault()}
          onDrop={(e) => { e.preventDefault(); const f = e.dataTransfer.files?.[0]; if (f) { const r = new FileReader(); r.onload = () => ingest(r.result, f.name); r.readAsText(f); } }}
          onClick={() => fileRef.current?.click()}
          style={{ border: `2px dashed ${TOKENS.rule}`, borderRadius: 4, padding: "28px 16px", textAlign: "center", cursor: "pointer", background: TOKENS.paperLight }}>
          <input ref={fileRef} type="file" accept=".json,application/json" onChange={onFile} style={{ display: "none" }} />
          <div className="ec-mono" style={{ fontSize: 13, color: TOKENS.inkSoft }}>Drag <b>model.json</b> here, or click to browse</div>
          <div style={{ marginTop: 12 }}>
            <button className="ec-btn ec-btn-hivis" onClick={(e) => { e.stopPropagation(); loadSample(); }}>Try a sample model</button>
          </div>
        </div>
        {error && <div style={{ marginTop: 10, padding: 10, border: `1px solid ${TOKENS.alert}`, color: TOKENS.alert, fontSize: 12, background: "rgba(200,72,14,0.05)" }} className="ec-mono">{error}</div>}
      </div>

      {/* Results */}
      {result && (
        <Reveal variant="fade-up">
          <div style={{ marginTop: 8 }}>
            <SectionHeader index="✓" title={`Mapped: ${fileName}`} />
            <div style={{ display: "flex", gap: 12, flexWrap: "wrap", marginBottom: 16 }}>
              <CostCard label="Materials from model" value={`${currency}${fmt(result.est.materialsTotal)}`} hivis />
              <CostCard label="Lines matched" value={`${result.est.matched}`} sub={`${result.est.unmatched.length} need attention`} />
              <CostCard label="Surfaces / edges / parts" value={`${result.model.surfaces.length}/${result.model.edges.length}/${result.model.components.length}`} />
            </div>

            {Object.entries(grouped).map(([cat, lines]) => (
              <div key={cat} style={{ marginBottom: 16 }}>
                <div className="ec-mono" style={{ fontSize: 11, letterSpacing: "0.16em", textTransform: "uppercase", color: TOKENS.hivisDeep, marginBottom: 6, fontWeight: 700 }}>{cat}</div>
                <TakeoffTable rows={lines.map((l) => ({ label: `${l.label}  ·  ${l.source}`, qty: `${l.qty} ${l.unit}`, rate: `${currency}${fmt(l.rate)}`, total: `${currency}${fmt(l.total)}` }))} />
              </div>
            ))}

            <div className="ec-mono" style={{ display: "flex", justifyContent: "space-between", padding: "10px 0", borderTop: `2px solid ${TOKENS.ink}`, fontSize: 14, fontWeight: 700 }}>
              <span>MATERIALS FROM MODEL</span><span>{currency}{fmt(result.est.materialsTotal)}</span>
            </div>

            {(onApply || onApplyTemplate) && (
              <div style={{ marginTop: 18, padding: 16, border: `2px solid ${TOKENS.emberDeep}`, background: "rgba(245,142,26,0.06)" }}>
                <div className="ec-display" style={{ fontSize: 16, marginBottom: 4 }}>Use this model</div>
                <p style={{ fontSize: 12, color: TOKENS.inkSoft, margin: "0 0 12px", lineHeight: 1.5 }}>
                  <b>Edit as template</b> turns these {result.est.matched} lines into an editable design you can build on. <b>Fixed takeoff</b> prices them exactly. Both clear current inputs first.
                </p>
                <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                  {onApplyTemplate && (
                    <button className="ec-btn" style={{ background: TOKENS.emberDeep }} onClick={() => onApplyTemplate(result.est.lines, fileName)}>
                      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4"><path d="M12 20h9M3 17l9-9 4 4-9 9H3v-4z" strokeLinecap="round" strokeLinejoin="round" /></svg>
                      Edit as template
                    </button>
                  )}
                  {onApply && (
                    <button className="ec-btn ec-btn-ghost" onClick={() => onApply(result.est.lines, fileName)}>
                      Fixed takeoff
                    </button>
                  )}
                </div>
              </div>
            )}

            {result.est.unmatched.length > 0 && (
              <div style={{ marginTop: 18, padding: 14, border: `1px dashed ${TOKENS.alert}`, background: "rgba(200,72,14,0.04)" }}>
                <div className="ec-mono" style={{ fontSize: 10, letterSpacing: "0.14em", color: TOKENS.alert, fontWeight: 700, marginBottom: 8 }}>UNMATCHED — RENAME IN SKETCHUP OR PRICE MANUALLY</div>
                <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
                  {result.est.unmatched.map((u, i) => (
                    <span key={i} className="ec-mono" style={{ fontSize: 11, padding: "4px 8px", border: `1px solid ${TOKENS.rule}`, background: TOKENS.card }}>
                      {u.name} <span style={{ color: TOKENS.steel }}>({u.qty}, {u.kind})</span>
                    </span>
                  ))}
                </div>
              </div>
            )}
          </div>
        </Reveal>
      )}
    </div>
  );
}

function SuppliersTab({ region, estimate }) {
  const suppliers = Suppliers[region];
  const [query, setQuery] = useState("");

  /* Build a unique list of labels from the takeoff, ordered by total cost desc.
     Residential estimates expose materialLines; high-rise exposes systemLines. */
  const materialQueries = useMemo(() => {
    const lines = estimate.materialLines || estimate.systemLines || estimate.lines || [];
    const seen = new Set();
    return lines
      .filter((l) => !seen.has(l.label) && seen.add(l.label))
      .sort((a, b) => b.total - a.total)
      .slice(0, 14);
  }, [estimate]);

  return (
    <div>
      <SectionHeader index="G" title={`Supplier search · ${region}`} />
      <p style={{ fontSize: 13, color: TOKENS.inkSoft, marginBottom: 16, lineHeight: 1.5, maxWidth: 720 }}>
        Click any item below to search live prices on a supplier site — your query runs on their search, so prices and stock are current. Or type your own material query.
      </p>

      <div style={{ display: "flex", gap: 8, marginBottom: 18, alignItems: "stretch" }}>
        <input className="ec-input" style={{ flex: 1 }} placeholder="e.g. 90×35 MGP10 pine framing" value={query} onChange={(e) => setQuery(e.target.value)} />
      </div>

      <div className="ec-mono" style={{ fontSize: 11, color: TOKENS.steel, marginBottom: 8, letterSpacing: "0.12em" }}>
        TOP ITEMS FROM YOUR QUOTE — TAP TO SEARCH
      </div>
      <div style={{ display: "flex", flexWrap: "wrap", gap: 6, marginBottom: 24 }}>
        {materialQueries.map((m) => (
          <button key={m.label} onClick={() => setQuery(m.label)}
            style={{
              padding: "6px 10px", fontFamily: "'JetBrains Mono', monospace", fontSize: 11,
              border: `1px solid ${TOKENS.rule}`, background: query === m.label ? TOKENS.hivis : TOKENS.card,
              color: TOKENS.ink, cursor: "pointer", letterSpacing: "0.02em",
            }}>
            {m.label}
          </button>
        ))}
      </div>

      {(() => {
        const q = query || materialQueries[0]?.label || "framing timber";
        // group suppliers by tier, preserving first-seen order
        const tiers = [];
        const byTier = {};
        for (const s of suppliers) {
          const t = s.tier || "Suppliers";
          if (!byTier[t]) { byTier[t] = []; tiers.push(t); }
          byTier[t].push(s);
        }
        return tiers.map((t) => (
          <div key={t} style={{ marginBottom: 22 }}>
            <div className="ec-mono" style={{ fontSize: 11, letterSpacing: "0.14em", color: TOKENS.hivisDeep, fontWeight: 700, marginBottom: 10 }}>{t.toUpperCase()}</div>
            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(260px, 1fr))", gap: 12 }}>
              {byTier[t].map((s) => (
                <a key={s.name} href={s.url(q)} target="_blank" rel="noopener noreferrer"
                  className="ec-card" style={{ padding: 16, textDecoration: "none", color: TOKENS.ink, display: "block", transition: "all 0.15s" }}
                  onMouseOver={(e) => e.currentTarget.style.borderColor = TOKENS.ink}
                  onMouseOut={(e) => e.currentTarget.style.borderColor = TOKENS.rule}>
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 8 }}>
                    <div className="ec-display" style={{ fontSize: 17, lineHeight: 1.1 }}>{s.name}</div>
                    <span style={{ fontSize: 18, color: TOKENS.hivisDeep }}>↗</span>
                  </div>
                  <div style={{ fontSize: 12, color: TOKENS.inkSoft, lineHeight: 1.4, marginBottom: 10 }}>{s.coverage}</div>
                  <div className="ec-mono" style={{ fontSize: 11, color: TOKENS.steel, paddingTop: 8, borderTop: `1px dashed ${TOKENS.rule}` }}>
                    SEARCH · "{q.length > 34 ? q.slice(0, 34) + "…" : q}"
                  </div>
                </a>
              ))}
            </div>
          </div>
        ));
      })()}

      <div style={{ marginTop: 4, padding: 12, border: `1px dashed ${TOKENS.rule}`, background: TOKENS.paperLight }}>
        <p className="ec-mono" style={{ fontSize: 11, color: TOKENS.steel, margin: 0, lineHeight: 1.6 }}>
          Local FNQ suppliers are listed for the Cairns region. Some local yards quote by phone/account rather than online search — their link opens the supplier so you can request a trade quote. National suppliers deliver to FNQ from down south.
        </p>
      </div>
    </div>
  );
}
