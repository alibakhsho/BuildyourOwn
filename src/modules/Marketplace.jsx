/* =========================================================================
   MODULE: modules/Marketplace.jsx
   The marketplace: house plans and prefab modules from builders, and the
   builders, tradies and designers behind them with their portfolios.

     Browse        live plans and prefab modules, filtered by type and state
     Pros          builders, tradies and designers, with their finished jobs
     Listing       one plan/module: photos, what's in the price, enquire
     Profile       one pro: about, licence, portfolio, their listings
     My market     the seller dashboard — enquiries, listings, portfolio,
                   profile — and, for buyers, the enquiries they've sent

   BuildYourOwn is the platform, not a party to the build: the pages say so,
   and point buyers at the builder's licence so they can check it. No money
   changes hands here yet; a buyer sends an enquiry. Our fee is 1.5% of a
   signed build contract, and discussed on contract for plans and modules.

   Visual language follows the Site Office dashboard: a hairline grid of
   flush cards (`gap-px bg-rule`), mono labels, one hi-vis accent.
   ========================================================================= */

import React, { useCallback, useEffect, useState } from "react";
import {
  ArrowLeft, BadgeCheck, Bath, BedDouble, Building2, Eye, FileSignature, FileText, Hammer, ImagePlus, Inbox, Layers,
  MapPin, Plus, Ruler, Search, Store, Timer, Trash2, Truck, X,
} from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { useAuth } from "../state/auth.jsx";
import AuthModal from "../components/AuthModal.jsx";
import ContractDialog from "../components/ContractDialog.jsx";
import { useBackClose, closeTopDialog } from "../lib/back-stack.js";
import { LEGAL, versionDate } from "../legal/company.js";
import { SITE_URL } from "../lib/public-config.js";
import { planRank } from "../lib/entitlements.js";
import { track } from "../lib/analytics.js";
import * as MK from "../state/marketplace.js";
import {
  STATES, LISTING_KINDS, SALE_MODES, PRO_KINDS, PREFAB_SITE_WORKS, PLATFORM_FEES,
  publishProblems, fieldProblems, listingFeeLabel, prefabExtras, priceLabel, sellerStats,
  CONTRACT_STATUS, contractEditable, feeSummary, dollars,
} from "../logic/marketplace.js";


/* ---- tiny async helper: load, keep the error, reload on demand -------- */
/* `ready` is true once the CURRENT deps have loaded at least once, so a
   change of deps (signing in, opening another listing) never renders the
   previous user's or page's data, while a reload keeps the old data on
   screen instead of flashing skeletons. */
function useLoad(fn, deps) {
  const key = JSON.stringify(deps);
  const [state, setState] = useState({ key: null, loading: true, data: null, error: "" });
  const [n, setN] = useState(0);
  useEffect(() => {
    let live = true;
    setState((s) => ({ ...s, loading: true, error: "" }));
    fn().then(
      (data) => live && setState({ key, loading: false, data, error: "" }),
      (e) => live && setState({ key, loading: false, data: null, error: e.message || "Couldn't load." }),
    );
    return () => { live = false; };
  }, [key, n]); // eslint-disable-line react-hooks/exhaustive-deps
  const ready = state.key === key;
  return {
    ready,
    loading: !ready || state.loading,
    data: ready ? state.data : null,
    error: ready ? state.error : "",
    reload: useCallback(() => setN((x) => x + 1), []),
  };
}

/* ======================================================================== */

export default function Marketplace({ onUpgrade, backRef, initialTab = "browse" }) {
  // { name: "browse" | "pros" | "listing" | "pro" | "mine", id? }
  const [route, setRoute] = useState({ name: initialTab });
  const [history, setHistory] = useState([]);
  const go = (next) => { setHistory((h) => [...h, route]); setRoute(next); window.scrollTo({ top: 0 }); };
  const back = () => { setRoute(history[history.length - 1] || { name: "browse" }); setHistory((h) => h.slice(0, -1)); window.scrollTo({ top: 0 }); };
  const tab = (name) => { setHistory([]); setRoute({ name }); window.scrollTo({ top: 0 }); };

  // Phone Back: close the top dialog, then step back through the
  // marketplace's own pages; only then let the app leave the marketplace.
  useEffect(() => {
    if (!backRef) return;
    backRef.current = () => {
      if (closeTopDialog()) return true;
      if (history.length) { back(); return true; }
      if (route.name !== "browse") { tab("browse"); return true; }
      return false;
    };
    return () => { backRef.current = null; };
  });

  if (!MK.marketplaceAvailable()) {
    return <Shell route={route} onTab={tab}><Notice>The marketplace needs an internet connection. Check you're online and try again.</Notice></Shell>;
  }

  return (
    <Shell route={route} onTab={tab}>
      {route.name === "browse" && <Browse onOpen={(id) => go({ name: "listing", id })} onPros={() => tab("pros")} />}
      {route.name === "pros" && <Pros onOpen={(id) => go({ name: "pro", id })} />}
      {route.name === "listing" && <ListingPage id={route.id} onBack={back} onPro={(id) => go({ name: "pro", id })} />}
      {route.name === "pro" && <ProPage id={route.id} onBack={back} onListing={(id) => go({ name: "listing", id })} />}
      {route.name === "mine" && <MyMarket onUpgrade={onUpgrade} onOpenListing={(id) => go({ name: "listing", id })} onOpenPro={(id) => go({ name: "pro", id })} />}
    </Shell>
  );
}

/* ---- Header badge: new enquiries waiting for the signed-in seller ------- */

export function MarketBadge() {
  const { user } = useAuth();
  const [n, setN] = useState(0);
  useEffect(() => {
    if (!user?.id) { setN(0); return; }
    let live = true;
    const check = () => MK.newEnquiryCount(user.id).then((c) => live && setN(c));
    check();
    const t = setInterval(check, 60_000);
    window.addEventListener("focus", check);
    window.addEventListener("byo:enquiries-changed", check);
    return () => { live = false; clearInterval(t); window.removeEventListener("focus", check); window.removeEventListener("byo:enquiries-changed", check); };
  }, [user?.id]);
  if (!n) return null;
  return (
    <span aria-label={`${n} new enquir${n === 1 ? "y" : "ies"}`}
      className="ml-1.5 inline-grid min-w-[18px] place-items-center rounded-full bg-hivis px-1 font-mono text-[10px] font-bold leading-[18px] text-on-hivis">
      {n > 99 ? "99+" : n}
    </span>
  );
}

/* ---- Shell: title band + tabs ------------------------------------------ */

const TABS = [
  { id: "browse", label: "Plans & modules", icon: Layers },
  { id: "pros", label: "Builders & tradies", icon: Hammer },
  { id: "mine", label: "My marketplace", icon: Store },
];

function Shell({ route, onTab, children }) {
  const active = ["listing"].includes(route.name) ? "browse" : route.name === "pro" ? "pros" : route.name;
  return (
    <div className="min-h-[calc(100vh-66px)] bg-paper">
      <div className="border-b border-rule bg-card">
        <div className="mx-auto flex max-w-[1280px] flex-wrap items-end justify-between gap-3 px-4 pt-5 sm:px-6">
          <div className="pb-3">
            <div className="font-mono text-[10px] font-bold uppercase tracking-[0.18em] text-steel">Marketplace</div>
            <h1 className="font-display text-2xl leading-tight text-ink sm:text-[28px]">Plans, prefab and the people who build them</h1>
          </div>
          <nav className="-mb-px flex w-full gap-1 overflow-x-auto sm:w-auto" aria-label="Marketplace">
            {TABS.map(({ id, label, icon: Icon }) => (
              <button key={id} onClick={() => onTab(id)}
                className={cn(
                  "flex shrink-0 items-center gap-1.5 border-b-2 px-3 py-2.5 font-mono text-[10px] font-bold uppercase tracking-[0.1em] transition-colors",
                  active === id ? "border-ink text-ink" : "border-transparent text-steel hover:text-ink",
                )}>
                <Icon className="size-3.5" /> {label}
              </button>
            ))}
          </nav>
        </div>
      </div>
      <main className="mx-auto max-w-[1280px] px-4 py-6 sm:px-6">{children}</main>
    </div>
  );
}

/* ======================================================================== */
/*  Browse                                                                  */
/* ======================================================================== */

function Browse({ onOpen, onPros }) {
  const [kind, setKind] = useState(null);
  const [state, setState] = useState("");
  const [q, setQ] = useState("");
  const [term, setTerm] = useState("");
  useEffect(() => { const t = setTimeout(() => setTerm(q), 300); return () => clearTimeout(t); }, [q]);

  const counts = useLoad(() => MK.marketCounts(), []);
  const list = useLoad(() => MK.browseListings({ kind, state: state || null, q: term }), [kind, state, term]);
  const c = counts.data || {};

  return (
    <>
      <HairGrid cols="grid-cols-2 lg:grid-cols-4" className="mb-6">
        <Kpi label="House plans" value={counts.loading ? "–" : c.plans} foot="Ready to buy, licence or build" icon={FileText} accent />
        <Kpi label="Prefab modules" value={counts.loading ? "–" : c.modules} foot="Priced by the seller — see what's included" icon={Truck} />
        <Kpi label="Builders" value={counts.loading ? "–" : c.builders} foot="With portfolios" icon={Building2} onClick={onPros} />
        <Kpi label="Tradies & designers" value={counts.loading ? "–" : c.tradies} foot="Showing their work" icon={Hammer} onClick={onPros} />
      </HairGrid>

      <Filters q={q} onQ={setQ} state={state} onState={setState}
        chips={[[null, "All"], ["plan", "House plans"], ["module", "Prefab modules"]]} chip={kind} onChip={setKind}
        placeholder="Search plans and modules" />

      {list.error ? <Notice tone="alert">{list.error}</Notice>
        : list.loading ? <CardSkeletons />
        : !list.data.length ? (
          <Notice>
            {term || kind || state ? "Nothing matches those filters yet." : "No listings yet — builders are setting up. Check back soon."}
          </Notice>
        ) : (
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
            {list.data.map((l) => <ListingCard key={l.id} l={l} onOpen={() => onOpen(l.id)} />)}
          </div>
        )}
    </>
  );
}

function Filters({ q, onQ, state, onState, chips, chip, onChip, placeholder }) {
  return (
    <div className="mb-5 flex flex-wrap items-center gap-2">
      <div className="flex flex-wrap gap-1.5">
        {chips.map(([id, label]) => (
          <button key={String(id)} onClick={() => onChip(id)}
            className={cn(
              "h-8 border px-3 font-mono text-[10px] font-bold uppercase tracking-[0.08em] transition-colors",
              chip === id ? "border-emphasis bg-emphasis text-on-emphasis" : "border-rule bg-card text-ink-soft hover:border-ink",
            )}>
            {label}
          </button>
        ))}
      </div>
      <div className="ml-auto flex w-full gap-2 sm:w-auto">
        <label className="relative flex-1 sm:w-64 sm:flex-none">
          <Search className="pointer-events-none absolute left-2.5 top-1/2 size-3.5 -translate-y-1/2 text-steel" />
          <input className="ec-input w-full" style={{ paddingLeft: 30 }} value={q} onChange={(e) => onQ(e.target.value)} placeholder={placeholder} aria-label={placeholder} />
        </label>
        <select className="ec-select" value={state} onChange={(e) => onState(e.target.value)} aria-label="State" style={{ width: 110 }}>
          <option value="">All states</option>
          {STATES.map((s) => <option key={s} value={s}>{s}</option>)}
        </select>
      </div>
    </div>
  );
}

function ListingCard({ l, onOpen }) {
  const mode = SALE_MODES[l.saleMode];
  return (
    <button onClick={onOpen}
      className="group flex flex-col overflow-hidden border border-rule bg-card text-left transition-shadow hover:shadow-[0_1px_2px_rgba(15,23,42,0.06),0_8px_24px_-6px_rgba(15,23,42,0.12)]">
      <Photo path={l.mediaPaths[0]} alt={l.title} className="aspect-[4/3] w-full" />
      <div className="flex flex-1 flex-col gap-2 p-3.5">
        <div className="flex flex-wrap gap-1">
          <Badge variant={l.kind === "module" ? "hivis" : "emphasis"}>{LISTING_KINDS[l.kind]?.label}</Badge>
          {mode && <Badge variant="outline">{mode.label}</Badge>}
        </div>
        <div className="line-clamp-2 text-sm font-semibold leading-snug text-ink group-hover:underline">{l.title}</div>
        <Specs l={l} compact />
        <div className="mt-auto flex items-end justify-between gap-2 pt-1">
          <span className="truncate text-[11px] text-steel">
            {l.seller?.displayName}
            {l.seller?.verified && <VerifiedTick className="ml-1 inline size-3.5" />}
          </span>
          <span className="shrink-0 font-mono text-[12px] font-bold tabular-nums text-ink">{priceLabel(l.priceCents)}</span>
        </div>
      </div>
    </button>
  );
}

function Specs({ l, compact }) {
  const items = [
    l.bedrooms != null && [BedDouble, `${l.bedrooms} bed`],
    l.bathrooms != null && [Bath, `${l.bathrooms} bath`],
    l.floorAreaM2 != null && [Ruler, `${Number(l.floorAreaM2).toLocaleString("en-AU")} m²`],
    l.storeys != null && !compact && [Layers, `${l.storeys} storey${l.storeys === 1 ? "" : "s"}`],
    l.kind === "module" && l.leadTimeWeeks && [Timer, `${l.leadTimeWeeks} wk`],
  ].filter(Boolean);
  if (!items.length) return null;
  return (
    <div className={cn("flex flex-wrap gap-x-3 gap-y-1 text-steel", compact ? "text-[11px]" : "text-xs")}>
      {items.map(([Icon, text]) => <span key={text} className="flex items-center gap-1"><Icon className="size-3.5" /> {text}</span>)}
    </div>
  );
}

/* ======================================================================== */
/*  Pros directory                                                          */
/* ======================================================================== */

function Pros({ onOpen }) {
  const [kind, setKind] = useState(null);
  const [state, setState] = useState("");
  const [q, setQ] = useState("");
  const [term, setTerm] = useState("");
  useEffect(() => { const t = setTimeout(() => setTerm(q), 300); return () => clearTimeout(t); }, [q]);
  const list = useLoad(() => MK.browsePros({ kind, state: state || null, q: term }), [kind, state, term]);

  return (
    <>
      <Filters q={q} onQ={setQ} state={state} onState={setState}
        chips={[[null, "Everyone"], ["builder", "Builders"], ["tradie", "Tradies"], ["designer", "Designers"]]} chip={kind} onChip={setKind}
        placeholder="Search by name" />
      {list.error ? <Notice tone="alert">{list.error}</Notice>
        : list.loading ? <CardSkeletons />
        : !list.data.length ? <Notice>No one here yet for those filters.</Notice>
        : (
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {list.data.map((p) => (
              <button key={p.userId} onClick={() => onOpen(p.userId)}
                className="group flex flex-col overflow-hidden border border-rule bg-card text-left">
                <Photo path={p.coverPath} alt="" className="aspect-[16/7] w-full" quiet />
                <div className="flex gap-3 p-3.5">
                  <Logo pro={p} />
                  <div className="min-w-0">
                    <div className="flex items-center gap-1 truncate text-sm font-semibold text-ink group-hover:underline">
                      {p.displayName} {p.verified && <VerifiedTick className="size-3.5 shrink-0" />}
                    </div>
                    <div className="font-mono text-[10px] uppercase tracking-[0.1em] text-steel">
                      {PRO_KINDS[p.kind]?.label}{p.regions.length ? ` · ${p.regions.join(", ")}` : ""}
                    </div>
                    {p.tagline && <div className="mt-1 line-clamp-2 text-xs text-ink-soft">{p.tagline}</div>}
                  </div>
                </div>
              </button>
            ))}
          </div>
        )}
    </>
  );
}

/* ======================================================================== */
/*  Listing page                                                            */
/* ======================================================================== */

function ListingPage({ id, onBack, onPro }) {
  const { user } = useAuth();
  const res = useLoad(() => MK.getListing(id), [id]);
  const [shot, setShot] = useState(0);
  const [enquire, setEnquire] = useState(false);
  useEffect(() => { if (res.data?.status === "live") MK.recordView(id); }, [res.data?.id]); // eslint-disable-line react-hooks/exhaustive-deps

  if (res.loading) return <BackBar onBack={onBack}><CardSkeletons n={1} /></BackBar>;
  if (res.error) return <BackBar onBack={onBack}><Notice tone="alert">{res.error}</Notice></BackBar>;
  const l = res.data;
  if (!l) return <BackBar onBack={onBack}><Notice>This listing isn't available any more.</Notice></BackBar>;

  const mode = SALE_MODES[l.saleMode];
  const s = l.seller;
  const own = user?.id === l.sellerId;

  return (
    <BackBar onBack={onBack}>
      {own && l.status !== "live" && <Notice tone="warn">Only you can see this — it's {l.status === "draft" ? "a draft" : "archived"}.</Notice>}
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-[1.6fr_1fr]">
        <div className="min-w-0">
          <Photo key={l.mediaPaths[shot] || "none"} path={l.mediaPaths[shot]} alt={l.title} className="aspect-[16/10] w-full border border-rule" />
          {l.mediaPaths.length > 1 && (
            <div className="mt-2 flex gap-2 overflow-x-auto pb-1">
              {l.mediaPaths.map((p, i) => (
                <button key={p} onClick={() => setShot(i)} aria-label={`Photo ${i + 1}`}
                  className={cn("w-20 shrink-0 border-2", i === shot ? "border-ink" : "border-transparent")}>
                  <Photo path={p} alt="" className="aspect-[4/3] w-full" />
                </button>
              ))}
            </div>
          )}

          <div className="mt-5">
            <div className="mb-2 flex flex-wrap gap-1">
              <Badge variant={l.kind === "module" ? "hivis" : "emphasis"}>{LISTING_KINDS[l.kind]?.label}</Badge>
              {l.regions.map((r) => <Badge key={r} variant="outline">{r}</Badge>)}
            </div>
            <h2 className="font-display text-2xl leading-tight text-ink sm:text-3xl">{l.title}</h2>
            {l.summary && <p className="mt-2 text-sm text-ink-soft">{l.summary}</p>}
            <div className="mt-3"><Specs l={l} /></div>
            {l.description && <p className="mt-4 whitespace-pre-line text-sm leading-relaxed text-ink-soft">{l.description}</p>}
          </div>

          {l.inclusions.length > 0 && (
            <Section className="mt-7" title={l.kind === "module" ? "What's in the module" : "What you get"}>
              <ul className="grid grid-cols-1 gap-1.5 sm:grid-cols-2">
                {l.inclusions.map((x) => <li key={x} className="flex gap-2 text-sm text-ink-soft"><span className="text-ok">✓</span>{x}</li>)}
              </ul>
            </Section>
          )}

          {l.kind === "module" && (
            <Section className="mt-7" title="What's in the price" sub="What you see is what you get — and here's what sits outside it.">
              <div className="overflow-hidden border border-rule">
                {Object.entries(PREFAB_SITE_WORKS).map(([k, label]) => {
                  const inc = l.siteWorks[k] === "included";
                  return (
                    <div key={k} className="flex items-center justify-between gap-3 border-b border-rule bg-card px-3 py-2 text-sm last:border-0">
                      <span className="text-ink-soft">{label}</span>
                      <span className={cn("font-mono text-[10px] font-bold uppercase tracking-[0.1em]", inc ? "text-ok" : "text-steel")}>
                        {inc ? "Included" : "Not included"}
                      </span>
                    </div>
                  );
                })}
              </div>
              {prefabExtras(l).length > 0 && (
                <p className="mt-2 text-xs text-steel">Budget separately for: {prefabExtras(l).join("; ").toLowerCase()}.</p>
              )}
            </Section>
          )}
        </div>

        <aside className="lg:sticky lg:top-[86px] lg:self-start">
          <div className="border border-rule bg-card">
            <div className="bg-emphasis p-4">
              <div className="font-mono text-[10px] font-bold uppercase tracking-[0.16em] text-on-emphasis-soft">{mode?.label}</div>
              <div className="mt-1 font-mono text-2xl font-bold tabular-nums text-on-emphasis">{priceLabel(l.priceCents)}</div>
              <div className="mt-1 text-[11px] text-on-emphasis-soft">{l.priceCents ? "Indicative, including GST. Confirmed by the seller." : "Ask the seller for a price."}</div>
            </div>
            <div className="space-y-3 p-4">
              <p className="text-sm text-ink-soft">{mode?.blurb}</p>
              {l.kind === "module" && l.leadTimeWeeks && (
                <div className="flex items-center gap-2 text-xs text-steel"><Timer className="size-3.5" /> About {l.leadTimeWeeks} weeks from order</div>
              )}
              {own ? <Notice>This is your listing.</Notice> : (
                <Button variant="hivis" className="w-full" onClick={() => setEnquire(true)}>
                  {l.saleMode === "build_only" ? "Ask about building this" : "Enquire"}
                </Button>
              )}
            </div>
            {s && (
              <button onClick={() => onPro(s.userId)} className="flex w-full items-center gap-3 border-t border-rule p-4 text-left hover:bg-paper-light">
                <Logo pro={s} />
                <div className="min-w-0">
                  <div className="flex items-center gap-1 text-sm font-semibold text-ink">
                    {s.displayName} {s.verified && <VerifiedTick className="size-3.5" />}
                  </div>
                  <div className="text-[11px] text-steel">View profile & finished jobs →</div>
                </div>
              </button>
            )}
          </div>
          <Responsibility seller={s} />
        </aside>
      </div>

      {enquire && <EnquiryDialog sellerId={l.sellerId} listing={l} sellerName={s?.displayName} onClose={() => setEnquire(false)} />}
    </BackBar>
  );
}

/** The platform line: who is responsible for what, and how to check a licence. */
function Responsibility({ seller }) {
  return (
    <p className="mt-3 text-[11px] leading-relaxed text-steel">
      BuildYourOwn is a marketplace, not the builder (see our <a href={`${SITE_URL}/?page=terms#terms-buyers`} target="_blank" rel="noopener noreferrer" className="underline">Terms of Use</a>). The seller is responsible for their designs, licences, engineering and permits.
      {seller?.licenceNumber
        ? ` Licence ${seller.licenceNumber}${seller.licenceState ? ` (${seller.licenceState})` : ""} — check it on the state register before you sign.`
        : " Ask for their licence number and check it on the state register before you sign."}
    </p>
  );
}

/* ======================================================================== */
/*  Pro profile page                                                        */
/* ======================================================================== */

function ProPage({ id, onBack, onListing }) {
  const { user } = useAuth();
  const res = useLoad(() => MK.getPro(id), [id]);
  const [enquire, setEnquire] = useState(false);
  const [lightbox, setLightbox] = useState(null);

  if (res.loading) return <BackBar onBack={onBack}><CardSkeletons n={1} /></BackBar>;
  if (res.error) return <BackBar onBack={onBack}><Notice tone="alert">{res.error}</Notice></BackBar>;
  if (!res.data) return <BackBar onBack={onBack}><Notice>This profile isn't public.</Notice></BackBar>;
  const { pro: p, portfolio, listings } = res.data;
  const own = user?.id === p.userId;

  return (
    <BackBar onBack={onBack}>
      <div className="overflow-hidden border border-rule bg-card">
        <Photo path={p.coverPath} alt="" className="aspect-[16/5] w-full" quiet />
        <div className="flex flex-wrap items-end justify-between gap-4 p-4 sm:p-5">
          <div className="flex min-w-0 gap-3">
            <Logo pro={p} size="lg" />
            <div className="min-w-0">
              <h2 className="flex items-center gap-1.5 font-display text-2xl leading-tight text-ink">
                {p.displayName} {p.verified && <VerifiedTick className="size-5" />}
              </h2>
              <div className="font-mono text-[10px] uppercase tracking-[0.12em] text-steel">
                {PRO_KINDS[p.kind]?.label}{p.regions.length ? ` · ${p.regions.join(", ")}` : ""}
              </div>
              {p.tagline && <div className="mt-1 text-sm text-ink-soft">{p.tagline}</div>}
              {p.verified && (
                <div className="mt-1 flex items-center gap-1 text-[11px] text-steel">
                  <BadgeCheck className="size-3.5 text-ok" aria-hidden="true" />
                  {VERIFIED_NOTE}{" "}
                  <a href={`${SITE_URL}/?page=terms#terms-sellers`} target="_blank" rel="noopener noreferrer" className="underline hover:text-ink">What this means</a>
                </div>
              )}
            </div>
          </div>
          {!own && <Button variant="hivis" onClick={() => setEnquire(true)}>Contact {p.displayName.split(" ")[0]}</Button>}
        </div>
      </div>

      <div className="mt-6 grid grid-cols-1 gap-6 lg:grid-cols-[1fr_2fr]">
        <div className="space-y-4">
          {p.bio && <Section title="About"><p className="whitespace-pre-line text-sm leading-relaxed text-ink-soft">{p.bio}</p></Section>}
          {p.trades.length > 0 && (
            <Section title="Work they do">
              <div className="flex flex-wrap gap-1">{p.trades.map((t) => <Badge key={t} variant="muted">{t}</Badge>)}</div>
            </Section>
          )}
          <Section title="Licence">
            <p className="text-sm text-ink-soft">
              {p.licenceNumber ? `${p.licenceNumber}${p.licenceState ? ` · ${p.licenceState}` : ""}` : "Not provided — ask for it."}
              {p.abn && <><br /><span className="text-steel">ABN {p.abn.replace(/(\d{2})(\d{3})(\d{3})(\d{3})/, "$1 $2 $3 $4")}</span></>}
            </p>
            <Responsibility seller={p} />
          </Section>
        </div>

        <div className="space-y-6">
          {listings.length > 0 && (
            <Section title={`Plans & modules · ${listings.length}`}>
              <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                {listings.map((l) => <ListingCard key={l.id} l={{ ...l, seller: p }} onOpen={() => onListing(l.id)} />)}
              </div>
            </Section>
          )}
          <Section title={`Finished jobs · ${portfolio.length}`}>
            {!portfolio.length ? <Notice>No finished jobs shown yet.</Notice> : (
              <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                {portfolio.map((it) => (
                  <button key={it.id} onClick={() => setLightbox(it)} className="group overflow-hidden border border-rule bg-card text-left">
                    <Photo path={it.mediaPaths[0]} alt={it.title} className="aspect-[4/3] w-full" />
                    <div className="p-3">
                      <div className="text-sm font-semibold text-ink group-hover:underline">{it.title}</div>
                      <div className="mt-0.5 flex items-center gap-1 text-[11px] text-steel">
                        <MapPin className="size-3" /> {[it.suburb, it.state].filter(Boolean).join(", ") || "Location not given"}
                        {it.completedOn && <> · {new Date(it.completedOn).toLocaleDateString("en-AU", { month: "short", year: "numeric" })}</>}
                      </div>
                    </div>
                  </button>
                ))}
              </div>
            )}
          </Section>
        </div>
      </div>

      {enquire && <EnquiryDialog sellerId={p.userId} sellerName={p.displayName} onClose={() => setEnquire(false)} />}
      {lightbox && (
        <Modal title={lightbox.title} onClose={() => setLightbox(null)} wide>
          <div className="space-y-2">
            {lightbox.mediaPaths.map((m) => <Photo key={m} path={m} alt={lightbox.title} className="w-full" natural />)}
          </div>
          {lightbox.description && <p className="mt-3 whitespace-pre-line text-sm text-ink-soft">{lightbox.description}</p>}
        </Modal>
      )}
    </BackBar>
  );
}

/* ======================================================================== */
/*  Enquiry                                                                 */
/* ======================================================================== */

function EnquiryDialog({ sellerId, listing = null, sellerName, onClose }) {
  const { user, profile } = useAuth();
  const [f, setF] = useState(() => ({
    name: profile?.full_name || "", email: user?.email || "", phone: "", postcode: "",
    message: listing ? `Hi, I'm interested in "${listing.title}". ` : "",
  }));
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [sent, setSent] = useState(false);
  const [authClosed, setAuthClosed] = useState(false);
  useEffect(() => {
    if (user) setF((x) => ({ ...x, email: x.email || user.email || "", name: x.name || profile?.full_name || "" }));
  }, [user, profile]);

  // Signed out: sign in first, then carry straight on to the form. If the
  // sign-in box is closed without signing in, say why rather than vanish.
  if (!user) {
    if (!authClosed) return <AuthModal initialMode="signin" onClose={() => setAuthClosed(true)} />;
    return (
      <Modal title="Sign in to send an enquiry" onClose={onClose}>
        <p className="text-sm text-ink-soft">Sellers reply to a real account, so enquiries need you to be signed in. It's free.</p>
        <div className="mt-4 flex justify-end gap-2">
          <Button variant="outline" onClick={onClose}>Cancel</Button>
          <Button variant="hivis" onClick={() => setAuthClosed(false)}>Sign in</Button>
        </div>
      </Modal>
    );
  }

  const set = (k) => (e) => setF((x) => ({ ...x, [k]: e.target.value }));
  const submit = async (e) => {
    e.preventDefault();
    setBusy(true); setError("");
    try {
      await MK.sendEnquiry({ sellerId, listingId: listing?.id || null, ...f });
      track("market_enquiry_sent", { listing: !!listing });
      setSent(true);
    } catch (err) { setError(err.message); }
    finally { setBusy(false); }
  };

  return (
    <Modal title={sent ? "Enquiry sent" : `Contact ${sellerName || "the seller"}`} onClose={onClose}>
      {sent ? (
        <>
          <p className="text-sm text-ink-soft">{sellerName || "The seller"} will get back to you by email{f.phone ? " or phone" : ""}. You'll find it under My marketplace → Sent.</p>
          <div className="mt-4 flex justify-end"><Button variant="hivis" onClick={onClose}>Done</Button></div>
        </>
      ) : (
        <form onSubmit={submit} className="space-y-3">
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <Field label="Your name"><input className="ec-input w-full" required maxLength={120} value={f.name} onChange={set("name")} /></Field>
            <Field label="Email"><input className="ec-input w-full" type="email" required maxLength={200} value={f.email} onChange={set("email")} /></Field>
            <Field label="Phone (optional)"><input className="ec-input w-full" type="tel" maxLength={40} value={f.phone} onChange={set("phone")} /></Field>
            <Field label="Build site postcode"><input className="ec-input w-full" inputMode="numeric" pattern="\d{4}" maxLength={4} value={f.postcode} onChange={set("postcode")} /></Field>
          </div>
          <Field label="Message">
            <textarea className="ec-input w-full" required rows={5} maxLength={4000} value={f.message} onChange={set("message")} />
          </Field>
          {error && <p className="text-xs text-alert">{error}</p>}
          <p className="text-[11px] text-steel">
            We'll store your enquiry and send it to {sellerName || "the seller"} by email and in the app so they can reply.
            They're a separate business and handle your details under their own privacy obligations.
            Our <a href={`${SITE_URL}/?page=privacy#privacy-share`} target="_blank" rel="noopener noreferrer" className="underline hover:text-ink">Privacy Policy</a> explains
            how we handle it, including storage overseas.
          </p>
          <div className="flex justify-end gap-2">
            <Button type="button" variant="outline" onClick={onClose}>Cancel</Button>
            <Button type="submit" variant="hivis" disabled={busy}>{busy ? "Sending…" : "Send enquiry"}</Button>
          </div>
        </form>
      )}
    </Modal>
  );
}

/* ======================================================================== */
/*  My marketplace — the seller dashboard                                   */
/* ======================================================================== */

function MyMarket({ onUpgrade, onOpenListing, onOpenPro }) {
  const { enabled, user, can } = useAuth();
  const [signin, setSignin] = useState(false);
  const [sub, setSub] = useState("overview");
  const uid = user?.id;

  const pro = useLoad(() => (uid ? MK.getMyPro(uid) : Promise.resolve(null)), [uid]);
  const data = useLoad(async () => {
    if (!uid) return null;
    const [listings, enquiries, portfolio, sent, contracts] = await Promise.all([
      MK.myListings(uid), MK.myEnquiries(uid), MK.myPortfolio(uid), MK.mySentEnquiries(uid), MK.myContracts(uid),
    ]);
    return { listings, enquiries, portfolio, sent, contracts };
  }, [uid]);

  if (!enabled || !user) {
    return (
      <div className="mx-auto max-w-xl border border-rule bg-card p-6 text-center">
        <Store className="mx-auto size-8 text-steel" />
        <h2 className="mt-2 font-display text-xl text-ink">Your marketplace</h2>
        <p className="mt-1 text-sm text-ink-soft">Sign in to see enquiries you've sent — or, as a builder or tradie, to show your work and list plans and prefab modules.</p>
        <Button variant="hivis" className="mt-4" onClick={() => setSignin(true)}>Sign in</Button>
        {signin && <AuthModal initialMode="signin" onClose={() => setSignin(false)} />}
      </div>
    );
  }

  if (pro.error || data.error) return <Notice tone="alert">{pro.error || data.error}</Notice>;
  if (!pro.ready || !data.ready || !data.data) return <CardSkeletons n={4} />;

  const reload = () => { pro.reload(); data.reload(); };
  const d = data.data;
  const me = pro.data;

  if (!me) {
    return (
      <>
        <StartSelling can={can} onUpgrade={onUpgrade} onCreated={reload} uid={uid} />
        {d.contracts.length > 0 && <div className="mb-8"><FeesLedger contracts={d.contracts} onChanged={data.reload} /></div>}
        <SentEnquiries sent={d.sent} onOpenListing={onOpenListing} onOpenPro={onOpenPro} />
      </>
    );
  }

  // Seller tools need the Terms (and the fee) agreed first. Profiles made
  // before agreement was recorded land here once, then carry on as normal.
  if (!me.termsVersion) {
    return (
      <>
        <TermsUpdate uid={uid} onAccepted={reload} first />
        {d.contracts.length > 0 && <div className="mb-8"><FeesLedger contracts={d.contracts} onChanged={data.reload} /></div>}
        <SentEnquiries sent={d.sent} onOpenListing={onOpenListing} onOpenPro={onOpenPro} />
      </>
    );
  }

  const stats = sellerStats(d);
  const canList = me.kind === "builder" && planRank(can.tier) >= planRank("business");
  const SUBS = [
    ["overview", "Overview"], ["enquiries", `Enquiries${stats.newEnquiries ? ` · ${stats.newEnquiries}` : ""}`],
    ...(me.kind === "builder" ? [["listings", "Listings"]] : []), ["portfolio", "Portfolio"], ["fees", "Fees"], ["profile", "Profile"], ["sent", "Sent"],
  ];
  const fees = feeSummary(d.contracts);

  return (
    <>
      {me.termsVersion < LEGAL.termsVersion && <TermsUpdate uid={uid} onAccepted={reload} />}
      {!me.published && (
        <Notice tone="warn">
          Your profile is hidden from buyers. <button className="font-semibold underline" onClick={() => setSub("profile")}>Publish it</button> when you're ready — your listings and portfolio only show once it's public.
        </Notice>
      )}

      <HairGrid cols="grid-cols-2 lg:grid-cols-4" className="mb-5">
        <Kpi label="New enquiries" value={stats.newEnquiries} foot={`${stats.totalEnquiries} in total`} icon={Inbox} accent onClick={() => setSub("enquiries")} />
        <Kpi label={me.kind === "builder" ? "Live listings" : "Profile"} value={me.kind === "builder" ? stats.live : me.published ? "Live" : "Hidden"}
          foot={me.kind === "builder" ? `${stats.drafts} draft${stats.drafts === 1 ? "" : "s"}${stats.hidden ? ` · ${stats.hidden} taken down` : ""}` : PRO_KINDS[me.kind]?.label}
          icon={Store} onClick={() => setSub(me.kind === "builder" ? "listings" : "profile")} />
        <Kpi label="Listing views" value={stats.views.toLocaleString("en-AU")} foot="All time, across listings" icon={Eye} />
        <Kpi label="Finished jobs" value={stats.portfolio} foot="In your portfolio" icon={Hammer} onClick={() => setSub("portfolio")} />
      </HairGrid>

      <div className="mb-4 flex gap-1 overflow-x-auto border-b border-rule">
        {SUBS.map(([id, label]) => (
          <button key={id} onClick={() => setSub(id)}
            className={cn("shrink-0 border-b-2 px-3 py-2 font-mono text-[10px] font-bold uppercase tracking-[0.08em]",
              sub === id ? "border-ink text-ink" : "border-transparent text-steel hover:text-ink")}>
            {label}
          </button>
        ))}
        <button onClick={() => onOpenPro(uid)} className="ml-auto shrink-0 px-3 py-2 font-mono text-[10px] font-bold uppercase tracking-[0.08em] text-steel hover:text-ink">
          View public page →
        </button>
      </div>

      {sub === "overview" && (
        <div className="grid grid-cols-1 gap-5 lg:grid-cols-[1.4fr_1fr]">
          <Section title="Latest enquiries" action={<Button variant="subtle" size="xs" onClick={() => setSub("enquiries")}>All</Button>}>
            <EnquiryList rows={d.enquiries.slice(0, 5)} onChanged={data.reload} contracts={d.contracts} compact />
          </Section>
          <div className="space-y-5">
            {me.kind === "builder" && (
              <Section title="Your listings" action={<Button variant="subtle" size="xs" onClick={() => setSub("listings")}>Manage</Button>}>
                {!d.listings.length ? <Notice>No listings yet. Add a house plan or a prefab module.</Notice> : (
                  <div className="divide-y divide-rule border border-rule bg-card">
                    {d.listings.slice(0, 5).map((l) => (
                      <div key={l.id} className="flex items-center justify-between gap-2 px-3 py-2">
                        <span className="truncate text-sm text-ink">{l.title}</span>
                        <StatusBadge l={l} />
                      </div>
                    ))}
                  </div>
                )}
              </Section>
            )}
            <Section title="Fees" action={<Button variant="subtle" size="xs" onClick={() => setSub("fees")}>Ledger</Button>}>
              {fees.count > 0 && (
                <div className="mb-2 flex items-baseline justify-between gap-3 border border-rule bg-card px-3 py-2">
                  <span className="text-sm text-ink-soft">{fees.count} signed contract{fees.count === 1 ? "" : "s"} · fees owing</span>
                  <span className="font-mono text-sm font-bold tabular-nums text-ink">{dollars(fees.owingCents)}</span>
                </div>
              )}
              <div className="divide-y divide-rule border border-rule bg-card text-sm">
                <div className="flex justify-between gap-3 px-3 py-2"><span className="text-ink-soft">Build contracts signed through BuildYourOwn</span><span className="shrink-0 font-semibold text-ink">1.5%</span></div>
                <div className="flex justify-between gap-3 px-3 py-2"><span className="text-ink-soft">House plans & prefab modules</span><span className="shrink-0 font-semibold text-ink">{PLATFORM_FEES.plan.label}</span></div>
              </div>
              <p className="mt-2 text-[11px] text-steel">You're responsible for your licences, insurance, engineering and permits. BuildYourOwn isn't a party to your contracts.</p>
            </Section>
          </div>
        </div>
      )}

      {sub === "enquiries" && (
        <Section title="Enquiries" sub="Reply by email or phone, then mark them so nothing slips. Won one? Record the signed contract.">
          <EnquiryList rows={d.enquiries} onChanged={data.reload} contracts={d.contracts} />
        </Section>
      )}
      {sub === "fees" && <FeesLedger contracts={d.contracts} onChanged={data.reload} />}
      {sub === "listings" && me.kind === "builder" && (
        <ListingsManager uid={uid} listings={d.listings} canList={canList} onUpgrade={onUpgrade} onChanged={data.reload} onPreview={onOpenListing} />
      )}
      {sub === "portfolio" && <PortfolioManager uid={uid} items={d.portfolio} onChanged={data.reload} />}
      {sub === "profile" && <ProfileEditor uid={uid} pro={me} canBuild={can.marketListing} onSaved={reload} />}
      {sub === "sent" && <SentEnquiries sent={d.sent} onOpenListing={onOpenListing} onOpenPro={onOpenPro} bare />}
    </>
  );
}

/* The Terms changed since this seller last agreed (or they joined before
   agreement was recorded): ask once, record it, carry on. */
function TermsUpdate({ uid, onAccepted, first }) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const accept = async () => {
    setBusy(true); setError("");
    try { await MK.acceptTerms(uid, LEGAL.termsVersion); onAccepted(); } catch (e) { setError(e.message); setBusy(false); }
  };
  return (
    <Notice tone="warn">
      {first ? "Please confirm our Terms of Use, which cover selling on BuildYourOwn." : `Our Terms of Use have been updated, effective ${versionDate(LEGAL.termsVersion)}.`}{" "}
      <a href={`${SITE_URL}/?page=terms`} target="_blank" rel="noopener noreferrer" className="font-semibold underline">Read them</a>, including the 1.5% platform fee (plus any GST) on building contracts with clients you meet through BuildYourOwn.
      <div className="mt-2 flex items-center gap-3">
        <Button size="sm" variant="hivis" disabled={busy} onClick={accept}>{busy ? "Saving…" : "I agree"}</Button>
        {error && <span className="text-xs text-alert">{error}</span>}
      </div>
    </Notice>
  );
}

function StatusBadge({ l }) {
  if (l.hidden) return <Badge variant="alert">Taken down</Badge>;
  if (l.status === "live") return <Badge variant="ok">Live</Badge>;
  if (l.status === "archived") return <Badge variant="muted">Archived</Badge>;
  return <Badge variant="outline">Draft</Badge>;
}

/* ---- Start selling: create a pro profile ------------------------------- */

function StartSelling({ can, onUpgrade, onCreated, uid }) {
  const [kind, setKind] = useState(null);
  const [name, setName] = useState("");
  const [agreed, setAgreed] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const allowed = (k) => planRank(can.tier) >= planRank(PRO_KINDS[k].plan);

  const create = async () => {
    setBusy(true); setError("");
    try {
      await MK.saveMyPro(uid, { kind, displayName: name, published: false, termsVersion: LEGAL.termsVersion }, { create: true });
      track("market_profile_created", { kind });
      onCreated();
    } catch (e) { setError(e.message); }
    finally { setBusy(false); }
  };

  return (
    <div className="mb-8 border border-rule bg-card p-5 sm:p-6">
      <div className="font-mono text-[10px] font-bold uppercase tracking-[0.16em] text-steel">Sell on BuildYourOwn</div>
      <h2 className="mt-1 font-display text-2xl text-ink">Show your work. List your plans and modules.</h2>
      <p className="mt-1 max-w-[70ch] text-sm text-ink-soft">
        Builders list house plans and prefab modules and show finished jobs. Tradies and designers show their portfolio and take enquiries.
        Fees: 1.5% of build contracts signed through us; plans and modules discussed on contract.
      </p>
      <div className="mt-4 grid gap-3 sm:grid-cols-3">
        {Object.entries(PRO_KINDS).map(([k, v]) => {
          const ok = allowed(k);
          return (
            <button key={k} onClick={() => (ok ? setKind(k) : onUpgrade?.(k === "builder" ? "marketListing" : "marketProfile"))}
              className={cn("border p-4 text-left transition-colors", kind === k ? "border-ink bg-paper-light" : "border-rule hover:border-ink")}>
              <div className="flex items-center justify-between">
                <span className="font-semibold text-ink">{v.label}</span>
                {!ok && <Badge variant="hivis">{v.plan === "business" ? "Builder plan" : "Tradie plan"}</Badge>}
              </div>
              <div className="mt-1 text-xs text-steel">
                {k === "builder" ? "Profile, portfolio, house plans and prefab modules." : k === "tradie" ? "Profile and portfolio of finished jobs." : "Profile and portfolio of your designs."}
              </div>
            </button>
          );
        })}
      </div>
      {kind && (
        <div className="mt-4 flex flex-wrap items-end gap-3">
          <Field label="Business name">
            <input className="ec-input w-72 max-w-full" value={name} onChange={(e) => setName(e.target.value)} maxLength={120} placeholder="e.g. Coastline Homes" />
          </Field>
          <Button variant="hivis" disabled={busy || name.trim().length < 2 || !agreed} onClick={create}>{busy ? "Creating…" : "Create my profile"}</Button>
          <span className="text-[11px] text-steel">A tradie or designer can switch to a builder profile later, on the Builder plan.</span>
          <label className="flex w-full cursor-pointer items-start gap-2 text-sm text-ink-soft">
            <input type="checkbox" className="mt-1" checked={agreed} onChange={(e) => setAgreed(e.target.checked)} />
            <span>
              I agree to the <a href={`${SITE_URL}/?page=terms`} target="_blank" rel="noopener noreferrer" className="underline">Terms of Use</a>,
              including the 1.5% platform fee (plus any GST) on building contracts with clients I meet through BuildYourOwn, and that I hold the licences and insurance my work needs.
            </span>
          </label>
        </div>
      )}
      {error && <p className="mt-2 text-xs text-alert">{error}</p>}
    </div>
  );
}

/* ---- Enquiries --------------------------------------------------------- */

function EnquiryList({ rows, onChanged, compact, contracts = [] }) {
  const [open, setOpen] = useState(null);
  const [error, setError] = useState("");
  const [signing, setSigning] = useState(null);
  const contractFor = (e) => contracts.find((c) => c.enquiryId === e.id && c.status !== "void");
  if (!rows.length) return <Notice>No enquiries yet. They'll land here as buyers get in touch.</Notice>;
  const setStatus = async (e, status) => {
    setError("");
    try { await MK.setEnquiryStatus(e.id, status); onChanged(); } catch (err) { setError(err.message); }
  };
  return (
    <div className="divide-y divide-rule border border-rule bg-card">
      {error && <p className="px-3 py-2 text-xs text-alert">{error}</p>}
      {rows.map((e) => {
        const expanded = open === e.id || !compact;
        return (
          <div key={e.id} className="px-3 py-2.5">
            <button className="flex w-full items-start justify-between gap-3 text-left" onClick={() => setOpen(open === e.id ? null : e.id)}>
              <div className="min-w-0">
                <div className="flex items-center gap-2 text-sm font-semibold text-ink">
                  {e.status === "new" && <span className="size-2 shrink-0 rounded-full bg-hivis" aria-label="New" />}
                  <span className="truncate">{e.contact_name}</span>
                </div>
                <div className="truncate text-[11px] text-steel">
                  {e.listing?.title ? `About "${e.listing.title}"` : "General enquiry"} · {new Date(e.created_at).toLocaleDateString("en-AU", { day: "numeric", month: "short" })}
                  {e.postcode ? ` · ${e.postcode}` : ""}
                </div>
              </div>
              <Badge variant={e.status === "new" ? "hivis" : e.status === "won" ? "emphasis" : e.status === "replied" ? "ok" : "muted"}>{e.status}</Badge>
            </button>
            {expanded && (
              <div className="mt-2 space-y-2">
                <p className="whitespace-pre-line text-sm text-ink-soft">{e.message}</p>
                <div className="flex flex-wrap items-center gap-2 text-xs">
                  <a className="ec-link" href={`mailto:${e.contact_email}?subject=${encodeURIComponent(e.listing?.title ? `Re: ${e.listing.title}` : "Your BuildYourOwn enquiry")}`}>{e.contact_email}</a>
                  {e.contact_phone && <a className="ec-link" href={`tel:${e.contact_phone}`}>{e.contact_phone}</a>}
                  <span className="ml-auto flex flex-wrap justify-end gap-1">
                    {contractFor(e)
                      ? <Badge variant="ok">Contract {dollars(contractFor(e).valueCents)} · fee {dollars(contractFor(e).feeCents)}</Badge>
                      : <Button size="xs" variant="hivis" onClick={() => setSigning(e)}><FileSignature className="size-3" /> Contract signed</Button>}
                    {/* "won" without a live contract (it was voided) behaves like any open enquiry */}
                    {e.status !== "replied" && !contractFor(e) && <Button size="xs" variant="outline" onClick={() => setStatus(e, "replied")}>Mark replied</Button>}
                    {e.status !== "closed" && !contractFor(e) && <Button size="xs" variant="outline" onClick={() => setStatus(e, "closed")}>Close</Button>}
                    {e.status !== "new" && !contractFor(e) && <Button size="xs" variant="subtle" onClick={() => setStatus(e, "new")}>Reopen</Button>}
                  </span>
                </div>
              </div>
            )}
          </div>
        );
      })}
      {signing && (
        <ContractDialog
          initial={{ clientName: signing.contact_name, sitePostcode: signing.postcode || "" }}
          link={{ source: "marketplace", enquiryId: signing.id, listingId: signing.listing_id || null, enquiryCreatedAt: signing.created_at }}
          context={signing.listing?.title ? `From the enquiry about "${signing.listing.title}".` : "From a marketplace enquiry."}
          onClose={() => setSigning(null)}
          onSaved={() => { setSigning(null); onChanged(); }} />
      )}
    </div>
  );
}

/* ---- Fees ledger: signed contracts and the 1.5% ------------------------- */

function FeesLedger({ contracts, onChanged }) {
  const [editing, setEditing] = useState(null);
  const [error, setError] = useState("");
  const f = feeSummary(contracts);
  const voidIt = async (c) => {
    if (!confirm(`Void the contract with ${c.clientName}? No fee will be charged for it.`)) return;
    setError("");
    try {
      await MK.voidContract(c.id);
      // The enquiry isn't "won" any more; put it back with the open ones.
      if (c.enquiryId) await MK.setEnquiryStatus(c.enquiryId, "replied").catch(() => {});
      onChanged();
    } catch (e) { setError(e.message); }
  };
  const SOURCE = { marketplace: "Marketplace", site_office: "Site Office", other: "Other" };
  return (
    <Section title="Platform fees" sub="1.5% of the value (ex GST) of each building contract with a client you met through BuildYourOwn, plus GST if it applies. Invoiced separately; nothing is charged in the app.">
      <HairGrid cols="grid-cols-2 lg:grid-cols-4" className="mb-4">
        <Kpi label="Fees owing" value={dollars(f.owingCents)} foot="Recorded and invoiced" icon={FileSignature} accent />
        <Kpi label="Fees paid" value={dollars(f.paidCents)} foot="All time" />
        <Kpi label="Contracts" value={f.count} foot="Signed through BuildYourOwn" />
        <Kpi label="Contract value" value={dollars(f.valueCents)} foot="Ex GST" />
      </HairGrid>
      {error && <p className="mb-2 text-xs text-alert">{error}</p>}
      {!contracts.length ? (
        <Notice>No contracts recorded yet. When an enquiry or a Site Office job turns into a signed contract, record it there.</Notice>
      ) : (
        <div className="overflow-x-auto border border-rule bg-card">
          <table className="w-full min-w-[620px] border-collapse text-sm">
            <thead>
              <tr className="border-b border-rule">
                {["Signed", "Client", "From", "Value", "Fee", "Status", ""].map((h, i) => (
                  <th key={i} className={cn("px-3 py-2 font-mono text-[9px] font-bold uppercase tracking-[0.12em] text-steel", i >= 3 && i <= 4 ? "text-right" : "text-left")}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {contracts.map((c) => (
                <tr key={c.id} className={cn("border-b border-rule/60 last:border-0", c.status === "void" && "opacity-50")}>
                  <td className="px-3 py-2 font-mono text-[11px] text-steel">{c.signedOn ? new Date(c.signedOn).toLocaleDateString("en-AU", { day: "numeric", month: "short", year: "numeric" }) : "—"}</td>
                  <td className="max-w-[200px] truncate px-3 py-2 text-ink">{c.clientName}{c.jobName && <span className="text-steel"> · {c.jobName}</span>}</td>
                  <td className="px-3 py-2 text-[11px] text-steel">{SOURCE[c.source] || c.source}</td>
                  <td className="px-3 py-2 text-right font-mono text-[12px] tabular-nums text-ink-soft">{dollars(c.valueCents)}</td>
                  <td className="px-3 py-2 text-right font-mono text-[12px] font-bold tabular-nums text-ink">{dollars(c.feeCents)}</td>
                  <td className="px-3 py-2"><Badge variant={c.status === "paid" ? "ok" : c.status === "void" ? "muted" : c.status === "invoiced" ? "hivis" : "outline"}>{CONTRACT_STATUS[c.status]?.label || c.status}</Badge></td>
                  <td className="whitespace-nowrap px-3 py-2 text-right">
                    {contractEditable(c) && (
                      <>
                        <Button size="xs" variant="subtle" onClick={() => setEditing(c)}>Edit</Button>
                        <Button size="xs" variant="subtle" onClick={() => voidIt(c)}>Void</Button>
                      </>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      {editing && (
        <ContractDialog initial={editing} onClose={() => setEditing(null)} onSaved={() => { setEditing(null); onChanged(); }} />
      )}
    </Section>
  );
}

function SentEnquiries({ sent, onOpenListing, onOpenPro, bare }) {
  const body = !sent.length ? <Notice>You haven't contacted anyone yet. Browse plans and modules, or find a builder.</Notice> : (
    <div className="divide-y divide-rule border border-rule bg-card">
      {sent.map((e) => (
        <div key={e.id} className="flex items-start justify-between gap-3 px-3 py-2.5">
          <div className="min-w-0">
            <div className="text-sm text-ink">
              To <button className="font-semibold underline" onClick={() => e.seller && onOpenPro(e.seller.user_id)}>{e.seller?.display_name || "a seller"}</button>
              {e.listing && <> about <button className="underline" onClick={() => onOpenListing(e.listing.id)}>{e.listing.title}</button></>}
            </div>
            <div className="line-clamp-1 text-[11px] text-steel">{e.message}</div>
          </div>
          <span className="shrink-0 text-[11px] text-steel">{new Date(e.created_at).toLocaleDateString("en-AU", { day: "numeric", month: "short" })}</span>
        </div>
      ))}
    </div>
  );
  return bare ? body : <Section title="Enquiries you've sent">{body}</Section>;
}

/* ---- Listings manager + editor ----------------------------------------- */

const BLANK_LISTING = (kind) => ({
  kind, saleMode: kind === "module" ? "prefab" : "build_only", title: "", summary: "", description: "",
  priceCents: null, bedrooms: "", bathrooms: "", storeys: "", floorAreaM2: "", inclusions: [], siteWorks: {},
  leadTimeWeeks: null, regions: [], mediaPaths: [], ownsCopyright: false, status: "draft",
});

function ListingsManager({ uid, listings, canList, onUpgrade, onChanged, onPreview }) {
  const [editing, setEditing] = useState(null);
  if (editing) {
    return <ListingEditor uid={uid} initial={editing} canList={canList} onUpgrade={onUpgrade} onClose={() => { setEditing(null); onChanged(); }} onPreview={onPreview} />;
  }
  const add = (kind) => (canList ? setEditing(BLANK_LISTING(kind)) : onUpgrade?.("marketListing"));
  return (
    <Section title="Listings" sub="Drafts are only visible to you. Publish when the photos and details are right."
      action={<div className="flex gap-2">
        <Button size="sm" variant="outline" onClick={() => add("plan")}><Plus className="size-3.5" /> House plan</Button>
        <Button size="sm" variant="hivis" onClick={() => add("module")}><Plus className="size-3.5" /> Prefab module</Button>
      </div>}>
      {!canList && <Notice tone="warn">Listing plans and modules is part of the Builder plan. <button className="font-semibold underline" onClick={() => onUpgrade?.("marketListing")}>See plans</button></Notice>}
      {!listings.length ? <Notice>Nothing listed yet.</Notice> : (
        <div className="divide-y divide-rule border border-rule bg-card">
          {listings.map((l) => (
            <button key={l.id} onClick={() => setEditing(l)} className="flex w-full items-center gap-3 px-3 py-2.5 text-left hover:bg-paper-light">
              <Photo path={l.mediaPaths[0]} alt="" className="aspect-[4/3] w-16 shrink-0" />
              <div className="min-w-0 flex-1">
                <div className="truncate text-sm font-semibold text-ink">{l.title || "Untitled"}</div>
                <div className="text-[11px] text-steel">{LISTING_KINDS[l.kind]?.label} · {SALE_MODES[l.saleMode]?.label} · {priceLabel(l.priceCents)}</div>
              </div>
              <span className="hidden items-center gap-1 text-[11px] text-steel sm:flex"><Eye className="size-3" /> {l.viewCount}</span>
              <StatusBadge l={l} />
            </button>
          ))}
        </div>
      )}
    </Section>
  );
}

function ListingEditor({ uid, initial, canList, onUpgrade, onClose, onPreview }) {
  const [l, setL] = useState(initial);
  const [busy, setBusy] = useState("");
  const [error, setError] = useState("");
  // v may be an updater: MediaPicker appends uploads to the latest list.
  const set = (k, v) => setL((x) => ({ ...x, [k]: typeof v === "function" ? v(x[k]) : v }));
  const problems = publishProblems(l);
  const saveBlockers = fieldProblems(l);
  const modes = Object.entries(SALE_MODES).filter(([, m]) => m.kind === l.kind);

  const act = async (label, fn) => {
    setBusy(label); setError("");
    try { await fn(); } catch (e) { setError(e.message); } finally { setBusy(""); }
  };
  const save = () => act("Saving…", async () => { const saved = await MK.saveListing(uid, l); setL(saved); });
  const publish = () => act("Publishing…", async () => {
    const saved = await MK.saveListing(uid, l);
    setL(saved);                         // keep the id even if the next step fails, so a retry doesn't duplicate
    const live = await MK.setListingStatus(saved.id, "live");
    setL(live);
    track("market_listing_published", { kind: live.kind, mode: live.saleMode });
  });
  // Unpublish / archive change only the status, so a listing can always be
  // taken down even while the form holds edits that wouldn't save.
  const setStatus = (status) => act("Saving…", async () => {
    const changed = await MK.setListingStatus(l.id, status);
    setL((x) => ({ ...x, status: changed.status, updatedAt: changed.updatedAt }));
  });
  const remove = () => {
    if (!l.id) return onClose();
    if (!confirm(`Delete "${l.title || "this listing"}"? This can't be undone.`)) return;
    act("Deleting…", async () => { await MK.deleteListing(l); onClose(); });
  };

  return (
    <div className="border border-rule bg-card">
      <div className="flex flex-wrap items-center justify-between gap-2 border-b border-rule px-4 py-3">
        <button onClick={onClose} className="flex items-center gap-1 font-mono text-[10px] font-bold uppercase tracking-[0.08em] text-steel hover:text-ink">
          <ArrowLeft className="size-3.5" /> All listings
        </button>
        <div className="flex items-center gap-2">
          <StatusBadge l={l} />
          {l.id && l.status === "live" && <Button size="sm" variant="subtle" onClick={() => onPreview(l.id)}>View</Button>}
        </div>
      </div>

      <div className="grid grid-cols-1 gap-5 p-4 lg:grid-cols-[1.4fr_1fr]">
        <div className="space-y-3">
          <div className="font-mono text-[10px] font-bold uppercase tracking-[0.14em] text-steel">{LISTING_KINDS[l.kind]?.label}</div>
          <Field label="Title"><input className="ec-input w-full" maxLength={160} value={l.title} onChange={(e) => set("title", e.target.value)} placeholder={l.kind === "module" ? "e.g. 6 × 3 m studio pod" : "e.g. The Kauri — 4 bed Queenslander"} /></Field>
          <Field label="One-line summary"><input className="ec-input w-full" maxLength={300} value={l.summary} onChange={(e) => set("summary", e.target.value)} /></Field>
          <Field group label="How you're selling it">
            <div className="grid grid-cols-1 gap-2 sm:grid-cols-3">
              {modes.map(([id, m]) => (
                <button key={id} type="button" onClick={() => set("saleMode", id)}
                  className={cn("border p-2.5 text-left", l.saleMode === id ? "border-ink bg-paper-light" : "border-rule hover:border-ink")}>
                  <div className="text-sm font-semibold text-ink">{m.label}</div>
                  <div className="text-[11px] text-steel">{m.blurb}</div>
                </button>
              ))}
            </div>
          </Field>
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-5">
            <Field label="Price from (A$)" hint="Including any GST, as the buyer pays it. Blank = on enquiry">
              <input className="ec-input w-full" type="number" min="0" step="100" value={l.priceCents ? l.priceCents / 100 : ""}
                onChange={(e) => set("priceCents", e.target.value === "" ? null : Math.round(Number(e.target.value) * 100))} />
            </Field>
            <Field label="Beds"><input className="ec-input w-full" type="number" min="0" max="20" value={l.bedrooms ?? ""} onChange={(e) => set("bedrooms", e.target.value)} /></Field>
            <Field label="Baths"><input className="ec-input w-full" type="number" min="0" max="20" value={l.bathrooms ?? ""} onChange={(e) => set("bathrooms", e.target.value)} /></Field>
            <Field label="Storeys"><input className="ec-input w-full" type="number" min="1" max="6" value={l.storeys ?? ""} onChange={(e) => set("storeys", e.target.value)} /></Field>
            <Field label="Area (m²)"><input className="ec-input w-full" type="number" min="0" step="0.1" value={l.floorAreaM2 ?? ""} onChange={(e) => set("floorAreaM2", e.target.value)} /></Field>
          </div>
          <Field label="Description"><textarea className="ec-input w-full" rows={6} maxLength={8000} value={l.description} onChange={(e) => set("description", e.target.value)} /></Field>
          <Field label={l.kind === "module" ? "What's in the module (one per line)" : "What you get (one per line)"}>
            <textarea className="ec-input w-full" rows={4} value={l.inclusions.join("\n")} onChange={(e) => set("inclusions", e.target.value.split("\n"))}
              placeholder={l.kind === "module" ? "Fully fitted bathroom\nKitchenette\nWired to switchboard" : "Working drawings\n3D model\nEngineering for site class M"} />
          </Field>

          {l.kind === "module" && (
            <div className="border border-rule p-3">
              <div className="mb-1 text-sm font-semibold text-ink">What's in the price</div>
              <p className="mb-2 text-[11px] text-steel">Buyers see this before they enquire — it's what makes "what you see is what you get" true.</p>
              <div className="space-y-1.5">
                {Object.entries(PREFAB_SITE_WORKS).map(([k, label]) => (
                  <div key={k} className="flex flex-wrap items-center justify-between gap-2">
                    <span className="text-sm text-ink-soft">{label}</span>
                    <div className="flex">
                      {["included", "excluded"].map((v) => (
                        <button key={v} type="button" onClick={() => set("siteWorks", { ...l.siteWorks, [k]: v })}
                          className={cn("h-7 border px-2.5 font-mono text-[10px] font-bold uppercase",
                            l.siteWorks[k] === v ? "border-emphasis bg-emphasis text-on-emphasis" : "border-rule bg-card text-steel")}>
                          {v === "included" ? "Included" : "Not included"}
                        </button>
                      ))}
                    </div>
                  </div>
                ))}
              </div>
              <div className="mt-3 w-40">
                <Field label="Lead time (weeks)">
                  <input className="ec-input w-full" type="number" min="1" max="104" value={l.leadTimeWeeks ?? ""}
                    onChange={(e) => set("leadTimeWeeks", e.target.value === "" ? null : Math.round(Number(e.target.value)))} />
                </Field>
              </div>
            </div>
          )}

          <Field group label={l.kind === "module" ? "Delivers to" : "Available in"}>
            <StateChips value={l.regions} onChange={(v) => set("regions", v)} />
          </Field>

          {(l.saleMode === "plan_purchase" || l.saleMode === "plan_licence") && (
            <label className="flex cursor-pointer items-start gap-2 text-sm text-ink-soft">
              <input type="checkbox" className="mt-1" checked={l.ownsCopyright} onChange={(e) => set("ownsCopyright", e.target.checked)} />
              I own the copyright in this design, or I'm licensed to sell it.
            </label>
          )}
        </div>

        <div className="space-y-4">
          <Field group label="Photos & renders" hint="First photo is the cover. JPG, PNG, WebP or iPhone photos.">
            <MediaPicker uid={uid} paths={l.mediaPaths} onChange={(v) => set("mediaPaths", v)} />
          </Field>

          <div className="border border-rule bg-paper-light p-3">
            <div className="mb-1 font-mono text-[10px] font-bold uppercase tracking-[0.14em] text-steel">Ready to publish?</div>
            {problems.length ? (
              <ul className="space-y-1">{problems.map((p) => <li key={p} className="text-xs text-ink-soft">• {p}</li>)}</ul>
            ) : <p className="text-xs text-ok">All set.</p>}
          </div>

          {!canList && l.status !== "live" && (
            <Notice tone="warn">Publishing is part of the Builder plan. You can still edit, archive or delete. <button className="font-semibold underline" onClick={() => onUpgrade?.("marketListing")}>See plans</button></Notice>
          )}
          {error && <p className="text-xs text-alert">{error}</p>}
          <div className="flex flex-wrap gap-2">
            <Button variant="outline" disabled={!!busy || l.title.trim().length < 2 || saveBlockers.length > 0} onClick={save}>
              {busy === "Saving…" ? busy : l.status === "live" ? "Save changes" : "Save draft"}
            </Button>
            {l.status !== "live"
              ? <Button variant="hivis" disabled={!!busy || problems.length > 0 || !canList} onClick={publish}>{busy === "Publishing…" ? busy : "Publish"}</Button>
              : <Button variant="outline" disabled={!!busy} onClick={() => setStatus("draft")}>Unpublish</Button>}
            {l.id && l.status !== "archived" && <Button variant="subtle" disabled={!!busy} onClick={() => setStatus("archived")}>Archive</Button>}
            {l.id && <Button variant="danger" size="sm" disabled={!!busy} onClick={remove}><Trash2 className="size-3.5" /> Delete</Button>}
          </div>
          {l.status === "live" && <p className="text-[11px] text-steel">Changes to a live listing show to buyers as soon as you save.</p>}
          <p className="text-[11px] text-steel">Fee: {listingFeeLabel(l).toLowerCase()}. You're responsible for the design, licences and approvals.</p>
        </div>
      </div>
    </div>
  );
}

/* ---- Portfolio --------------------------------------------------------- */

function PortfolioManager({ uid, items, onChanged }) {
  const [editing, setEditing] = useState(null);
  if (editing) return <PortfolioEditor uid={uid} initial={editing} onClose={() => { setEditing(null); onChanged(); }} />;
  return (
    <Section title="Portfolio" sub="Finished jobs, with photos. This is what buyers look at first."
      action={<Button size="sm" variant="hivis" onClick={() => setEditing({ title: "", description: "", category: "", suburb: "", state: "", completedOn: "", mediaPaths: [], published: true })}>
        <Plus className="size-3.5" /> Add a job</Button>}>
      {!items.length ? <Notice>No jobs yet. Add your best three to start.</Notice> : (
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {items.map((it) => (
            <button key={it.id} onClick={() => setEditing(it)} className="overflow-hidden border border-rule bg-card text-left">
              <Photo path={it.mediaPaths[0]} alt={it.title} className="aspect-[4/3] w-full" />
              <div className="flex items-center justify-between gap-2 p-3">
                <span className="truncate text-sm font-semibold text-ink">{it.title}</span>
                {!it.published && <Badge variant="outline">Hidden</Badge>}
              </div>
            </button>
          ))}
        </div>
      )}
    </Section>
  );
}

function PortfolioEditor({ uid, initial, onClose }) {
  const [it, setIt] = useState(initial);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const set = (k, v) => setIt((x) => ({ ...x, [k]: typeof v === "function" ? v(x[k]) : v }));
  const save = async () => {
    setBusy(true); setError("");
    try { await MK.savePortfolioItem(uid, it); onClose(); } catch (e) { setError(e.message); setBusy(false); }
  };
  const remove = async () => {
    if (!confirm(`Delete "${it.title}"?`)) return;
    setBusy(true);
    try { await MK.deletePortfolioItem(it); onClose(); } catch (e) { setError(e.message); setBusy(false); }
  };
  return (
    <div className="border border-rule bg-card p-4">
      <button onClick={onClose} className="mb-3 flex items-center gap-1 font-mono text-[10px] font-bold uppercase tracking-[0.08em] text-steel hover:text-ink">
        <ArrowLeft className="size-3.5" /> Portfolio
      </button>
      <div className="grid grid-cols-1 gap-5 lg:grid-cols-[1.4fr_1fr]">
        <div className="space-y-3">
          <Field label="Job title"><input className="ec-input w-full" maxLength={160} value={it.title} onChange={(e) => set("title", e.target.value)} placeholder="e.g. Raised Queenslander restump & extension" /></Field>
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
            <Field label="Type of work"><input className="ec-input w-full" maxLength={60} value={it.category} onChange={(e) => set("category", e.target.value)} placeholder="New home" /></Field>
            <Field label="Suburb"><input className="ec-input w-full" maxLength={80} value={it.suburb} onChange={(e) => set("suburb", e.target.value)} /></Field>
            <Field label="State">
              <select className="ec-select w-full" value={it.state} onChange={(e) => set("state", e.target.value)}>
                <option value="">—</option>{STATES.map((s) => <option key={s}>{s}</option>)}
              </select>
            </Field>
            <Field label="Finished"><input className="ec-input w-full" type="date" value={it.completedOn || ""} onChange={(e) => set("completedOn", e.target.value)} /></Field>
          </div>
          <Field label="About the job"><textarea className="ec-input w-full" rows={5} maxLength={4000} value={it.description} onChange={(e) => set("description", e.target.value)} /></Field>
          <label className="flex items-center gap-2 text-sm text-ink-soft">
            <input type="checkbox" checked={it.published} onChange={(e) => set("published", e.target.checked)} /> Show on my public page
          </label>
        </div>
        <div className="space-y-3">
          <Field group label="Photos"><MediaPicker uid={uid} paths={it.mediaPaths} onChange={(v) => set("mediaPaths", v)} /></Field>
          {error && <p className="text-xs text-alert">{error}</p>}
          <div className="flex gap-2">
            <Button variant="hivis" disabled={busy || it.title.trim().length < 2} onClick={save}>{busy ? "Saving…" : "Save"}</Button>
            {it.id && <Button variant="danger" size="sm" disabled={busy} onClick={remove}><Trash2 className="size-3.5" /> Delete</Button>}
          </div>
        </div>
      </div>
    </div>
  );
}

/* ---- Profile ----------------------------------------------------------- */

function ProfileEditor({ uid, pro, canBuild, onSaved }) {
  const [p, setP] = useState(pro);
  const [tradesText, setTradesText] = useState(() => pro.trades.join(", "));   // raw text; split on save
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState({ error: "", ok: "" });
  const set = (k, v) => setP((x) => ({ ...x, [k]: v }));
  // Single-image pickers hand back a list (or an updater of one); keep the first.
  const setImage = (k) => (v) => setP((x) => {
    const list = typeof v === "function" ? v(x[k] ? [x[k]] : []) : v;
    return { ...x, [k]: list[0] || null };
  });
  const save = async (changes = {}) => {
    setBusy(true); setMsg({ error: "", ok: "" });
    try {
      const saved = await MK.saveMyPro(uid, { ...p, trades: tradesText.split(","), ...changes });
      setP(saved); setTradesText(saved.trades.join(", "));
      setMsg({ error: "", ok: changes.kind ? "You're now a builder — the Listings tab is open." : "Saved." });
      onSaved();
    } catch (e) { setMsg({ error: e.message, ok: "" }); }
    finally { setBusy(false); }
  };
  return (
    <div className="grid grid-cols-1 gap-5 lg:grid-cols-[1.4fr_1fr]">
      <Section title="Your public profile" sub={`${PRO_KINDS[pro.kind]?.label} · this is what buyers see.`}>
        <div className="space-y-3 border border-rule bg-card p-4">
          <Field label="Business name"><input className="ec-input w-full" maxLength={120} value={p.displayName} onChange={(e) => set("displayName", e.target.value)} /></Field>
          <Field label="Tagline"><input className="ec-input w-full" maxLength={160} value={p.tagline} onChange={(e) => set("tagline", e.target.value)} placeholder="e.g. Custom homes across Far North Queensland" /></Field>
          <Field label="About"><textarea className="ec-input w-full" rows={5} maxLength={4000} value={p.bio} onChange={(e) => set("bio", e.target.value)} /></Field>
          <Field label="Work you do" hint="Comma-separated, e.g. new homes, extensions, decks">
            <input className="ec-input w-full" value={tradesText} onChange={(e) => setTradesText(e.target.value)} />
          </Field>
          <Field group label="Where you work"><StateChips value={p.regions} onChange={(v) => set("regions", v)} /></Field>
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
            <Field label="Licence number"><input className="ec-input w-full" maxLength={40} value={p.licenceNumber} onChange={(e) => set("licenceNumber", e.target.value)} /></Field>
            <Field label="Licence state">
              <select className="ec-select w-full" value={p.licenceState} onChange={(e) => set("licenceState", e.target.value)}>
                <option value="">—</option>{STATES.map((s) => <option key={s}>{s}</option>)}
              </select>
            </Field>
            <Field label="ABN"><input className="ec-input w-full" inputMode="numeric" maxLength={14} value={p.abn} onChange={(e) => set("abn", e.target.value)} /></Field>
          </div>
          <p className="text-[11px] text-steel">Your licence number is shown so buyers can check it themselves. Licences, insurance and permits are your responsibility.</p>
          {msg.error && <p className="text-xs text-alert">{msg.error}</p>}
          {msg.ok && <p className="text-xs text-ok">{msg.ok}</p>}
          <div className="flex flex-wrap gap-2">
            <Button variant="outline" disabled={busy || p.displayName.trim().length < 2} onClick={() => save()}>Save</Button>
            {p.published
              ? <Button variant="subtle" disabled={busy} onClick={() => save({ published: false })}>Hide from buyers</Button>
              : <Button variant="hivis" disabled={busy || p.displayName.trim().length < 2} onClick={() => save({ published: true })}>Save & publish</Button>}
          </div>
          {p.kind !== "builder" && canBuild && (
            <div className="border-t border-rule pt-3">
              <p className="text-xs text-ink-soft">You're on the Builder plan. Switch this profile to a builder to list house plans and prefab modules — your portfolio and enquiries stay.</p>
              <Button className="mt-2" size="sm" variant="outline" disabled={busy}
                onClick={() => confirm("Switch to a builder profile?") && save({ kind: "builder" })}>Switch to builder</Button>
            </div>
          )}
        </div>
      </Section>
      <Section title="Logo & cover">
        <div className="space-y-3 border border-rule bg-card p-4">
          <Field group label="Logo"><MediaPicker uid={uid} single paths={p.logoPath ? [p.logoPath] : []} onChange={setImage("logoPath")} /></Field>
          <Field group label="Cover photo"><MediaPicker uid={uid} single paths={p.coverPath ? [p.coverPath] : []} onChange={setImage("coverPath")} /></Field>
          <p className="text-[11px] text-steel">Press Save after changing images.</p>
        </div>
      </Section>
    </div>
  );
}

/* ======================================================================== */
/*  Shared bits                                                             */
/* ======================================================================== */

function MediaPicker({ uid, paths, onChange, single }) {
  const [busy, setBusy] = useState(0);
  const [error, setError] = useState("");
  const add = async (e) => {
    const files = [...(e.target.files || [])].slice(0, single ? 1 : 20 - paths.length);
    e.target.value = "";
    if (!files.length) return;
    setError(""); setBusy(files.length);
    const added = [];
    for (const f of files) {
      try { added.push(await MK.uploadMedia(f, uid)); }
      catch (err) { setError(err.message); }
      setBusy((n) => n - 1);
    }
    // Updater, not a value: the list may have changed while files uploaded.
    if (added.length) onChange(single ? () => added.slice(0, 1) : (prev) => [...prev, ...added].slice(0, 20));
  };
  const removeAt = (path) => onChange((prev) => prev.filter((x) => x !== path));
  const coverFirst = (path) => onChange((prev) => [path, ...prev.filter((x) => x !== path)]);
  return (
    <div>
      <div className={cn("grid gap-2", single ? "grid-cols-2" : "grid-cols-3")}>
        {paths.map((p, i) => (
          <div key={p} className="group relative border border-rule">
            <Photo path={p} alt="" className="aspect-[4/3] w-full" />
            {!single && i === 0 && <span className="absolute left-1 top-1 bg-hivis px-1 font-mono text-[9px] font-bold uppercase text-on-hivis">Cover</span>}
            <div className="absolute right-1 top-1 flex gap-1">
              {!single && i > 0 && <button type="button" onClick={() => coverFirst(p)} aria-label="Make cover photo" className="bg-card/90 px-1 font-mono text-[9px] font-bold uppercase text-ink">Cover</button>}
              <button type="button" onClick={() => removeAt(p)} aria-label="Remove photo" className="bg-card/90 p-0.5 text-ink"><X className="size-3" /></button>
            </div>
          </div>
        ))}
        {(single ? paths.length === 0 : paths.length < 20) && (
          <label className={cn("flex aspect-[4/3] cursor-pointer flex-col items-center justify-center gap-1 border border-dashed border-rule bg-paper-light text-steel hover:border-ink hover:text-ink", busy && "cursor-wait")}>
            <ImagePlus className="size-5" />
            <span className="font-mono text-[9px] font-bold uppercase tracking-[0.08em]">{busy ? `Uploading ${busy}…` : "Add"}</span>
            <input type="file" accept="image/jpeg,image/png,image/webp,image/heic,image/heif,.heic,.heif" multiple={!single} onChange={add} disabled={!!busy} className="hidden" />
          </label>
        )}
      </div>
      {error && <p className="mt-1 text-xs text-alert">{error}</p>}
    </div>
  );
}

function StateChips({ value = [], onChange }) {
  const toggle = (s) => onChange(value.includes(s) ? value.filter((x) => x !== s) : [...value, s]);
  return (
    <div className="flex flex-wrap gap-1">
      {STATES.map((s) => (
        <button key={s} type="button" onClick={() => toggle(s)} aria-pressed={value.includes(s)}
          className={cn("h-7 min-w-11 border px-2 font-mono text-[10px] font-bold",
            value.includes(s) ? "border-emphasis bg-emphasis text-on-emphasis" : "border-rule bg-card text-steel hover:border-ink")}>
          {s}
        </button>
      ))}
      <button type="button" onClick={() => onChange(value.length === STATES.length ? [] : [...STATES])}
        className="h-7 px-2 font-mono text-[10px] font-bold uppercase text-steel hover:text-ink">
        {value.length === STATES.length ? "Clear" : "National"}
      </button>
    </div>
  );
}

function Photo({ path, alt, className, quiet, natural }) {
  const url = MK.mediaUrl(path);
  const [broken, setBroken] = useState(false);
  if (!url || broken) {
    return (
      <div className={cn("grid place-items-center bg-paper-light text-steel", className)}>
        {!quiet && <Building2 className="size-6 opacity-40" />}
      </div>
    );
  }
  return <img src={url} alt={alt} loading="lazy" onError={() => setBroken(true)} className={cn(natural ? "h-auto" : "object-cover", "bg-paper-light", className)} />;
}

function Logo({ pro, size }) {
  const url = MK.mediaUrl(pro?.logoPath);
  const cls = size === "lg" ? "size-16 text-xl" : "size-10 text-sm";
  if (url) return <img src={url} alt="" className={cn(cls, "shrink-0 border border-rule bg-card object-cover")} />;
  const initials = (pro?.displayName || "?").split(/\s+/).slice(0, 2).map((w) => w[0]).join("").toUpperCase();
  return <span className={cn(cls, "grid shrink-0 place-items-center bg-emphasis font-display text-on-emphasis")}>{initials}</span>;
}

function HairGrid({ cols, className, children }) {
  return (
    <div className={cn("overflow-hidden rounded-sm border border-rule bg-rule", className)}>
      <div className={cn("grid gap-px", cols)}>{children}</div>
    </div>
  );
}

/* The green tick staff add after checking a seller's ABN and licence on the
   public registers. The Terms ("sellers") say exactly this; keep them in step. */
const VERIFIED_NOTE = "ABN and licence checked by BuildYourOwn on the public registers.";

function VerifiedTick({ className }) {
  return (
    <span title={`Verified: ${VERIFIED_NOTE}`} className="inline-flex align-middle">
      <BadgeCheck className={cn("text-ok", className)} aria-label={`Verified: ${VERIFIED_NOTE}`} />
    </span>
  );
}

function Kpi({ label, value, foot, icon: Icon, accent, onClick }) {
  const Tag = onClick ? "button" : "div";
  return (
    <Tag onClick={onClick} className={cn("flex flex-col justify-between gap-2 p-4 text-left", accent ? "bg-emphasis" : "bg-card", onClick && "transition-colors hover:bg-paper-light", onClick && accent && "hover:bg-emphasis/90")}>
      <div className="flex items-center justify-between gap-2">
        <span className={cn("font-mono text-[10px] font-bold uppercase tracking-[0.16em]", accent ? "text-on-emphasis-soft" : "text-steel")}>{label}</span>
        {Icon && <Icon className={cn("size-3.5", accent ? "text-on-emphasis" : "text-steel")} />}
      </div>
      <div className={cn("font-mono text-[26px] font-bold leading-none tabular-nums", accent ? "text-on-emphasis" : "text-ink")}>{value ?? 0}</div>
      <div className={cn("text-[10px] leading-snug", accent ? "text-on-emphasis-soft" : "text-steel")}>{foot}</div>
    </Tag>
  );
}

function Section({ title, sub, action, children, className }) {
  return (
    <section className={className}>
      <div className="mb-2 flex items-end justify-between gap-3">
        <div>
          <h3 className="font-display text-lg leading-tight text-ink">{title}</h3>
          {sub && <p className="text-xs text-steel">{sub}</p>}
        </div>
        {action}
      </div>
      {children}
    </section>
  );
}

/* `group` for anything that isn't a single input (button rows, pickers): a
   <label> forwards every click inside it to its first button, so a tap on a
   photo would hit that photo's Remove. Groups use role="group" instead. */
function Field({ label, hint, children, group }) {
  const Tag = group ? "div" : "label";
  return (
    <Tag className="block" {...(group ? { role: "group", "aria-label": label } : {})}>
      <span className="mb-1 block font-mono text-[10px] font-bold uppercase tracking-[0.1em] text-steel">{label}</span>
      {children}
      {hint && <span className="mt-0.5 block text-[10px] text-steel">{hint}</span>}
    </Tag>
  );
}

function Notice({ children, tone }) {
  return (
    <div className={cn("mb-4 border px-4 py-3 text-sm",
      tone === "alert" ? "border-alert bg-error-wash text-alert" : tone === "warn" ? "border-hivis-deep bg-warn-wash text-ink" : "border-dashed border-rule bg-card text-steel")}>
      {children}
    </div>
  );
}

function BackBar({ onBack, children }) {
  return (
    <>
      <button onClick={onBack} className="mb-4 flex items-center gap-1 font-mono text-[10px] font-bold uppercase tracking-[0.08em] text-steel hover:text-ink">
        <ArrowLeft className="size-3.5" /> Back
      </button>
      {children}
    </>
  );
}

function CardSkeletons({ n = 8 }) {
  return (
    <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4" aria-busy="true">
      {Array.from({ length: n }, (_, i) => (
        <div key={i} className="border border-rule bg-card">
          <div className="aspect-[4/3] animate-pulse bg-paper-light" />
          <div className="space-y-2 p-3.5"><div className="h-3 w-3/4 animate-pulse bg-paper-light" /><div className="h-3 w-1/2 animate-pulse bg-paper-light" /></div>
        </div>
      ))}
    </div>
  );
}

function Modal({ title, onClose, children, wide }) {
  useBackClose(onClose);   // Escape and the phone's Back button close it
  return (
    <div className="fixed inset-0 z-[80] grid place-items-center bg-black/50 p-3" onClick={onClose} role="dialog" aria-modal="true" aria-label={title}>
      <div onClick={(e) => e.stopPropagation()} className={cn("max-h-[92vh] w-full overflow-y-auto border border-rule bg-card p-5 shadow-xl", wide ? "max-w-3xl" : "max-w-lg")}>
        <div className="mb-3 flex items-start justify-between gap-3">
          <h3 className="font-display text-xl leading-tight text-ink">{title}</h3>
          <button onClick={onClose} aria-label="Close" className="text-steel hover:text-ink"><X className="size-4" /></button>
        </div>
        {children}
      </div>
    </div>
  );
}
