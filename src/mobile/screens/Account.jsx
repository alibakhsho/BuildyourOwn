/* =========================================================================
   mobile/screens/Account.jsx — account, plan and settings
   Reached from the avatar in each screen's top bar, not a tab: tabs are
   for places you work in, and this is somewhere you visit now and then.
   ========================================================================= */
import { useState } from "react";
import { ChevronLeft, ChevronRight, Monitor, FileText, Shield, Sparkles, LogIn } from "lucide-react";
import AuthModal from "../../components/AuthModal.jsx";
import { useAuth, TIERS } from "../../state/auth.jsx";
import { useTheme } from "../../design/theme.js";
import { switchLayout } from "../layout.js";
import { Segmented } from "../ui.jsx";

const REGIONS = [{ id: "AU", label: "Australia" }, { id: "US", label: "US" }, { id: "UK", label: "UK" }];
const THEMES = [{ id: "light", label: "Light" }, { id: "dark", label: "Dark" }];

export default function AccountScreen({ region, setRegion, onBack, onPlans, onLegal }) {
  const { enabled, user, profile, tier, can } = useAuth();
  const { theme, setTheme } = useTheme();
  const [auth, setAuth] = useState(null); // "signin" | "signup"

  const planLabel = `${TIERS[tier]?.label ?? "Homeowner"}${can.onTrial ? " trial" : ""}`;
  const Row = ({ icon, title, meta, onClick }) => (
    <li><button className="m-list-row" onClick={onClick}>
      <span className="m-thumb" aria-hidden="true">{icon}</span>
      <span className="m-list-main"><span className="m-list-title" style={{ display: "block" }}>{title}</span>{meta && <span className="m-list-meta">{meta}</span>}</span>
      <ChevronRight size={18} style={{ color: "var(--m-ink2)" }} />
    </button></li>
  );

  return (
    <div>
      <header className="m-top">
        <button className="m-icon-btn" onClick={onBack} aria-label="Back"><ChevronLeft size={26} /></button>
        <span className="m-top-title">Account</span>
      </header>
      <div className="m-pad m-stack">
        {enabled && (user ? (
          <section className="m-card m-card-pad">
            <div style={{ fontSize: 19, fontWeight: 800 }}>{profile?.full_name || user.email?.split("@")[0]}</div>
            <div className="m-small">{user.email}</div>
            <div className="m-row-between" style={{ marginTop: 14 }}>
              <span><span className="m-small">Plan</span><div style={{ fontWeight: 750 }}>{planLabel}</div></span>
              <button className="m-btn m-btn-sm m-btn-soft" onClick={() => setAuth("signin")}>Manage account</button>
            </div>
          </section>
        ) : (
          <section className="m-card m-card-pad">
            <h2 className="m-h2">Keep your builds safe</h2>
            <p className="m-sub" style={{ marginBottom: 14 }}>Sign in to back up your builds and open them on a computer. Pricing a build never needs an account.</p>
            <div style={{ display: "grid", gap: 10 }}>
              <button className="m-btn" onClick={() => setAuth("signup")}>Create account</button>
              <button className="m-btn m-btn-soft" onClick={() => setAuth("signin")}><LogIn size={18} />Sign in</button>
            </div>
          </section>
        ))}

        <ul className="m-list m-card">
          <Row icon={<Sparkles size={20} />} title="Plans" meta="Homeowner is free. Tradie and Builder have 14-day trials." onClick={onPlans} />
          <Row icon={<Monitor size={20} />} title="Use the full version" meta="Takeoffs, imports, multi-dwelling and developer estimates, the drawing set and the 3D Studio" onClick={() => switchLayout("full")} />
        </ul>

        <section className="m-card m-card-pad m-stack">
          <div><span className="m-label">Rates for new builds</span><Segmented label="Region" options={REGIONS} value={region} onChange={setRegion} /></div>
          <div><span className="m-label">Appearance</span><Segmented label="Appearance" options={THEMES} value={theme} onChange={setTheme} /></div>
        </section>

        <ul className="m-list m-card">
          <Row icon={<FileText size={20} />} title="Terms of Use" onClick={() => onLegal("terms")} />
          <Row icon={<Shield size={20} />} title="Privacy Policy" onClick={() => onLegal("privacy")} />
        </ul>
        <p className="m-small" style={{ textAlign: "center", margin: "8px 0 0" }}>Build Your Own, made in Australia</p>
      </div>
      {auth && <AuthModal initialMode={auth} onClose={() => setAuth(null)} />}
    </div>
  );
}
