/* =========================================================================
   AccountDashboard — the account strip at the top of the Dashboard screen.

   One dashboard for every plan, not one per tier: what changes with the
   plan is the limits shown, the shortcuts offered and whether an upgrade
   card appears. That keeps a single screen to maintain while still giving
   a Builder their Site Office shortcut and a Homeowner a clear sense of
   what they have.

   Signed out (with Supabase configured) it becomes a short invitation to
   create an account; with Supabase unconfigured it renders nothing.
   ========================================================================= */
import { useState } from "react";
import { colors as TOKENS } from "../design/system.js";
import { useAuth, TIERS } from "../state/auth.jsx";
import { useCloudSync, syncNow } from "../state/cloud-sync.js";
import AuthModal from "./AuthModal.jsx";

/* Which shortcuts each plan gets. Everything works for everyone today —
   this is about surfacing the right thing first, not gating. */
/* Shortcuts follow the plan: one per build mode it unlocks, plus Site
   Office where included (see lib/entitlements.js). */
const SHORTCUT_LABEL = {
  residential: "New house estimate",
  materials: "New custom quote",
  multi: "New multi-dwelling quote",
  highrise: "New developer feasibility",
  site: "Open Site Office",
};

function ago(t) {
  if (!t) return "";
  const s = Math.round((Date.now() - t) / 1000);
  if (s < 10) return "just now";
  if (s < 60) return `${s}s ago`;
  if (s < 3600) return `${Math.round(s / 60)} min ago`;
  return new Date(t).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
}

function Meter({ label, used, cap }) {
  const finite = Number.isFinite(cap);
  const pct = finite && cap > 0 ? Math.min(100, (used / cap) * 100) : 0;
  return (
    <div style={{ minWidth: 0 }}>
      <div style={{ display: "flex", justifyContent: "space-between", gap: 8 }}>
        <span className="ec-mono" style={{ fontSize: 10, letterSpacing: "0.1em", textTransform: "uppercase", color: TOKENS.steel }}>{label}</span>
        <span className="ec-mono" style={{ fontSize: 11, fontWeight: 700 }}>{used}{finite ? ` / ${cap}` : " · unlimited"}</span>
      </div>
      <div style={{ height: 8, background: TOKENS.paperLight, border: `1px solid ${TOKENS.rule}`, borderRadius: 99, marginTop: 8, overflow: "hidden" }}>
        <div style={{ width: finite ? `${Math.max(pct, 2)}%` : "100%", height: "100%", borderRadius: 99, background: pct >= 100 ? TOKENS.alert : TOKENS.hivis, opacity: finite ? 1 : 0.35, transition: "width .6s cubic-bezier(.2,.8,.2,1)" }} />
      </div>
    </div>
  );
}

export default function AccountDashboard({ projectCount, onNew, onOpenSiteOffice }) {
  const { enabled, loading, user, profile, tier, limits, can } = useAuth();
  const sync = useCloudSync();
  const [modal, setModal] = useState(null);

  if (!enabled) return null;
  if (loading) return <div className="ec-card" style={{ padding: 20, marginBottom: 20, color: TOKENS.steel, fontSize: 13 }}>Checking your account…</div>;

  if (!user) {
    return (
      <div className="ec-card" style={{ padding: 22, marginBottom: 22, display: "flex", gap: 18, alignItems: "center", justifyContent: "space-between", flexWrap: "wrap", background: `linear-gradient(160deg, ${TOKENS.accentWash}, transparent 55%), ${TOKENS.card}` }}>
        <div style={{ maxWidth: 640 }}>
          <div className="ec-eyebrow" style={{ marginBottom: 6 }}>You're working as a guest</div>
          <div style={{ fontSize: 14, lineHeight: 1.55, color: TOKENS.inkSoft }}>
            Your projects are saved in this browser only. Create a free account to keep them in the cloud and open them on any device.
          </div>
        </div>
        <div style={{ display: "flex", gap: 8 }}>
          <button className="ec-btn ec-btn-ghost" onClick={() => setModal("signin")}>Sign in</button>
          <button className="ec-btn ec-btn-hivis" onClick={() => setModal("signup")}>Create free account</button>
        </div>
        {modal && <AuthModal initialMode={modal} onClose={() => setModal(null)} />}
      </div>
    );
  }

  const name = profile?.full_name?.split(" ")[0] || user.email?.split("@")[0];
  const tierInfo = TIERS[tier] || TIERS.free;
  const localOnly = sync.local?.length || 0;
  const cloudCount = Math.max(0, projectCount - localOnly);
  const shortcuts = [...can.modes, ...(can.siteOffice ? ["site"] : [])];
  const syncText = sync.status === "syncing" ? "Syncing…"
    : sync.status === "error" ? `Sync problem: ${sync.error || "try again"}`
    : sync.lastSync ? `Saved to your account · ${ago(sync.lastSync)}` : "Connecting…";

  return (
    <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(300px, 1fr))", gap: 14, marginBottom: 22 }}>
      {/* Who + plan */}
      <div className="ec-card" style={{ padding: 22, background: `linear-gradient(160deg, ${TOKENS.accentWash}, transparent 55%), ${TOKENS.card}` }}>
        <div className="ec-eyebrow" style={{ marginBottom: 6 }}>Welcome back</div>
        <div className="ec-display" style={{ fontSize: 26, lineHeight: 1.05 }}>{name}</div>
        <div style={{ display: "flex", gap: 8, alignItems: "center", marginTop: 10, flexWrap: "wrap" }}>
          <span className="ec-tag ec-tag-hivis">{tierInfo.label} plan</span>
          {profile?.company && <span className="ec-mono" style={{ fontSize: 11, color: TOKENS.steel }}>{profile.company}</span>}
        </div>
        <div className="ec-mono" style={{ fontSize: 11, marginTop: 14, color: sync.status === "error" ? TOKENS.alert : TOKENS.steel, display: "flex", gap: 10, alignItems: "center", flexWrap: "wrap" }}>
          <span>{syncText}</span>
          <button className="ec-btn ec-btn-ghost" style={{ fontSize: 10, padding: "3px 8px" }} onClick={() => syncNow()}>Sync now</button>
        </div>
      </div>

      {/* Usage against plan */}
      <div className="ec-card" style={{ padding: 22, display: "flex", flexDirection: "column", gap: 16 }}>
        <div className="ec-eyebrow">Your plan</div>
        <Meter label="Projects in the cloud" used={cloudCount} cap={limits.projects} />
        {can.ai
          ? <Meter label="AI plan reads" used={profile?.plan_reads_used || 0} cap={can.planReads} />
          : <div style={{ fontSize: 12, color: TOKENS.steel }}>AI assistant: not on your plan.</div>}
        {localOnly > 0 && (
          <div style={{ fontSize: 12, lineHeight: 1.5, color: TOKENS.inkSoft }}>
            {localOnly} project{localOnly > 1 ? "s are" : " is"} saved on this device only — your plan keeps {limits.projects} in the cloud.
          </div>
        )}
      </div>

      {/* Shortcuts + plan */}
      <div className="ec-card" style={{ padding: 22, display: "flex", flexDirection: "column", gap: 10 }}>
        <div className="ec-eyebrow" style={{ marginBottom: 2 }}>Start something</div>
        {shortcuts.map((k) => (
          <button key={k} className={k === shortcuts[0] ? "ec-btn ec-btn-hivis" : "ec-btn ec-btn-ghost"} style={{ justifyContent: "flex-start" }}
            onClick={() => (k === "site" ? onOpenSiteOffice?.() : onNew?.(k))}>
            {SHORTCUT_LABEL[k]}
          </button>
        ))}
        {tier !== "enterprise" && (
          <div style={{ fontSize: 12, lineHeight: 1.5, color: TOKENS.steel, marginTop: 4 }}>
            Paid plans (Tradie, Builder) are coming soon. Everything in the app is free while we launch.
          </div>
        )}
      </div>
    </div>
  );
}
