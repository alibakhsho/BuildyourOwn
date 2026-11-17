/* =========================================================================
   mobile/screens/Builds.jsx — every saved build on this phone
   ========================================================================= */
import { useEffect, useState } from "react";
import { Plus, House, Building2, Monitor, CloudOff, Cloud, CircleUser } from "lucide-react";
import { Estimator } from "../../logic/estimator.js";
import { listProjects, createProject, onProjectsChanged } from "../../state/projects.js";
import { useCloudSync } from "../../state/cloud-sync.js";
import { useAuth } from "../../state/auth.jsx";
import { MODE_LABEL } from "../../lib/entitlements.js";
import { starterSpec, houseSummary } from "../house.js";
import { money, grossTotal } from "../ui.jsx";

const ago = (t) => {
  const d = Math.round((Date.now() - (t || 0)) / 86400000);
  return d <= 0 ? "today" : d === 1 ? "yesterday" : d < 30 ? `${d} days ago` : new Date(t).toLocaleDateString("en-AU", { day: "numeric", month: "short" });
};

export default function BuildsScreen({ region, onOpen, onSignIn, onAccount }) {
  const { user, enabled } = useAuth();
  const sync = useCloudSync();
  const [projects, setProjects] = useState(listProjects);
  useEffect(() => {
    const refresh = () => setProjects(listProjects());
    const off = onProjectsChanged(refresh);
    window.addEventListener("byo:projects-synced", refresh);
    return () => { off(); window.removeEventListener("byo:projects-synced", refresh); };
  }, []);

  const newBuild = () => {
    const p = createProject({ name: "My build", userType: "homeowner", buildMode: "residential", region, spec: starterSpec() });
    onOpen(p.id);
  };

  return (
    <div>
      <header className="m-top">
        <span className="m-top-title" style={{ fontSize: 22, fontWeight: 800, paddingLeft: 4 }}>Your builds</span>
        <button className="m-btn m-btn-sm" onClick={newBuild}><Plus size={18} />New build</button>
        <button className="m-icon-btn" onClick={onAccount} aria-label="Account"><CircleUser size={24} /></button>
      </header>

      <div className="m-pad m-stack">
        {enabled && !user && projects.length > 0 && (
          <div className="m-note"><CloudOff size={16} /><span>These are saved on this phone only. <button className="m-link" style={{ padding: 0 }} onClick={onSignIn}>Sign in</button> to back them up and open them on a computer.</span></div>
        )}
        {user && sync.status === "synced" && (
          <p className="m-small" style={{ display: "flex", alignItems: "center", gap: 6, margin: 0 }}><Cloud size={14} />Backed up to your account</p>
        )}

        {projects.length === 0 ? (
          <div className="m-empty">
            <h2 className="m-h2">No builds yet</h2>
            <p>Start one and it's saved here as you go.</p>
            <button className="m-btn" style={{ marginTop: 12 }} onClick={newBuild}><Plus size={18} />New build</button>
          </div>
        ) : (
          <ul className="m-list m-card">
            {projects.map((p) => {
              const house = p.buildMode === "residential" && p.spec;
              return (
                <li key={p.id}>
                  <button className="m-list-row" onClick={() => onOpen(p.id)}>
                    <span className="m-thumb" aria-hidden="true">{house || p.buildMode === "residential" ? <House size={20} /> : <Building2 size={20} />}</span>
                    <span className="m-list-main">
                      <span className="m-list-title" style={{ display: "block" }}>{p.name}</span>
                      <span className="m-list-meta">
                        {house ? houseSummary(p.spec) : p.buildMode === "residential" ? "Not set up yet" : <><Monitor size={12} style={{ verticalAlign: -1 }} /> {MODE_LABEL[p.buildMode] || p.buildMode}, opens on a computer</>}
                        {" · "}{ago(p.updatedAt)}
                      </span>
                    </span>
                    {house && <span className="m-num" style={{ fontWeight: 700 }}>{money(grossTotal(Estimator.buildEstimate(p.spec, p.region || region)), p.region || region)}</span>}
                  </button>
                </li>
              );
            })}
          </ul>
        )}
      </div>
    </div>
  );
}
