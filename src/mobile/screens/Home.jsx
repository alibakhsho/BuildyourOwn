/* =========================================================================
   mobile/screens/Home.jsx — the first screen
   Value before sign-up: describe a house or tap a design and it opens in
   3D with its price. Every design card shows what that house costs right
   now, worked out on the phone from the same rates as the estimate.
   ========================================================================= */
import { useMemo, useState } from "react";
import { CircleUser, ChevronRight, House, HardHat } from "lucide-react";
import BYOLogo from "../../components/ui/BYOLogo.jsx";
import { Estimator } from "../../logic/estimator.js";
import { createProject, listProjects } from "../../state/projects.js";
import { readDescription } from "../../components/DescribeCard.jsx";
import { applyHouseResult } from "../../logic/describe-apply.js";
import { useAuth } from "../../state/auth.jsx";
import { track } from "../../lib/analytics.js";
import { HOME_PRESETS, starterSpec, houseSummary, bedroomsOf } from "../house.js";
import { money, moneyShort, grossTotal } from "../ui.jsx";

const nameFor = (spec) => `${bedroomsOf(spec)}-bed ${(spec.floors || 1) > 1 ? "two-storey " : ""}home`;

export default function HomeScreen({ region, onOpen, onAccount, onAllBuilds, onBuilderPlans, describeRef }) {
  const { can } = useAuth();
  const [text, setText] = useState("");
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState("");
  const recent = useMemo(() => listProjects().slice(0, 3), []);

  const designs = useMemo(() => HOME_PRESETS.map((p) => {
    const spec = p.buildSpec();
    return { p, spec, total: grossTotal(Estimator.buildEstimate(spec, region)) };
  }), [region]);

  const startFrom = (spec, name, via) => {
    const proj = createProject({ name, userType: "homeowner", buildMode: "residential", region, spec });
    track("mobile_build_started", { via, region });
    onOpen(proj.id);
  };

  const describe = async () => {
    const t = text.trim();
    if (!t || busy) return;
    setBusy(true); setMsg("");
    const base = starterSpec();
    const r = await readDescription("residential", t, base, !!can.ai);
    setBusy(false);
    if (!r.found) { setMsg("Tell me a little more, like the bedrooms or the size: “3 bed 2 bath brick, about 200 m²”."); return; }
    const { spec } = applyHouseResult(base, r, region);
    startFrom(spec, nameFor(spec), "describe");
  };

  return (
    <div>
      <header className="m-top">
        <BYOLogo size={30} />
        <span className="m-top-title" style={{ fontWeight: 800, letterSpacing: "-0.01em" }}>Build Your Own</span>
        <button className="m-icon-btn" onClick={onAccount} aria-label="Account"><CircleUser size={24} /></button>
      </header>

      <div className="m-pad">
        <h1 className="m-h1" style={{ marginTop: 8 }}>Know what your house will cost before you call a builder.</h1>
        <p className="m-sub" style={{ marginTop: 10 }}>See it in 3D, priced item by item at Australian rates, with a build timeline and an estimate you can send. Free.</p>

        <section className="m-card m-card-pad" style={{ marginTop: 20 }} aria-label="Describe your house">
          <label className="m-label" htmlFor="m-describe">Describe your house</label>
          <textarea id="m-describe" ref={describeRef} className="m-input" rows={3} value={text} onChange={(e) => setText(e.target.value)}
            placeholder="e.g. 4 bed 2 bath double storey brick, about 250 m², double garage, solar" />
          <button className="m-btn m-btn-block" style={{ marginTop: 12 }} onClick={describe} disabled={busy || !text.trim()}>
            {busy ? "Working it out…" : "See it and price it"}
          </button>
          {msg && <p className="m-small" role="status" style={{ margin: "10px 0 0", color: "var(--m-coral-ink)" }}>{msg}</p>}
        </section>

        <section className="m-section" aria-label="Start from a design">
          <h2 className="m-h2">Or start from a design</h2>
          <div className="m-rail">
            {designs.map(({ p, spec, total }) => (
              <button key={p.id} className="m-design" onClick={() => startFrom(p.buildSpec(), p.label.replace(/ \(.+\)$/, ""), `preset:${p.id}`)}>
                <span className="m-thumb" aria-hidden="true"><House size={22} /></span>
                <div style={{ fontWeight: 750, marginTop: 12 }}>{p.label.replace(/ \(.+\)$/, "")}</div>
                <div className="m-small">{houseSummary(spec)}</div>
                <div className="m-design-price m-num">{moneyShort(total, region)}</div>
                <div className="m-small">estimated, incl. GST</div>
              </button>
            ))}
          </div>
        </section>

        {recent.length > 0 && (
          <section className="m-section" aria-label="Your builds">
            <div className="m-row-between"><h2 className="m-h2" style={{ margin: 0 }}>Your builds</h2><button className="m-link" onClick={onAllBuilds}>See all</button></div>
            <ul className="m-list m-card" style={{ marginTop: 8 }}>
              {recent.map((p) => (
                <li key={p.id}>
                  <button className="m-list-row" onClick={() => onOpen(p.id)}>
                    <span className="m-thumb" aria-hidden="true"><House size={20} /></span>
                    <span className="m-list-main"><span className="m-list-title" style={{ display: "block" }}>{p.name}</span><span className="m-list-meta">{p.spec ? houseSummary(p.spec) : "Open to see it"}</span></span>
                    {p.buildMode === "residential" && p.spec && <span className="m-num" style={{ fontWeight: 700 }}>{money(grossTotal(Estimator.buildEstimate(p.spec, p.region || region)), p.region || region)}</span>}
                  </button>
                </li>
              ))}
            </ul>
          </section>
        )}

        <section className="m-section" aria-label="For tradies and builders">
          <button className="m-card m-card-pad" onClick={onBuilderPlans}
            style={{ display: "flex", gap: 14, alignItems: "center", width: "100%", textAlign: "left", color: "inherit", font: "inherit", cursor: "pointer" }}>
            <span className="m-thumb" style={{ background: "var(--m-coral-wash)", color: "var(--m-coral-ink)" }} aria-hidden="true"><HardHat size={22} /></span>
            <span className="m-list-main">
              <span className="m-list-title" style={{ display: "block" }}>For tradies and builders</span>
              <span className="m-list-meta">Quote jobs line by line, then run them from site: diary with photos, variations and job numbers. Free for 14 days.</span>
            </span>
            <ChevronRight size={20} />
          </button>
        </section>
        <div style={{ height: 16 }} />
      </div>
    </div>
  );
}
