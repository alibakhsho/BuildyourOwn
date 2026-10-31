/* =========================================================================
   MODULE: cinematic.js
   Plans a short film of the build from the model itself — every camera
   move is worked out from the real house: its lot, front door, rooms,
   deck and programme — so the film always shows *this* design.

     establishing   drone in over the street, descending
     arrival        eye-level glide along the street and up the path
     façade         crane up from the door over the roof
     construction   (client presentation) orbit while it builds, stage by
                    stage, captioned with the programme's weeks
     layout         roof off, slow orbit over the furnished plan
     rooms          eye-level dollies through the main rooms
     outdoors       across the lawn to the deck
     finale         rising pull-back with the title (and price)

   Pure: returns shots as plain arrays (camera path + look-at path, field
   of view, roof on/off, build progress, captions); engine/cinema.js plays
   them. Two cuts: "homeowner" (lifestyle) and "client" (adds the build
   sequence, programme and price — for builders and trades to show a
   client).
   ========================================================================= */

const STAGE_KEYS = {
  foundation: ["site", "foundation"],
  frame: ["frame"],
  roof: ["roof"],
  walls: ["cladding", "openings"],
  finishes: ["services_rough", "lining", "fitout", "finishes", "commissioning", "landscape", "handover"],
};
const STAGE_TITLES = {
  foundation: "Site works, slab & footings",
  frame: "Wall frames & floor framing",
  roof: "Roof trusses & roofing",
  walls: "Brickwork, windows & doors — lock-up",
  finishes: "Services, fit-out & landscaping",
};
const ROOM_ORDER = ["Living", "Kitchen", "Dining", "MainBedroom", "Media", "Study", "Bedroom"];

const clampIn = (v, a, b) => Math.max(a, Math.min(b, v));
const ring = (cx, cz, r, y, a0, a1, n = 9) =>
  Array.from({ length: n }, (_, i) => { const a = a0 + ((a1 - a0) * i) / (n - 1); return [cx + Math.cos(a) * r, y, cz + Math.sin(a) * r]; });

/** Weeks for each engine build stage from the estimate's programme. */
export function stageWeeks(stages = []) {
  const out = {};
  for (const [k, keys] of Object.entries(STAGE_KEYS)) {
    const mine = stages.filter((s) => keys.includes(s.key));
    if (mine.length) out[k] = [Math.min(...mine.map((s) => s.startWeek)), Math.max(...mine.map((s) => s.endWeek))];
  }
  return out;
}

/**
 * @param S      buildStructure(spec)
 * @param facts  { title, subtitle, priceText, weeks, stages, presentedBy }
 * @param opts   { audience: "homeowner" | "client", showPrice }
 * @returns { shots, duration }
 */
export function planFilm(S, facts = {}, { audience = "homeowner", showPrice = audience === "client" } = {}) {
  const { env } = S;
  const { w, l } = env;
  const H = env.plateY;                                // top of the walls
  const ridge = Math.max(H + 1, S.roof?.ridgeY || H + 2);
  const Y = S.landscape;
  const G = S.garage;
  const hx0 = G ? Math.min(G.x0, -w / 2) : -w / 2, hx1 = w / 2;
  const cx = (hx0 + hx1) / 2;
  const lot = Y?.lot || { X0: hx0 - 4, X1: hx1 + 4, Z0: -l / 2 - 8, Z1: l / 2 + 7 };
  const diag = Math.hypot(lot.X1 - lot.X0, lot.Z1 - lot.Z0);
  const R = Math.max(18, diag * 0.75);
  const front = l / 2;
  const door = (S.openings || []).find((o) => o.side === "front" && o.kind === "door" && (o.floor ?? 0) === 0);
  const doorX = door ? -w / 2 + door.u : cx;
  const look0 = [cx, H * 0.45, 0];
  const shots = [];
  const push = (s) => shots.push({ fov: 45, roofOff: false, ...s });

  /* 1. establishing — drone in from the street corner */
  push({ id: "establish", dur: 7.5, title: facts.title || "Your new home", sub: facts.subtitle || "",
    pos: [[cx + R * 1.25, R * 0.95, lot.Z1 + R * 1.1], [cx + R * 0.85, R * 0.6, lot.Z1 + R * 0.75], [cx + R * 0.45, ridge + 7, lot.Z1 + R * 0.4]],
    look: [[cx, 0, 0], look0], fov: 40, big: true });

  /* 2. arrival — along the street, then up the path to the door */
  const street = lot.Z1 + 4;
  push({ id: "arrival", dur: 7, title: "Arriving home", sub: Y ? `${(lot.Z1 - front).toFixed(1)} m front setback · ${Y.L.path === "pavers" ? "paved" : Y.L.path === "gravel" ? "gravel" : Y.L.path === "stepping" ? "stepping-stone" : "concrete"} path` : "Street frontage",
    pos: [[lot.X1 + 6, 1.65, street + 2], [cx + w * 0.25, 1.65, street], [doorX + 0.6, 1.7, lot.Z1 - 0.5], [doorX, 1.7, front + 4.2]],
    look: [[cx, 2.2, front], [doorX, 1.9, front]], fov: 50 });

  /* 3. façade — crane up from the door */
  push({ id: "facade", dur: 6, title: "The façade", sub: facts.facade || "",
    pos: [[doorX, 1.7, front + 4.2], [doorX + 1.5, ridge * 0.7, front + 7.5], [cx + 3, ridge + 5, front + 11]],
    look: [[doorX, 2.0, front], [cx, H * 0.55, front - 2]], fov: 46 });

  /* 4. construction — client cut: builds stage by stage while orbiting */
  if (audience === "client") {
    const weeks = stageWeeks(facts.stages);
    const order = ["foundation", "frame", "roof", "walls", "finishes"];
    push({ id: "build", dur: 17, title: "How it gets built", sub: facts.weeks ? `${facts.weeks} weeks on site` : "",
      pos: ring(cx, 0, R * 0.85, ridge + 9, Math.PI * 0.35, Math.PI * 1.85, 12), look: [[cx, H * 0.3, 0]], fov: 44,
      build: [0, 1],
      stageCaptions: order.map((k, i) => ({ at: i / order.length, title: `Stage ${i + 1} — ${STAGE_TITLES[k]}`, sub: weeks[k] ? `Weeks ${weeks[k][0]}–${weeks[k][1]}` : "" })) });
  }

  /* 5. layout — roof off, over the furnished plan */
  const top = S.layout.floors.length - 1;
  const fl = S.layout.floors[top];
  const named = fl.cells.filter((c) => !c.item.circulation && c.item.type !== "Stair").sort((a, b) => b.w * b.l - a.w * a.l).slice(0, 5).map((c) => c.item.name);
  const hOver = fl.y + Math.max(10, Math.hypot(w, l) * 0.75);
  push({ id: "layout", dur: 9, title: top ? "Upstairs layout" : "The layout", sub: named.join(" · "),
    pos: ring(0, 0, Math.hypot(w, l) * 0.42, hOver, Math.PI * 0.55, Math.PI * 1.15, 7), look: [[0, fl.y, 0]], fov: 42, roofOff: true });

  /* 6. rooms — eye-level dollies */
  const all = S.layout.floors.flatMap((f) => f.cells.map((c) => ({ c, y: f.y })));
  const beds = all.filter((r) => r.c.item.type === "Bedroom").sort((a, b) => b.c.w * b.c.l - a.c.w * a.c.l);
  const keyOf = (r) => (r === beds[0] ? "MainBedroom" : r.c.item.type);
  const rooms = all.filter((r) => ROOM_ORDER.includes(keyOf(r)) && r.c.w > 2.2 && r.c.l > 2.2)
    .sort((a, b) => ROOM_ORDER.indexOf(keyOf(a)) - ROOM_ORDER.indexOf(keyOf(b)))
    .slice(0, audience === "client" ? 3 : 4);
  const furn = S.members.filter((m) => m.sys === "furniture" && !m.noSchedule && !["curtain", "art", "rod", "pendant"].includes(m.kind));
  rooms.forEach(({ c, y }, i) => {
    const m = 0.5, eye = y + 1.55;
    const mine = furn.filter((p) => p.host.startsWith(`${c.item.name} ·`));
    // look at the room's furniture; film from the far corner, clear of anything tall
    const fx = mine.length ? mine.reduce((a, p) => a + (p.a[0] + p.b[0]) / 2, 0) / mine.length : c.x + c.w / 2;
    const fz = mine.length ? mine.reduce((a, p) => a + (p.a[2] + p.b[2]) / 2, 0) / mine.length : c.z + c.l / 2;
    const tall = mine.filter((p) => Math.max(p.a[1], p.b[1]) - y > 1.2);
    const corners = [[c.x + m, c.z + m], [c.x + c.w - m, c.z + m], [c.x + m, c.z + c.l - m], [c.x + c.w - m, c.z + c.l - m]]
      .filter(([x, z]) => !tall.some((p) => Math.hypot((p.a[0] + p.b[0]) / 2 - x, (p.a[2] + p.b[2]) / 2 - z) < 0.7))
      .sort((p, q) => Math.hypot(q[0] - fx, q[1] - fz) - Math.hypot(p[0] - fx, p[1] - fz));
    const [sx, sz] = corners[0] || [c.x + c.w / 2, c.z + c.l / 2];
    const dx = fx - sx, dz = fz - sz, d = Math.hypot(dx, dz) || 1;
    const step = Math.min(0.9, d * 0.3);
    const ex = clampIn(sx + (dx / d) * step - (dz / d) * 0.35, c.x + m, c.x + c.w - m);
    const ez = clampIn(sz + (dz / d) * step + (dx / d) * 0.35, c.z + m, c.z + c.l - m);
    const finish = { carpet: "carpet", tile: "tiled", timber: "timber" }[c.item.finish] || "";
    push({ id: `room-${i}`, dur: 5.5, title: c.item.name.replace(/\s*\/.*$/, ""), sub: `${c.w.toFixed(1)} × ${c.l.toFixed(1)} m${finish ? ` · ${finish} floor` : ""}`,
      pos: [[sx, eye, sz], [ex, eye + 0.05, ez]], look: [[fx - (dz / d) * 0.4, y + 1.0, fz + (dx / d) * 0.4], [fx, y + 1.05, fz]], fov: 60, roofOff: true, interior: true });
  });

  /* 7. outdoors — across the lawn to the deck and the back of the house */
  const D = Y?.deck;
  const bx = D ? (D.x0 + D.x1) / 2 : cx;
  const back = -l / 2;
  const outSub = Y ? [D ? `${(D.area || (D.x1 - D.x0) * (D.z1 - D.z0)).toFixed(0)} m² ${Y.L.deckBoard === "composite" ? "composite" : Y.L.deckBoard === "pine" ? "pine" : "merbau"} deck` : "", Y.q?.lawn && Y.L.lawn !== "none" ? `${Y.q.lawn.toFixed(0)} m² lawn` : "", Y.q?.plants ? `${Y.q.plants} plants` : ""].filter(Boolean).join(" · ") : "";
  push({ id: "outdoors", dur: 6.5, title: Y ? "Outdoor living" : "The rear", sub: outSub,
    pos: [[bx + 4, 1.5, Math.max(lot.Z0 + 1.5, back - 9)], [bx + 1.5, 1.65, Math.max(lot.Z0 + 1.2, back - 6.5)], [bx, 2.4, (D ? D.z0 : back) - 2.2]],
    look: [[bx, 1.2, back], [bx, 1.5, back]], fov: 52 });

  /* 8. finale — rising pull-back */
  const priceLine = showPrice && facts.priceText ? facts.priceText : "";
  const weekLine = facts.weeks ? `${facts.weeks} weeks to build` : "";
  push({ id: "finale", dur: 8, title: facts.title || "Your new home", sub: [priceLine, audience === "client" ? weekLine : ""].filter(Boolean).join(" · ") || facts.subtitle || "",
    credit: facts.presentedBy ? `Presented by ${facts.presentedBy}` : "", big: true,
    pos: ring(cx, 0, R * 0.75, ridge + 6, -Math.PI * 0.1, Math.PI * 0.4, 6).map((p, i, a) => [p[0], p[1] + (i / (a.length - 1)) * R * 0.3, p[2] + (i / (a.length - 1)) * R * 0.3]),
    look: [[cx, H * 0.4, 0], [cx, H * 0.2, 0]], fov: 40 });

  let t = 0;
  for (const s of shots) { s.start = t; t += s.dur; }
  return { shots, duration: t, audience };
}

/* The caption showing at local time `lt` of a shot (and its opacity). */
export function captionAt(shot, lt, buildProgress) {
  let title = shot.title, sub = shot.sub;
  if (shot.stageCaptions && buildProgress != null) {
    const cur = [...shot.stageCaptions].reverse().find((c) => buildProgress >= c.at - 1e-6) || shot.stageCaptions[0];
    title = cur.title; sub = cur.sub;
  }
  const inT = 0.5, outT = 0.6;
  const a = Math.max(0, Math.min(1, (lt - inT) / 0.6, (shot.dur - outT - lt) / 0.5));
  return { title, sub, credit: shot.credit || "", alpha: a, big: !!shot.big };
}
