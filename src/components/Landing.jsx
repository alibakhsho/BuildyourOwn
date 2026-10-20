/* =========================================================================
   Landing — the front page.

   Daylight, not a dark control room: warm paper and sky, a real house
   turning slowly in the hero (the same engine and geometry the estimator
   uses, so the picture IS the product), plain-spoken copy, and the three
   plans laid out so nobody has to hunt for what they get.

   Sections: top bar · hero · who it's for · how it works (from App) ·
   plans · closing call to action.
   ========================================================================= */
import { useEffect, useMemo, useRef, useState } from "react";
import { motion, useScroll, useTransform, useReducedMotion } from "framer-motion";
import ScrollBuild from "./ScrollBuild.jsx";
import DroneScroll from "./DroneScroll.jsx";
import { colors as TOKENS, paletteFor, kebab } from "../design/system.js";

/* The front page is always in daylight, whatever theme the app is in: pin
   the light palette's CSS variables on this subtree so the shared buttons,
   plan cards and sign-in modal inside it render light too. */
const LIGHT_VARS = Object.fromEntries(Object.entries(paletteFor("light")).map(([k, v]) => [`--${kebab(k)}`, v]));
import { PlanCards, PLAN_SEGMENT, IntervalToggle, UpgradeModal } from "./Plans.jsx";
import { hasSubscription, canPayHere } from "../lib/billing.js";
import { AccountButton } from "./AuthModal.jsx";
import AuthModal from "./AuthModal.jsx";
import BYOLogo from "./ui/BYOLogo.jsx";
import { useAuth } from "../state/auth.jsx";
import { TRIAL_DAYS } from "../lib/entitlements.js";
import { Estimator } from "../logic/estimator.js";


/* The house in the hero: a two-storey brick home with a garage and solar,
   built by the real engine from a real spec. */
const HERO_SPEC = {
  widthM: 11, lengthM: 13, floors: 2, wallHeightM: 2.7, roofPitch: 24, slabThicknessM: 0.1,
  siteCondition: "flat", framingType: "timber", roofType: "colorbond", claddingType: "brick", floorFinish: "timber",
  hasGarage: true, solar: true, staircaseType: "timber",
  openings: { windowsCount: 12, windowsM2: 17, doors: 2 },
  rooms: [], kitchens: [], bathrooms: [], extras: [],
};

const AUDIENCES = [
  { id: "homeowner", plan: "Homeowner · free", title: "Building or renovating your own home",
    body: "Put in your plans or just the size of the house. See what it should cost, trade by trade, before you sit down with a builder." },
  { id: "tradie", plan: "Tradie", trial: true, title: "Quoting jobs every week",
    body: "Price a whole house or any custom job from your own rates, and send a clean quote the client can say yes to." },
  { id: "builder", plan: "Builder", trial: true, title: "Running several builds at once",
    body: "Quote a duplex or a 40-lot estate in one go, cost an apartment block, then run every job from Site Office." },
];

export default function Landing({ onStart, onPickAudience, onSignedIn, onMarketplace, region, setRegion, howItWorks }) {
  const { user, profile, can, enabled } = useAuth();
  const [auth, setAuth] = useState(null);         // { mode, intent }
  // Outlives the modal, which closes itself on a successful sign-up before
  // the account has loaded.
  const [armed, setArmed] = useState(false);
  const [interval, setBillingInterval] = useState("month");
  const [plansOpen, setPlansOpen] = useState(false);
  /* Tradie / Builder: a guest signs up for that plan's free trial first, then
     lands on their dashboard; anyone already signed in (or a build without
     accounts) goes straight through — App switches their plan. */
  const pick = (id) => {
    if (id !== "homeowner" && enabled && !user) { setAuth({ mode: "signup", intent: id }); setArmed(true); return; }
    onPickAudience(id);
  };
  // After that sign-up/in, wait for the profile, then go to the dashboard.
  useEffect(() => {
    if (armed && user && profile) { setArmed(false); setAuth(null); onSignedIn?.(); }
  }, [armed, user, profile, onSignedIn]);
  const plansRef = useRef(null);
  // The hero numbers are a real estimate of the house on screen, not copy.
  const est = useMemo(() => Estimator.buildEstimate(HERO_SPEC, region), [region]);
  // hero drifts and fades as it scrolls away — depth, not decoration
  const reduced = useReducedMotion();
  const { scrollY } = useScroll();
  const heroCopyY = useTransform(scrollY, [0, 700], [0, reduced ? 0 : -60]);
  const heroFade = useTransform(scrollY, [0, 600], [1, reduced ? 1 : 0.35]);

  return (
    <div style={{ ...LIGHT_VARS, background: "linear-gradient(180deg, #F3EEE4 0%, #F7F4EE 46%, #FFFFFF 100%)", color: "#14171A" }}>
      <style>{`
        .lp-wrap { max-width: 1240px; margin: 0 auto; padding: 0 24px; }
        .lp-hero { display: flex; justify-content: center; text-align: center; padding: 72px 0 88px; }
        .lp-hero .lp-lead { margin-left: auto; margin-right: auto; }
        .lp-hero-row { justify-content: center; }
        .lp-h1 { font-family: 'Plus Jakarta Sans', sans-serif; font-weight: 800; font-size: clamp(38px, 5.2vw, 70px); line-height: 1.04; letter-spacing: -0.035em; margin: 0 0 20px; }
        .lp-lead { font-size: 18px; line-height: 1.6; color: #4A4F55; max-width: 34em; margin: 0 0 28px; }
        .lp-cta { display: inline-flex; align-items: center; gap: 10px; padding: 16px 26px; border-radius: 999px; border: none; cursor: pointer; font: 600 15px 'Plus Jakarta Sans', sans-serif; }
        .lp-cta-main { background: #14171A; color: #fff; box-shadow: 0 10px 24px rgba(20,23,26,0.22); }
        .lp-cta-main:hover { background: #2a2f35; }
        .lp-cta-alt { background: transparent; color: #14171A; border: 1.5px solid rgba(20,23,26,0.25); }
        .lp-cta-alt:hover { border-color: #14171A; }
        .lp-section { padding: 80px 0; }
        .lp-h2 { font-family: 'Plus Jakarta Sans', sans-serif; font-weight: 800; font-size: clamp(28px, 3.4vw, 42px); line-height: 1.1; letter-spacing: -0.03em; margin: 0 0 14px; }
        .lp-aud { display: grid; grid-template-columns: repeat(3, 1fr); gap: 18px; }
        .lp-card { background: #fff; border-radius: 20px; padding: 26px; border: 1px solid rgba(20,23,26,0.08); box-shadow: 0 6px 20px rgba(20,23,26,0.05); cursor: pointer; transition: transform .2s, box-shadow .2s; text-align: left; font: inherit; color: inherit; }
        .lp-card:hover { transform: translateY(-4px); box-shadow: 0 16px 36px rgba(20,23,26,0.1); }
        .lp-top { display: flex; align-items: center; justify-content: space-between; gap: 16px; padding: 18px 0; flex-wrap: wrap; }
        .lp-nav a { color: #14171A; text-decoration: none; font: 500 14px 'Plus Jakarta Sans', sans-serif; opacity: .75; }
        .lp-nav a:hover { opacity: 1; }
        .lp-mk-m { display: none; }
        @media (max-width: 900px) {
          .lp-mk-m { display: inline-flex; }
          .lp-hero { padding: 40px 0 56px; }
          .lp-aud { grid-template-columns: 1fr; }
          .lp-nav { display: none !important; }
          .lp-section { padding: 56px 0; }
        }
      `}</style>

      {/* ---- top bar ---- */}
      <div className="lp-wrap">
        <div className="lp-top">
          <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
            <BYOLogo size={34} />
            <span style={{ fontFamily: "'Plus Jakarta Sans', sans-serif", fontWeight: 800, fontSize: 20, letterSpacing: "0.02em" }}>BUILD YOUR OWN</span>
          </div>
          <nav className="lp-nav" style={{ display: "flex", gap: 26 }}>
            <a href="#how" onClick={(e) => { e.preventDefault(); document.getElementById("how")?.scrollIntoView({ behavior: "smooth" }); }}>How it works</a>
            <a href="#plans" onClick={(e) => { e.preventDefault(); plansRef.current?.scrollIntoView({ behavior: "smooth" }); }}>Plans</a>
            {onMarketplace && <a href="#marketplace" onClick={(e) => { e.preventDefault(); onMarketplace(); }}>Marketplace</a>}
          </nav>
          <div style={{ display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap" }}>
            {/* The nav above is hidden on phones; the marketplace keeps a way in. */}
            {onMarketplace && (
              <button className="lp-mk-m" onClick={onMarketplace}
                style={{ alignItems: "center", padding: "7px 13px", borderRadius: 999, border: "1px solid rgba(20,23,26,0.2)", background: "transparent",
                  cursor: "pointer", font: "600 12px 'Plus Jakarta Sans', sans-serif", color: "#14171A" }}>
                Marketplace
              </button>
            )}
            <AccountButton onSignedIn={onSignedIn} />
            <div role="group" aria-label="Region" style={{ display: "flex", border: "1px solid rgba(20,23,26,0.2)", borderRadius: 999, overflow: "hidden" }}>
              {["AU", "US", "UK"].map((r) => (
                <button key={r} onClick={() => setRegion(r)} aria-pressed={region === r}
                  style={{ padding: "6px 11px", border: "none", cursor: "pointer", font: "600 11px 'Plus Jakarta Sans', sans-serif",
                    background: region === r ? "#14171A" : "transparent", color: region === r ? "#fff" : "#14171A" }}>{r}</button>
              ))}
            </div>
          </div>
        </div>

      </div>

      {/* ---- opening flight: scroll-driven drone shot from the logo ---- */}
      <DroneScroll onStart={onStart} />

      <div className="lp-wrap">
        {/* ---- hero ---- */}
        <section className="lp-hero">
          <motion.div style={{ y: heroCopyY, opacity: heroFade }}>
          <motion.div initial={{ opacity: 0, y: 18 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.5 }}>
            <div style={{ display: "inline-flex", alignItems: "center", gap: 8, padding: "7px 14px", borderRadius: 999, background: "rgba(245,197,24,0.22)", font: "600 12px 'Plus Jakarta Sans', sans-serif", marginBottom: 22 }}>
              <span style={{ width: 7, height: 7, borderRadius: 99, background: TOKENS.hivisDeep }} /> Free for homeowners · no sign-up to start
            </div>
            <h1 className="lp-h1">Know what your build will cost — <span style={{ color: "#C2570A" }}>before you break ground.</span></h1>
            <p className="lp-lead">
              Tell us the size of the house, or drop in your plans. Watch it go up in 3D, see every trade priced at today's rates, and walk away with a quote you can actually use.
            </p>
            <div style={{ display: "flex", gap: 12, flexWrap: "wrap", justifyContent: "center" }}>
              <button className="lp-cta lp-cta-main" onClick={onStart}>Price my build — it's free →</button>
              <button className="lp-cta lp-cta-alt" onClick={() => plansRef.current?.scrollIntoView({ behavior: "smooth" })}>For tradies &amp; builders</button>
            </div>
            <div style={{ display: "flex", gap: 22, marginTop: 28, flexWrap: "wrap", justifyContent: "center", font: "500 13px 'Plus Jakarta Sans', sans-serif", color: "#5A6067" }}>
              <span style={{ display: "inline-flex", alignItems: "center", gap: 7 }}><span style={{ color: "#157F3C", display: "inline-flex" }}><svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" style={{ flexShrink: 0, marginTop: 0 }}><path d="M20 6L9 17l-5-5" /></svg></span>AU, US &amp; UK rates</span><span style={{ display: "inline-flex", alignItems: "center", gap: 7 }}><span style={{ color: "#157F3C", display: "inline-flex" }}><svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" style={{ flexShrink: 0, marginTop: 0 }}><path d="M20 6L9 17l-5-5" /></svg></span>GST shown, not hidden</span><span style={{ display: "inline-flex", alignItems: "center", gap: 7 }}><span style={{ color: "#157F3C", display: "inline-flex" }}><svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" style={{ flexShrink: 0, marginTop: 0 }}><path d="M20 6L9 17l-5-5" /></svg></span>Works on your phone</span>
            </div>
          </motion.div>
          </motion.div>

        </section>
      </div>

      {/* ---- scroll-driven build of the same house ---- */}
      <ScrollBuild spec={HERO_SPEC} est={est} region={region} />

      {/* ---- who it's for ---- */}
      <section className="lp-section" style={{ background: "#fff" }}>
        <div className="lp-wrap">
          <h2 className="lp-h2">Made for whoever's doing the building.</h2>
          <p style={{ fontSize: 16, color: "#5A6067", margin: "0 0 32px", maxWidth: "60ch" }}>Pick the one that sounds like you — you'll land in the right place.</p>
          <div className="lp-aud">
            {AUDIENCES.map((a, i) => (
              <motion.button key={a.id} className="lp-card" onClick={() => pick(a.id)}
                initial={{ opacity: 0, y: 24 }} whileInView={{ opacity: 1, y: 0 }} viewport={{ once: true, amount: 0.3 }} transition={{ delay: i * 0.08 }}>
                <div style={{ font: "600 12px 'Plus Jakarta Sans', sans-serif", color: TOKENS.emberInk, marginBottom: 10 }}>{a.plan}</div>
                <div style={{ fontFamily: "'Plus Jakarta Sans', sans-serif", fontWeight: 700, fontSize: 26, lineHeight: 1.05, marginBottom: 10 }}>{a.title}</div>
                <p style={{ fontSize: 14.5, lineHeight: 1.6, color: "#4A4F55", margin: "0 0 18px" }}>{a.body}</p>
                <span style={{ font: "600 14px 'Plus Jakarta Sans', sans-serif" }}>
                  {a.trial && can.trialAvailable && can.tier === "free" ? `Try it free for ${TRIAL_DAYS} days →` : "Start here →"}
                </span>
              </motion.button>
            ))}
          </div>
        </div>
      </section>

      {howItWorks}

      {/* ---- plans ---- */}
      <section className="lp-section" id="plans" ref={plansRef} style={{ background: "#F7F4EE" }}>
        <div className="lp-wrap">
          <h2 className="lp-h2">Simple plans. Start free.</h2>
          <p style={{ fontSize: 16, color: "#5A6067", margin: "0 0 32px", maxWidth: "64ch" }}>
            Homeowners never pay to estimate their own build. Tradies and builders pay for the tools that win and run jobs — and can try either free for {TRIAL_DAYS} days, no card. Prices in AUD, ex GST.
          </p>
          {canPayHere && <div style={{ marginBottom: 18 }}><IntervalToggle value={interval} onChange={setBillingInterval} /></div>}
          <PlanCards current={user ? can.tier : null} onTrial={can.onTrial} trialAvailable={can.trialAvailable}
            subscribed={hasSubscription(profile)} interval={interval}
            onChoose={(id) => (id === "free" ? onStart()
              // guests sign up for the trial; signed-in accounts that can still
              // trial go straight in; anyone else picks and pays in the plans view
              : !user || can.trialAvailable ? pick(PLAN_SEGMENT[id])
              : setPlansOpen(true))} />
        </div>
      </section>

      {/* ---- closing ---- */}
      <section className="lp-section" style={{ background: "#14171A", color: "#fff", textAlign: "center" }}>
        <div className="lp-wrap">
          <h2 className="lp-h2" style={{ color: "#fff" }}>Your first estimate takes about two minutes.</h2>
          <p style={{ fontSize: 16, color: "rgba(255,255,255,0.7)", margin: "0 auto 28px", maxWidth: "52ch" }}>No account, no credit card. Save it to an account later if you want it on your other devices.</p>
          <button className="lp-cta" style={{ background: TOKENS.hivis, color: "#14171A" }} onClick={onStart}>Price my build →</button>
        </div>
      </section>
      {auth && <AuthModal initialMode={auth.mode} intent={auth.intent} onClose={() => setAuth(null)} />}
      {plansOpen && <UpgradeModal onClose={() => setPlansOpen(false)} />}
    </div>
  );
}
