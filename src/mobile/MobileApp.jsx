/* =========================================================================
   mobile/MobileApp.jsx — the phone app
   ------------------------------------------------------------------------
   Built the way the best-rated phone apps in this space are: a few bottom
   tabs for the places you work in (Home, Builds, Jobs for builders, Market),
   one thing per screen, and the account behind the avatar. It runs on the
   same estimator, 3D engine, project store, Site Office store, accounts and
   marketplace as the full app (App.jsx); only the screens differ. What a
   phone does badly (takeoffs, imports, multi-dwelling and developer
   estimates, the drawing set, the 3D Studio) stays in the full version,
   one tap away under Account.

   Navigation is plain React state. Android Back and the browser's Back
   both step out one level: a sheet, then a screen, then to Home, then out.
   If Android closes the app in the background, the next launch reopens
   the build or job that was on screen.
   ========================================================================= */
import { useCallback, useEffect, useRef, useState } from "react";
import { House, LayoutGrid, Store, HardHat, CircleUser, Monitor } from "lucide-react";
import { GLOBAL_CSS } from "../design/global-css.js";
import { M_CSS } from "./mobile-css.js";
import { useAuth } from "../state/auth.jsx";
import AuthModal, { Onboarding, AuthLinks } from "../components/AuthModal.jsx";
import BillingReturn from "../components/BillingReturn.jsx";
import { UpgradeModal } from "../components/Plans.jsx";
import LegalPage, { LEGAL_DOCS } from "../components/LegalPage.jsx";
import Marketplace from "../modules/Marketplace.jsx";
import { isNative, useNativeBack } from "../lib/native.js";
import { closeTopDialog } from "../lib/back-stack.js";
import { getProject } from "../state/projects.js";
import { migrateLegacyProjects } from "../state/cm.js";
import { MODE_LABEL } from "../lib/entitlements.js";
import { switchLayout } from "./layout.js";
import { Sheet, useToast } from "./ui.jsx";
import HomeScreen from "./screens/Home.jsx";
import BuildsScreen from "./screens/Builds.jsx";
import BuildScreen from "./screens/Build.jsx";
import JobsScreen from "./screens/Jobs.jsx";
import AccountScreen from "./screens/Account.jsx";

const WHERE = "byo.m.where";      // { tab, build, job, at } — reopened after Android kills the app
const REGION = "byo.m.region";
const RESTORE_WITHIN = 30 * 60 * 1000;

function initialState() {
  let q = null;
  try { q = new URLSearchParams(window.location.search); } catch { /* no URL API */ }
  const page = q?.get("page");
  const legal = page && Object.prototype.hasOwnProperty.call(LEGAL_DOCS, page) ? page : null;
  if (q?.get("open") === "market") return { tab: "market", build: null, job: null, legal, marketMine: true };
  try {
    const w = JSON.parse(localStorage.getItem(WHERE) || "null");
    if (w && Date.now() - (w.at || 0) < RESTORE_WITHIN) {
      // only reopen a build that still exists and is a house (the phone edits nothing else)
      const p = w.build ? getProject(w.build) : null;
      const build = p && (!p.buildMode || p.buildMode === "residential") ? p.id : null;
      return { tab: w.tab || "home", build, job: w.job || null, legal, marketMine: false };
    }
  } catch { /* nothing to restore */ }
  return { tab: "home", build: null, job: null, legal, marketMine: false };
}

export default function MobileApp() {
  const { can } = useAuth();
  const [boot] = useState(initialState);
  const [tab, setTab] = useState(boot.tab);
  const [build, setBuild] = useState(boot.build);
  const [job, setJob] = useState(boot.job);
  const [legal, setLegal] = useState(boot.legal);
  const [account, setAccount] = useState(false);
  const [upgrade, setUpgrade] = useState(null);
  const [auth, setAuth] = useState(null);
  const [desktopOnly, setDesktopOnly] = useState(null); // a project the phone can't open
  const [region, setRegionState] = useState(() => { try { return localStorage.getItem(REGION) || "AU"; } catch { return "AU"; } });
  const [toastNode, toast] = useToast();
  const marketBack = useRef(null);
  const describeRef = useRef(null);
  const pushed = useRef(0);          // browser history entries this app added (web only)

  const setRegion = (r) => { setRegionState(r); try { localStorage.setItem(REGION, r); } catch { /* not remembered */ } };
  const showJobs = !!can.siteOffice;

  // remember where we are, so a relaunch after Android closed the app lands here
  useEffect(() => {
    try { localStorage.setItem(WHERE, JSON.stringify({ tab, build, job, at: Date.now() })); } catch { /* not remembered */ }
  }, [tab, build, job]);
  // drop the one-time ?open= / ?page= from the address
  useEffect(() => {
    try {
      const u = new URL(window.location.href);
      if (u.searchParams.has("open") || u.searchParams.has("page")) {
        u.searchParams.delete("open"); u.searchParams.delete("page");
        window.history.replaceState(null, "", u.href);
      }
    } catch { /* cosmetic */ }
  }, []);
  // a plan change can take Jobs away
  useEffect(() => { if (tab === "jobs" && !showJobs) { setTab("home"); setJob(null); } }, [tab, showJobs]);
  // builders see their estimator projects as jobs, as Site Office does on a computer
  useEffect(() => { if (showJobs) { try { migrateLegacyProjects(); } catch { /* store unavailable */ } } }, [showJobs]);

  /* Step out one level. Returns "dialog" when only a dialog closed (the
     screen stays), "screen" when a screen closed, false at the top. */
  const stepBack = useCallback(() => {
    if (closeTopDialog()) return "dialog";
    if (upgrade) { setUpgrade(null); return "dialog"; }
    if (desktopOnly) { setDesktopOnly(null); return "dialog"; }
    if (legal) { setLegal(null); return "screen"; }
    if (account) { setAccount(false); return "screen"; }
    if (build) { setBuild(null); return "screen"; }
    if (job) { setJob(null); return "screen"; }
    if (tab === "market" && marketBack.current?.()) return "dialog";
    if (tab !== "home") { setTab("home"); return "screen"; }
    return false;
  }, [upgrade, desktopOnly, legal, account, build, job, tab]);

  useNativeBack(() => !!stepBack());

  // the browser's Back (a phone browser, not the app): one entry per screen opened
  const stepRef = useRef(stepBack);
  stepRef.current = stepBack;
  useEffect(() => {
    if (isNative) return;
    const onPop = () => {
      if (pushed.current > 0) pushed.current--;
      const r = stepRef.current();
      if (r === "dialog") { window.history.pushState({ byo: 1 }, ""); pushed.current++; } // the screen keeps its entry
    };
    window.addEventListener("popstate", onPop);
    return () => window.removeEventListener("popstate", onPop);
  }, []);
  const opened = () => { if (!isNative) { window.history.pushState({ byo: 1 }, ""); pushed.current++; } };
  const closeScreen = () => { if (!isNative && pushed.current > 0) window.history.back(); else stepBack(); };

  const openBuild = useCallback((id) => {
    const p = getProject(id);
    if (!p) { toast("That build isn't on this phone."); return; }
    if (p.buildMode && p.buildMode !== "residential") { setDesktopOnly(p); return; }
    setBuild(id); opened(); window.scrollTo({ top: 0 });
  }, [toast]); // eslint-disable-line react-hooks/exhaustive-deps
  const openJob = (id) => { setJob(id); opened(); window.scrollTo({ top: 0 }); };
  const openAccount = () => { setAccount(true); opened(); window.scrollTo({ top: 0 }); };
  const openLegal = (doc) => { setLegal(doc); opened(); window.scrollTo({ top: 0 }); };
  const goTab = (t) => { setTab(t); setJob(null); window.scrollTo({ top: 0 }); };
  const builderPlans = () => setUpgrade("siteOffice");
  const findBuilder = () => { setBuild(null); setTab("market"); window.scrollTo({ top: 0 }); };

  const tabs = [
    { id: "home", label: "Home", icon: House },
    { id: "builds", label: "Builds", icon: LayoutGrid },
    ...(showJobs ? [{ id: "jobs", label: "Jobs", icon: HardHat }] : []),
    { id: "market", label: "Market", icon: Store },
  ];

  let screen;
  let withTabs = true;
  if (legal) {
    withTabs = false;
    screen = <div style={{ paddingTop: "env(safe-area-inset-top)" }}><LegalPage doc={legal} onBack={closeScreen} onOpen={(d) => setLegal(d)} /></div>;
  } else if (account) {
    screen = <AccountScreen region={region} setRegion={setRegion} onBack={closeScreen} onPlans={() => setUpgrade("ai")} onLegal={openLegal} />;
  } else if (build) {
    withTabs = false;
    screen = <BuildScreen key={build} id={build} onClose={closeScreen} onFindBuilder={findBuilder} toast={toast} />;
  } else if (tab === "builds") {
    screen = <BuildsScreen region={region} onOpen={openBuild} onSignIn={() => setAuth("signin")} onAccount={openAccount} />;
  } else if (tab === "jobs" && showJobs) {
    screen = <JobsScreen jobId={job} onOpenJob={openJob} onBack={closeScreen} onAccount={openAccount} toast={toast} />;
  } else if (tab === "market") {
    screen = (
      <div>
        <header className="m-top">
          <span className="m-top-title" style={{ fontSize: 22, fontWeight: 800, paddingLeft: 4 }}>Marketplace</span>
          <button className="m-icon-btn" onClick={openAccount} aria-label="Account"><CircleUser size={24} /></button>
        </header>
        <div className="m-market">
          <Marketplace onUpgrade={setUpgrade} backRef={marketBack} initialTab={boot.marketMine ? "mine" : "browse"} />
        </div>
      </div>
    );
  } else {
    screen = <HomeScreen region={region} onOpen={openBuild} onAccount={openAccount} onAllBuilds={() => goTab("builds")} onBuilderPlans={showJobs ? () => goTab("jobs") : builderPlans} describeRef={describeRef} />;
  }

  return (
    <div className={"m-app" + (withTabs ? "" : " m-no-tabs")}>
      <style>{GLOBAL_CSS}</style>
      <style>{M_CSS}</style>
      {/* Emailed links (password reset), and coming back from Stripe. */}
      <AuthLinks />
      <BillingReturn />
      <Onboarding />

      {screen}

      {withTabs && !account && (
        <nav className="m-tabbar" aria-label="Main">
          {tabs.map(({ id, label, icon: Icon }) => (
            <button key={id} className="m-tab" aria-current={tab === id ? "page" : undefined} onClick={() => goTab(id)}>
              <span className="m-tab-ico"><Icon size={22} strokeWidth={tab === id ? 2.4 : 2} /></span>{label}
            </button>
          ))}
        </nav>
      )}

      {desktopOnly && (
        <Sheet title={desktopOnly.name} onClose={() => setDesktopOnly(null)}>
          <p className="m-sub" style={{ marginBottom: 16 }}>
            This is a {MODE_LABEL[desktopOnly.buildMode]?.toLowerCase() || "custom"} project. Those have more inputs than fit on a phone, so they open in the full version.
          </p>
          <button className="m-btn m-btn-block" onClick={() => switchLayout("full")}><Monitor size={18} />Open the full version</button>
        </Sheet>
      )}
      {upgrade && <UpgradeModal feature={upgrade} onClose={() => setUpgrade(null)} />}
      {auth && <AuthModal initialMode={auth} onClose={() => setAuth(null)} />}
      {toastNode}
    </div>
  );
}
