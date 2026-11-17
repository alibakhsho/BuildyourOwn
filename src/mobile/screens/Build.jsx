/* =========================================================================
   mobile/screens/Build.jsx — one house on the phone
   ------------------------------------------------------------------------
   The 3D house up top, the price right under it, and four views of the
   same house: Design (change it), Cost (where the money goes), Timeline
   (how long), Quote (send it). Every change re-prices and rebuilds the
   model at once, and saves itself — there is no Save button to forget.
   ========================================================================= */
import { useEffect, useMemo, useRef, useState } from "react";
import { ChevronLeft, Ellipsis, Share2, Pencil, Copy, Trash2, Monitor, Sparkles, Info, ChevronRight } from "lucide-react";
import { Estimator } from "../../logic/estimator.js";
import { getProject, saveProject, deleteProject, duplicateProject } from "../../state/projects.js";
import { readDescription } from "../../components/DescribeCard.jsx";
import { applyHouseResult } from "../../logic/describe-apply.js";
import { useAuth } from "../../state/auth.jsx";
import { track } from "../../lib/analytics.js";
import { currencySymbol } from "../../lib/format.js";
import Viewer3D from "../Viewer3D.jsx";
import { Stepper, Chips, Switch, Segmented, Sheet, money, grossTotal } from "../ui.jsx";
import {
  starterSpec, bedroomsOf, bathroomsOf, floorAreaOf, setBedrooms, setBathrooms, setStoreys, setFloorArea,
  KITCHEN_LEVELS, kitchenLevelOf, setKitchenLevel, setMainFloors,
} from "../house.js";
import { shareQuotePdf } from "../quote-pdf.js";
import { switchLayout } from "../layout.js";

const PANELS = [
  { id: "design", label: "Design" },
  { id: "cost", label: "Cost" },
  { id: "timeline", label: "Timeline" },
  { id: "quote", label: "Quote" },
];

export default function BuildScreen({ id, onClose, onFindBuilder, toast }) {
  const { can, profile } = useAuth();
  const [project] = useState(() => getProject(id));
  const [spec, setSpec] = useState(() => project?.spec || starterSpec());
  const [name, setName] = useState(project?.name || "My build");
  const [quote, setQuote] = useState(() => project?.quote || {});
  const [panel, setPanel] = useState("design");
  const [menu, setMenu] = useState(false);
  const [renaming, setRenaming] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [sharing, setSharing] = useState(false);
  const region = project?.region || "AU";
  const estimate = useMemo(() => Estimator.buildEstimate(spec, region), [spec, region]);
  const gross = grossTotal(estimate);

  useEffect(() => { track("mobile_build_opened", { region }); }, [region]);

  /* Autosave: a moment after the last change, and straight away if the app
     goes to the background (Android may kill a backgrounded app) or the
     screen closes. Opening a build without changing it saves nothing. */
  const pending = useRef(null);
  const first = useRef(true);
  useEffect(() => {
    if (first.current) { first.current = false; return; }
    pending.current = { spec, name, quote };
    const t = setTimeout(() => { saveProject(id, pending.current); pending.current = null; }, 400);
    return () => clearTimeout(t);
  }, [id, spec, name, quote]);
  useEffect(() => {
    const flush = () => { if (pending.current) { saveProject(id, pending.current); pending.current = null; } };
    const onVis = () => { if (document.hidden) flush(); };
    document.addEventListener("visibilitychange", onVis);
    return () => { document.removeEventListener("visibilitychange", onVis); flush(); };
  }, [id]);

  const share = async () => {
    if (!(estimate.total > 0) || sharing) return;
    setSharing(true);
    try {
      const out = await shareQuotePdf({
        name, spec, estimate, region, currency: currencySymbol(region),
        client: quote.client, notes: quote.notes,
        preparedBy: quote.preparedBy ?? (profile?.full_name || ""), // cleared on purpose stays cleared; never the email
        ref: `BYO-${id.slice(-6).toUpperCase()}`,
      });
      if (out === "downloaded") toast("Saved the estimate PDF to your downloads.");
      track("mobile_quote_shared", { via: out, total: Math.round(estimate.total) });
    } catch (e) {
      toast(`Couldn't make the PDF: ${e.message || "unknown error"}`);
    } finally {
      setSharing(false);
    }
  };

  if (!project) {
    return (
      <div>
        <header className="m-top"><button className="m-icon-btn" onClick={onClose} aria-label="Back"><ChevronLeft /></button></header>
        <div className="m-empty"><h2 className="m-h2">This build isn't on this phone</h2><p>It may have been deleted, or saved on another device that hasn't synced yet.</p></div>
      </div>
    );
  }

  return (
    <div>
      <header className="m-top">
        <button className="m-icon-btn" onClick={onClose} aria-label="Back to your builds"><ChevronLeft size={26} /></button>
        {renaming ? (
          <input className="m-input" autoFocus value={name} aria-label="Build name" style={{ padding: "8px 12px" }}
            onChange={(e) => setName(e.target.value)} onBlur={() => setRenaming(false)}
            onKeyDown={(e) => e.key === "Enter" && setRenaming(false)} />
        ) : (
          <button className="m-top-title" onClick={() => setRenaming(true)} style={{ border: 0, background: "none", color: "inherit", textAlign: "left", padding: 0, cursor: "pointer" }}>{name}</button>
        )}
        <button className="m-icon-btn" onClick={() => setMenu(true)} aria-label="More"><Ellipsis /></button>
      </header>

      <div className="m-pad">
        <Viewer3D spec={spec} />

        <div style={{ marginTop: 16 }}>
          <div className="m-price m-num" aria-live="polite">{money(gross, region)}</div>
          <div className="m-price-meta m-num">
            <span>{estimate.taxRate > 0 ? `incl. ${estimate.taxLabel.split(" ")[0]}` : "estimate"}</span>
            <span><b>{money(estimate.ratePerM2 * (1 + (estimate.taxRate || 0)), region)}</b>/m²</span>
            <span><b>{estimate.timeline?.totalWeeks || 0}</b> weeks to build</span>
          </div>
        </div>

        <div style={{ position: "sticky", top: "calc(56px + env(safe-area-inset-top))", zIndex: 10, padding: "14px 0 10px", background: "var(--m-paper)" }}>
          <Segmented label="Build views" options={PANELS} value={panel} onChange={(p) => { setPanel(p); }} />
        </div>

        {panel === "design" && <DesignPanel spec={spec} setSpec={setSpec} region={region} useAi={!!can.ai} />}
        {panel === "cost" && <CostPanel estimate={estimate} region={region} />}
        {panel === "timeline" && <TimelinePanel estimate={estimate} />}
        {panel === "quote" && <QuotePanel quote={quote} setQuote={setQuote} profile={profile} onShare={share} sharing={sharing} onFindBuilder={onFindBuilder} />}
      </div>

      <div className="m-actionbar">
        <div className="m-actionbar-total m-num"><b>{money(gross, region)}</b><span>{floorAreaOf(spec)} m² · {estimate.timeline?.totalWeeks || 0} weeks</span></div>
        <button className="m-btn m-btn-coral" onClick={share} disabled={sharing || !(estimate.total > 0)}>
          <Share2 size={18} />{sharing ? "Making PDF…" : "Send estimate"}
        </button>
      </div>

      {menu && (
        <Sheet title={name} onClose={() => { setMenu(false); setConfirmDelete(false); }}>
          <button className="m-sheet-action" onClick={() => { setMenu(false); setRenaming(true); }}><Pencil size={20} />Rename</button>
          <button className="m-sheet-action" onClick={() => { saveProject(id, { spec, name, quote }); const c = duplicateProject(id); setMenu(false); if (c) toast(`Made a copy: ${c.name}`); }}><Copy size={20} />Make a copy</button>
          <button className="m-sheet-action" onClick={() => { saveProject(id, { spec, name, quote }); switchLayout("full"); }}><Monitor size={20} />Open the full version</button>
          {confirmDelete ? (
            <button className="m-sheet-action is-danger" onClick={() => { pending.current = null; deleteProject(id); setMenu(false); onClose(); toast(`Deleted ${name}`); }}><Trash2 size={20} />Tap again to delete for good</button>
          ) : (
            <button className="m-sheet-action is-danger" onClick={() => setConfirmDelete(true)}><Trash2 size={20} />Delete</button>
          )}
        </Sheet>
      )}
    </div>
  );
}

/* ------------------------------------------------------------------------ */

const WALLS = [{ id: "brick", label: "Brick" }, { id: "weatherboard", label: "Weatherboard" }, { id: "render", label: "Rendered" }];
const ROOFS = [{ id: "colorbond", label: "Colorbond steel" }, { id: "tile", label: "Roof tiles" }];
const FLOORS = [{ id: "timber", label: "Timber" }, { id: "tile", label: "Tiles" }, { id: "carpet", label: "Carpet" }];
const BLOCKS = [{ id: "flat", label: "Flat" }, { id: "sloping", label: "Sloping" }, { id: "difficult", label: "Steep or rocky" }];

function DesignPanel({ spec, setSpec, region, useAi }) {
  const [text, setText] = useState("");
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState(null);
  const set = (fn) => setSpec((s) => fn(s));

  const change = async () => {
    const t = text.trim();
    if (!t || busy) return;
    setBusy(true); setMsg(null);
    const r = await readDescription("residential", t, spec, useAi);
    if (!r.found) {
      setMsg({ ok: false, text: "I couldn't tell what to change. Try “make it 4 bedrooms” or “add a 30 m² merbau deck”." });
    } else {
      const out = applyHouseResult(spec, r, region);
      setSpec(out.spec);
      setMsg({ ok: true, text: [out.summary, r.note].filter(Boolean).join(" ") });
      setText("");
    }
    setBusy(false);
  };

  return (
    <div className="m-stack">
      <section className="m-card" style={{ padding: "4px 16px" }} aria-label="Size">
        <Stepper label="Bedrooms" value={bedroomsOf(spec)} min={1} max={6} onChange={(n) => set((s) => setBedrooms(s, n))} />
        <Stepper label="Bathrooms" value={bathroomsOf(spec)} min={1} max={4} onChange={(n) => set((s) => setBathrooms(s, n))} />
        <Stepper label="Storeys" value={spec.floors || 1} min={1} max={3} onChange={(n) => set((s) => setStoreys(s, n))} />
        <Stepper label="Floor area" hint="All floors, inside the outer walls" unit=" m²" value={floorAreaOf(spec)} min={40} max={600} step={10}
          onChange={(n) => set((s) => setFloorArea(s, n))} />
      </section>

      <section className="m-card" style={{ padding: "0 16px" }} aria-label="Finishes">
        <Chips label="Outside walls" options={WALLS} value={spec.claddingType} onChange={(v) => set((s) => ({ ...s, claddingType: v }))} />
        <Chips label="Roof" options={ROOFS} value={spec.roofType} onChange={(v) => set((s) => ({ ...s, roofType: v }))} />
        <Chips label="Living area floors" options={FLOORS} value={spec.floorFinish} onChange={(v) => set((s) => setMainFloors(s, v))} />
        <Chips label="Kitchen" options={KITCHEN_LEVELS} value={kitchenLevelOf(spec)} onChange={(v) => set((s) => setKitchenLevel(s, v))} />
        <Chips label="Block" options={BLOCKS} value={spec.siteCondition || "flat"} onChange={(v) => set((s) => ({ ...s, siteCondition: v }))} />
        <Switch label="Double garage" checked={spec.hasGarage} onChange={(v) => set((s) => ({ ...s, hasGarage: v }))} />
        <Switch label="Solar panels" hint="6.6 kW system with inverter" checked={spec.solar} onChange={(v) => set((s) => ({ ...s, solar: v }))} />
      </section>

      <section className="m-card m-card-pad" aria-label="Describe a change">
        <label className="m-label" htmlFor="m-change"><Sparkles size={14} style={{ verticalAlign: -2, marginRight: 6 }} />Describe a change</label>
        <textarea id="m-change" className="m-input" rows={2} value={text} onChange={(e) => setText(e.target.value)}
          placeholder="e.g. add a 30 m² merbau deck out the back" />
        <button className="m-btn m-btn-soft m-btn-block" style={{ marginTop: 10 }} onClick={change} disabled={busy || !text.trim()}>
          {busy ? "Working it out…" : "Make the change"}
        </button>
        {msg && <p className="m-small" role="status" style={{ margin: "10px 0 0", color: msg.ok ? "var(--m-ok)" : "var(--m-coral-ink)" }}>{msg.text}</p>}
      </section>

      <div className="m-note"><Info size={16} /><span>Room-by-room sizes, landscaping, electrical and plumbing layouts and the drawing set are in the full version on a computer. Changes there show up here.</span></div>
    </div>
  );
}

/* ------------------------------------------------------------------------ */

const CATEGORY = {
  foundation: "Slab and footings", frame: "Frame", roof: "Roof", cladding: "Outside walls", openings: "Windows and doors",
  interior: "Linings, floors and paint", joinery: "Robes and joinery", kitchen: "Kitchen", bathroom: "Bathrooms",
  services: "Electrical, plumbing and services", stairs: "Stairs", "wet area": "Waterproofing", outdoor: "Outdoor",
};

function CostPanel({ estimate: e, region }) {
  const [open, setOpen] = useState(null);
  const [allTrades, setAllTrades] = useState(false);
  const gross = grossTotal(e);
  const tax = gross - e.total;
  const rows = [
    ["Materials", e.materialsTotal, "with waste allowance"],
    ["Labour", e.labourTotal, "all trades"],
    ["Equipment and site", e.equipmentTotal, "hire, scaffold, bins"],
    ["Preliminaries", e.prelims, "site setup, supervision, insurance"],
    ["Builder's margin", e.margin, "15%"],
    ["Contingency", e.contingency, `${Math.round(e.contingencyPct * 100)}% for surprises`],
    ...(e.extrasTotal > 0 ? [["Extra items", e.extrasTotal, "decks, pools and more"]] : []),
    ...(e.landscapeTotal > 0 ? [["Landscaping", e.landscapeTotal, "at the landscaper's price"]] : []),
    ...(tax > 0 ? [[e.taxLabel, tax, ""]] : []),
  ];
  const groups = useMemo(() => {
    const m = new Map();
    for (const l of e.materialLines) {
      const k = l.category || "other";
      if (!m.has(k)) m.set(k, { key: k, total: 0, lines: [] });
      const g = m.get(k); g.total += l.total; g.lines.push(l);
    }
    return [...m.values()].sort((a, b) => b.total - a.total);
  }, [e]);
  const trades = [...e.labourLines].sort((a, b) => b.total - a.total);

  if (!(e.total > 0)) return <div className="m-empty"><h2 className="m-h2">Nothing to price yet</h2><p>Give the house some floor area on the Design tab.</p></div>;

  return (
    <div className="m-stack">
      <section className="m-card m-card-pad" aria-label="Where the money goes">
        <h2 className="m-h2">Where the money goes</h2>
        {rows.map(([label, value, hint], i) => (
          <div className="m-bar-row" key={label}>
            <div className="m-row-between m-num">
              <span><span style={{ fontWeight: 650 }}>{label}</span>{hint && <span className="m-control-hint">{hint}</span>}</span>
              <span style={{ fontWeight: 700 }}>{money(value, region)}</span>
            </div>
            <div className={"m-bar" + (i > 2 ? " is-lilac" : "")}><i style={{ width: `${Math.max(1.5, (value / gross) * 100)}%` }} /></div>
          </div>
        ))}
        <div className="m-row-between m-num" style={{ paddingTop: 12, fontWeight: 800, fontSize: 17 }}><span>Total</span><span>{money(gross, region)}</span></div>
      </section>

      <section className="m-card" aria-label="Labour by trade">
        <h2 className="m-h2" style={{ padding: "16px 16px 0" }}>Labour by trade</h2>
        <ul className="m-list">
          {(allTrades ? trades : trades.slice(0, 6)).map((t) => (
            <li key={t.tradeKey}><div className="m-list-row m-num" style={{ cursor: "default", minHeight: 52 }}>
              <span className="m-list-main">{t.trade}</span><span style={{ fontWeight: 700 }}>{money(t.total, region)}</span>
            </div></li>
          ))}
        </ul>
        {trades.length > 6 && <div style={{ padding: "0 16px 8px" }}><button className="m-link" onClick={() => setAllTrades((v) => !v)}>{allTrades ? "Show fewer" : `Show all ${trades.length} trades`}</button></div>}
      </section>

      <section className="m-card" aria-label="Materials">
        <h2 className="m-h2" style={{ padding: "16px 16px 0" }}>Materials</h2>
        <ul className="m-list">
          {groups.map((g) => (
            <li key={g.key}>
              <button className="m-list-row m-num" aria-expanded={open === g.key} onClick={() => setOpen(open === g.key ? null : g.key)} style={{ minHeight: 56 }}>
                <span className="m-list-main"><span className="m-list-title">{CATEGORY[g.key] || g.key}</span><span className="m-list-meta">{g.lines.length} item{g.lines.length === 1 ? "" : "s"}</span></span>
                <span style={{ fontWeight: 700 }}>{money(g.total, region)}</span>
                <ChevronRight size={18} style={{ transform: open === g.key ? "rotate(90deg)" : "none", transition: "transform .15s", color: "var(--m-ink2)" }} />
              </button>
              {open === g.key && (
                <div style={{ padding: "0 16px 12px", background: "var(--m-paper)" }}>
                  {[...g.lines].sort((a, b) => b.total - a.total).map((l, i) => (
                    <div key={i} className="m-row-between m-num" style={{ padding: "9px 0", borderBottom: "1px solid var(--m-rule)", fontSize: 14 }}>
                      <span style={{ minWidth: 0 }}>{l.label}<span className="m-control-hint">{Math.round(l.qty * 10) / 10} {l.unit} at {money(l.rate, region)}</span></span>
                      <span style={{ fontWeight: 650, whiteSpace: "nowrap" }}>{money(l.total, region)}</span>
                    </div>
                  ))}
                </div>
              )}
            </li>
          ))}
        </ul>
      </section>

      <div className="m-note"><Info size={16} /><span>Quantities come from the house you designed, priced at {region === "AU" ? "Australian" : region} rates for late 2026. It's an indicative estimate, not a fixed-price quote: get written quotes from licensed builders before you sign.</span></div>
    </div>
  );
}

/* ------------------------------------------------------------------------ */

function TimelinePanel({ estimate: e }) {
  const t = e.timeline || { totalWeeks: 0, stages: [] };
  if (!t.totalWeeks) return <div className="m-empty"><h2 className="m-h2">No programme yet</h2><p>Give the house some floor area on the Design tab.</p></div>;
  const months = Math.round((t.totalWeeks / 4.35) * 10) / 10;
  return (
    <div className="m-stack">
      <section className="m-card m-card-pad">
        <div className="m-price m-num" style={{ fontSize: 30 }}>{t.totalWeeks} weeks</div>
        <p className="m-sub">About {months} months on site, from slab to handover.</p>
      </section>
      <section className="m-card" aria-label="Build stages">
        <ul className="m-list">
          {t.stages.map((s) => (
            <li key={s.key || s.name}><div className="m-list-row" style={{ cursor: "default", display: "block" }}>
              <div className="m-row-between m-num"><span style={{ fontWeight: 650 }}>{s.name}</span><span className="m-small">{s.weeks} wk</span></div>
              <div className="m-gantt" aria-hidden="true"><i style={{ left: `${((s.startWeek - 1) / t.totalWeeks) * 100}%`, width: `${Math.max(2, (s.weeks / t.totalWeeks) * 100)}%` }} /></div>
              <span className="m-control-hint m-num">Weeks {s.startWeek} to {s.endWeek}</span>
            </div></li>
          ))}
        </ul>
      </section>
      <div className="m-note"><Info size={16} /><span>A typical programme with no weather or supply delays. Council or certifier approval (DA or CDC) comes before this and varies by council.</span></div>
    </div>
  );
}

/* ------------------------------------------------------------------------ */

function QuotePanel({ quote, setQuote, profile, onShare, sharing, onFindBuilder }) {
  const set = (k) => (ev) => setQuote((q) => ({ ...q, [k]: ev.target.value }));
  return (
    <div className="m-stack">
      <section className="m-card m-card-pad m-stack">
        <div>
          <label className="m-label" htmlFor="q-client">Prepared for</label>
          <input id="q-client" className="m-input" value={quote.client || ""} onChange={set("client")} placeholder="Client or your own name" autoComplete="name" />
        </div>
        <div>
          <label className="m-label" htmlFor="q-by">Prepared by</label>
          <input id="q-by" className="m-input" value={quote.preparedBy ?? (profile?.full_name || "")} onChange={set("preparedBy")} placeholder="Your name or business" />
        </div>
        <div>
          <label className="m-label" htmlFor="q-notes">Notes on the estimate</label>
          <textarea id="q-notes" className="m-input" rows={3} value={quote.notes || ""} onChange={set("notes")} placeholder="Inclusions, exclusions, anything the reader should know" />
        </div>
      </section>
      <section className="m-card m-card-pad">
        <h2 className="m-h2">The PDF</h2>
        <p className="m-sub" style={{ marginBottom: 14 }}>An A4 estimate with the total, where the money goes, labour by trade, the build programme and the largest material items. Send it by message, email or WhatsApp.</p>
        <button className="m-btn m-btn-block" onClick={onShare} disabled={sharing}><Share2 size={18} />{sharing ? "Making PDF…" : "Send the estimate"}</button>
      </section>
      <button className="m-card m-card-pad" onClick={onFindBuilder} style={{ display: "flex", alignItems: "center", gap: 12, width: "100%", textAlign: "left", color: "inherit", font: "inherit", cursor: "pointer" }}>
        <span className="m-list-main"><span className="m-list-title">Get it built</span><span className="m-list-meta">Find builders, house plans and prefab homes in the Marketplace.</span></span>
        <ChevronRight size={20} />
      </button>
    </div>
  );
}
