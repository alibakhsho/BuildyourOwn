/* =========================================================================
   DescribeCard — "Describe your project", the first thing on every
   Estimate page (residential, custom quote, multi-dwelling, developer).

   Two readers, one result shape:
     - Built-in engine (logic/describe.js): rules, runs in the browser,
       costs nothing. The ONLY reader on a plan without AI (Homeowner,
       guests), so the free tier never touches AI credits.
     - AI (plans with AI): the model is asked for the same feature JSON,
       which is better at messy, long descriptions. If it fails for any
       reason, the built-in engine answers instead.
   Either way the reader only says WHAT was described; our estimating
   engines turn that into quantities and prices.
   ========================================================================= */
import { useState } from "react";
import { colors as TOKENS } from "../design/system.js";
import { chat as aiChat } from "../ai/client.js";
import { WallBuilder } from "../logic/wall-builder.js";
import { parseScope, parseHouse, parseMulti, parseDeveloper, parseEdits, FEATURE_SCHEMAS } from "../logic/describe.js";

const COPY = {
  residential: {
    title: "Describe your home",
    example: "4 bed 2 bath double storey brick house, about 250m², double garage, colorbond roof, plus a 30m² merbau deck",
    change: "extend the deck to the width of the house · add a second garage door at the back",
    button: "Set up my estimate",
  },
  materials: {
    title: "Describe the job",
    example: "a partition wall 4m by 2.4 painted both sides with 2 power points, and a 20m² merbau deck, installed",
    button: "Price these items",
  },
  multi: {
    title: "Describe the development",
    example: "6 single storey 3 bed homes and 4 double storey 4 bed townhouses, all brick with colorbond roofs",
    button: "Set up the house types",
  },
  highrise: {
    title: "Describe the building",
    example: "a 6 storey apartment block with 48 units, 2 basement levels, concrete frame, precast façade",
    button: "Fill in the building",
  },
};

/* Prompts for the AI path — each asks for exactly what the built-in engine returns. */
function aiPrompt(mode, spec) {
  if (mode === "materials") {
    const presets = WallBuilder.presets.map((p) => `"${p.id}" (${p.label}, dim=${p.dim}${p.variants ? `, variants: ${p.variants.map((v) => v.id).join("/")}` : ""})`).join("; ");
    const addons = WallBuilder.addons.map((a) => `"${a.id}" (${a.label})`).join(", ");
    return `Classify a builder's plain-English job into estimator items. Never invent prices or materials.
Presets: ${presets}.
Wall add-ons (timber_wall only): ${addons}.
For dim=wall give lengthM & heightM (default 2.4), finish paint|render|tile|none, sides 1|2. dim=area → "dim" in m²; dim=length → "dim" in metres. Decompose cabins/studios/sheds into slab (concreting) + walls (timber_wall, perimeter) + roof (roofing ≈ footprint×1.15). labour=true only if installation is implied.
Reply with ONLY JSON: {"items":[{"preset":id,"lengthM":n,"heightM":n,"dim":n,"finish":s,"sides":n,"variant":id,"labour":bool,"addons":[{"id":id,"qty":n}],"label":s}],"note":s}`;
  }
  const schema = mode === "residential" ? FEATURE_SCHEMAS.house : mode === "multi" ? FEATURE_SCHEMAS.multi : FEATURE_SCHEMAS.developer;
  const base = `Read a plain-English building description and return ONLY these features as JSON — omit anything not stated or strongly implied. Never invent costs. Convert feet to metres.
Shape: ${schema}`;
  if (mode !== "residential") return base;
  const L = spec?.landscape || {};
  return `${base}
The user may instead ask to CHANGE the house they already have ("extend the deck to the width of the house", "open the garage up at the back with another door"). Put those in "edits" and leave "features" empty unless the house itself is being re-described.
The current house: ${spec?.widthM || "?"} m wide (that is the length of the back wall) × ${spec?.lengthM || "?"} m deep, ${spec?.hasGarage ? `double garage${spec?.garageRearDoor ? " with a rear door" : ""}` : "no garage"}, ${L.enabled ? `landscaping on, deck ${L.deck === false ? "none" : `${L.deckWidthM ?? 5} m wide × ${L.deckDepthM ?? 3.6} m deep (${L.deckBoard || "merbau"})`}` : "no landscaping yet (a deck edit turns it on)"}.
Deck width runs along the back wall; depth runs out into the yard. "said" is one short plain sentence per change.`;
}

function parseLocal(mode, text, spec) {
  if (mode === "materials") { const r = parseScope(text); return { kind: "scope", items: r.items, note: r.note, found: r.items.length > 0 }; }
  if (mode === "multi") { const r = parseMulti(text); return { kind: "multi", types: r.types, found: r.found }; }
  if (mode === "highrise") { const r = parseDeveloper(text); return { kind: "developer", features: r.features, found: r.found }; }
  const r = parseHouse(text);
  const edits = parseEdits(text, spec || {});
  return houseResult(r.features, r.extras, edits);
}

/* A house result, with change requests taking priority over a re-description
   of the same thing ("open the garage at the back" is an edit, not "has a garage"). */
function houseResult(features = {}, extras = [], edits = null, note) {
  const f = { ...features };
  let x = extras;
  if (edits?.found) {
    if ("garageRearDoor" in (edits.patch || {}) || "hasGarage" in (edits.patch || {})) delete f.garage;
    if (Object.keys(edits.landscape || {}).length) x = x.filter((e) => e.preset !== "deck");
  }
  const found = Object.keys(f).length > 0 || x.length > 0 || !!edits?.found;
  return { kind: "house", features: f, extras: x, edits: edits?.found ? edits : null, note, found };
}

function fromAi(mode, j, text, spec) {
  if (mode === "materials") return { kind: "scope", items: Array.isArray(j.items) ? j.items : [], note: j.note, found: (j.items || []).length > 0 };
  if (mode === "multi") return { kind: "multi", types: (j.types || []).filter((t) => +t.count > 0).map((t) => ({ count: Math.round(+t.count), name: t.name || "House type", features: t.features || {} })), note: j.note, found: (j.types || []).length > 0 };
  if (mode === "highrise") return { kind: "developer", features: j.features || {}, note: j.note, found: !!j.features && Object.keys(j.features).length > 0 };
  // the AI's edits, or the built-in reader's when the AI missed them
  const e = j.edits && typeof j.edits === "object" ? j.edits : {};
  let edits = { landscape: e.landscape || {}, patch: e.patch || {}, said: Array.isArray(e.said) ? e.said : [] };
  edits.found = Object.keys(edits.landscape).length > 0 || Object.keys(edits.patch).length > 0;
  if (!edits.found) edits = parseEdits(text, spec || {});
  else if (!edits.said.length) edits.said = ["Updated the house."];
  return houseResult(j.features || {}, Array.isArray(j.extras) ? j.extras : [], edits, j.note);
}

export default function DescribeCard({ mode, useAi, onApply, spec }) {
  const copy = COPY[mode] || COPY.residential;
  const [text, setText] = useState("");
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState(null); // { tone: "ok"|"warn", text }

  const run = async () => {
    const t = text.trim();
    if (!t || busy) return;
    setBusy(true); setMsg(null);
    let result = null, via = "built-in";
    if (useAi) {
      try {
        const out = await aiChat({ system: aiPrompt(mode, spec), tier: "fast", maxTokens: 1200, messages: [{ role: "user", content: t }] });
        const a = out.indexOf("{"), b = out.lastIndexOf("}");
        const j = a >= 0 && b > a ? JSON.parse(out.slice(a, b + 1)) : null;
        if (j) { result = fromAi(mode, j, t, spec); via = "ai"; }
      } catch { /* fall back to the built-in engine below */ }
    }
    if (!result || !result.found) { result = parseLocal(mode, t, spec); if (via === "ai") via = "built-in"; }
    if (!result.found) {
      setMsg({ tone: "warn", text: `I couldn't pick out enough to work with. Try something like: "${copy.example}"` });
      setBusy(false); return;
    }
    const summary = onApply(result);
    setMsg({ tone: "ok", text: [summary, result.note].filter(Boolean).join(" ") });
    setText("");
    setBusy(false);
  };

  return (
    <div style={{ marginBottom: 16, padding: 16, borderRadius: 14, border: `1px solid color-mix(in srgb, ${TOKENS.hivis} 55%, ${TOKENS.rule})`,
      background: `linear-gradient(180deg, ${TOKENS.accentWash}, transparent 70%), ${TOKENS.card}`, boxShadow: TOKENS.shadowMd }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 8, marginBottom: 6, flexWrap: "wrap" }}>
        <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
          <span aria-hidden="true" style={{ display: "grid", placeItems: "center", width: 30, height: 30, borderRadius: 9, background: TOKENS.hivis, color: TOKENS.onHivis }}>
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M12 3l1.9 5.1L19 10l-5.1 1.9L12 17l-1.9-5.1L5 10l5.1-1.9z" /><path d="M19 15l.8 2.2L22 18l-2.2.8L19 21l-.8-2.2L16 18l2.2-.8z" /></svg>
          </span>
          <div className="ec-display" style={{ fontSize: 16, fontWeight: 700, letterSpacing: "-0.01em" }}>{copy.title}</div>
        </div>
        <span className="ec-mono" title={useAi ? "Uses the AI assistant on your plan" : "Runs on our own engine — free, instant, no AI credits"}
          style={{ fontSize: 11, fontWeight: 700, letterSpacing: "0.04em", padding: "3px 10px", borderRadius: 999, background: useAi ? TOKENS.emphasis : TOKENS.paperLight, color: useAi ? TOKENS.onEmphasis : TOKENS.steel, border: useAi ? "none" : `1px solid ${TOKENS.rule}` }}>
          {useAi ? "AI" : "Built-in · free"}
        </span>
      </div>
      <p style={{ fontSize: 12, color: TOKENS.inkSoft, margin: "0 0 8px", lineHeight: 1.45 }}>
        Say it like you'd say it to a builder — we'll fill in everything below, then adjust what you like.
        {copy.change ? <> You can also ask for a change: <i>{copy.change}</i>.</> : null}
      </p>
      <textarea className="ec-input" rows={3} value={text} placeholder={`e.g. ${copy.example}`}
        onChange={(e) => setText(e.target.value)}
        onKeyDown={(e) => { if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) run(); }}
        style={{ width: "100%", resize: "vertical", marginBottom: 8, fontFamily: "inherit", fontSize: 13, lineHeight: 1.4 }} />
      <button className="ec-btn ec-btn-hivis" style={{ width: "100%", justifyContent: "center" }} onClick={run} disabled={busy || !text.trim()}>
        {busy ? "Working it out…" : copy.button}
      </button>
      {msg && (
        <div className="ec-mono" style={{ fontSize: 11, marginTop: 8, lineHeight: 1.45, color: msg.tone === "ok" ? TOKENS.ok : TOKENS.alert }}>{msg.text}</div>
      )}
    </div>
  );
}
