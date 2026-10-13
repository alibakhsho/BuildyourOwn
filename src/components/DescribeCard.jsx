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
import { parseScope, parseHouse, parseMulti, parseDeveloper, FEATURE_SCHEMAS } from "../logic/describe.js";

const COPY = {
  residential: {
    title: "Describe your home",
    example: "4 bed 2 bath double storey brick house, about 250m², double garage, colorbond roof, plus a 30m² merbau deck",
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
function aiPrompt(mode) {
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
  return `Read a plain-English building description and return ONLY these features as JSON — omit anything not stated or strongly implied. Never invent costs. Convert feet to metres.
Shape: ${schema}`;
}

function parseLocal(mode, text) {
  if (mode === "materials") { const r = parseScope(text); return { kind: "scope", items: r.items, note: r.note, found: r.items.length > 0 }; }
  if (mode === "multi") { const r = parseMulti(text); return { kind: "multi", types: r.types, found: r.found }; }
  if (mode === "highrise") { const r = parseDeveloper(text); return { kind: "developer", features: r.features, found: r.found }; }
  const r = parseHouse(text); return { kind: "house", features: r.features, extras: r.extras, found: r.found };
}

function fromAi(mode, j) {
  if (mode === "materials") return { kind: "scope", items: Array.isArray(j.items) ? j.items : [], note: j.note, found: (j.items || []).length > 0 };
  if (mode === "multi") return { kind: "multi", types: (j.types || []).filter((t) => +t.count > 0).map((t) => ({ count: Math.round(+t.count), name: t.name || "House type", features: t.features || {} })), note: j.note, found: (j.types || []).length > 0 };
  if (mode === "highrise") return { kind: "developer", features: j.features || {}, note: j.note, found: !!j.features && Object.keys(j.features).length > 0 };
  return { kind: "house", features: j.features || {}, extras: Array.isArray(j.extras) ? j.extras : [], note: j.note, found: !!j.features };
}

export default function DescribeCard({ mode, useAi, onApply }) {
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
        const out = await aiChat({ system: aiPrompt(mode), tier: "fast", maxTokens: 1200, messages: [{ role: "user", content: t }] });
        const a = out.indexOf("{"), b = out.lastIndexOf("}");
        const j = a >= 0 && b > a ? JSON.parse(out.slice(a, b + 1)) : null;
        if (j) { result = fromAi(mode, j); via = "ai"; }
      } catch { /* fall back to the built-in engine below */ }
    }
    if (!result || !result.found) { result = parseLocal(mode, t); if (via === "ai") via = "built-in"; }
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
    <div style={{ marginBottom: 16, padding: 14, border: `1.5px solid ${TOKENS.hivisDeep}`, background: TOKENS.card }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 8, marginBottom: 6, flexWrap: "wrap" }}>
        <div className="ec-display" style={{ fontSize: 17, letterSpacing: "0.02em" }}>{copy.title}</div>
        <span className="ec-mono" title={useAi ? "Uses the AI assistant on your plan" : "Runs on our own engine — free, instant, no AI credits"}
          style={{ fontSize: 9, letterSpacing: "0.1em", padding: "2px 6px", background: useAi ? TOKENS.hivis : "transparent", color: useAi ? TOKENS.onHivis : TOKENS.steel, border: useAi ? "none" : `1px solid ${TOKENS.rule}` }}>
          {useAi ? "AI" : "BUILT-IN · FREE"}
        </span>
      </div>
      <p style={{ fontSize: 12, color: TOKENS.inkSoft, margin: "0 0 8px", lineHeight: 1.45 }}>
        Say it like you'd say it to a builder — we'll fill in everything below, then adjust what you like.
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
