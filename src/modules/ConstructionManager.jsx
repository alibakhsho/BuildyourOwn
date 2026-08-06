/* =========================================================================
   MODULE: modules/ConstructionManager.jsx
   The builder-facing side of BuildYourOwn.

   The estimator answers "what will this cost?". This answers the questions
   that come after the quote is accepted and that actually decide whether a
   builder makes money: what did we commit, what changed, what have we
   claimed, and where is the job bleeding.

   Structure:
     Dashboard  — pipeline value, jobs on site, unclaimed revenue, at-risk trades
     Jobs       — pipeline board, lead → on site → closed
     Job detail — Overview / Takeoff / Budget / POs / Variations / Claims /
                  Schedule / Diary / Documents
     Clients    — the contact book that feeds Xero/MYOB
     Settings   — company details and accounting connections

   This screen deliberately has a left rail. The estimator does not — a
   homeowner pricing a deck wants one path through. A builder running six
   jobs needs to jump sideways constantly, and hiding that behind a linear
   stepper would be the wrong shape for the work.
   ========================================================================= */

import React, { useCallback, useEffect, useMemo, useState } from "react";
import { colors as TOKENS } from "../design/system.js";
import { fmt, currencySymbol } from "../lib/format.js";
import * as CM from "../state/cm.js";
import TakeoffCanvas, { TakeoffSheets } from "./TakeoffCanvas.jsx";
import Integrations from "./Integrations.jsx";
import { pushClaim, pushPurchaseOrder, claimToLineItems } from "../lib/accounting.js";
import { Dashboard } from "@/components/dashboard.jsx";
import { AppShell, SITE_OFFICE_NAV } from "@/components/app-shell.jsx";
import { Button } from "@/components/ui/button";
import { Plus } from "lucide-react";

import { track } from "../lib/analytics.js";

const JOB_MODULES = [
  { id: "overview", label: "Overview" },
  { id: "takeoff", label: "Takeoff" },
  { id: "budget", label: "Budget" },
  { id: "purchase_orders", label: "Purchase orders" },
  { id: "variations", label: "Variations" },
  { id: "claims", label: "Claims" },
  { id: "schedule", label: "Schedule" },
  { id: "diary", label: "Site diary" },
  { id: "documents", label: "Documents" },
];

export default function ConstructionManager({ onOpenEstimator }) {
  const [view, setView] = useState("dashboard");
  const [jobId, setJobId] = useState(null);
  const [search, setSearch] = useState("");
  const [creating, setCreating] = useState(false);
  const [, force] = useState(0);
  const refresh = useCallback(() => force((n) => n + 1), []);

  // One subscription for the whole screen: the store is small and every
  // panel reads derived roll-ups, so targeted subscriptions would just be
  // more code for the same repaint.
  useEffect(() => CM.subscribe(refresh), [refresh]);

  // Adopt any pre-existing estimator projects as jobs, once, on first mount.
  useEffect(() => {
    const n = CM.migrateLegacyProjects();
    if (n) console.info(`[cm] Adopted ${n} existing project${n === 1 ? "" : "s"} as jobs.`);
  }, []);

  const job = jobId ? CM.getJob(jobId) : null;
  const goto = (v) => { setView(v); setJobId(null); };

  const crumbs = [{ label: "Site Office", onClick: job ? () => goto("dashboard") : undefined }];
  if (job) {
    crumbs.push({ label: "Jobs", onClick: () => goto("jobs") }, { label: job.jobNo });
  } else {
    crumbs.push({ label: SITE_OFFICE_NAV.find((n) => n.id === view)?.label || view });
  }

  return (
    <AppShell
      view={jobId ? "jobs" : view}
      onView={goto}
      breadcrumb={crumbs}
      search={search}
      onSearch={setSearch}
      actions={
        <Button variant="hivis" size="sm" onClick={() => setCreating(true)}>
          <Plus className="size-3.5" /> New job
        </Button>
      }
    >
      {job ? (
        <JobDetail job={job} onBack={() => setJobId(null)} onOpenEstimator={onOpenEstimator} />
      ) : view === "dashboard" ? (
        <Dashboard onOpenJob={setJobId} onSeeAll={() => goto("jobs")} onNewJob={() => setCreating(true)} />
      ) : view === "jobs" ? (
        <JobsScreen onOpenJob={setJobId} search={search} onNew={() => setCreating(true)} />
      ) : view === "clients" ? (
        <ClientsScreen search={search} />
      ) : (
        <SettingsScreen />
      )}

      {creating && (
        <NewJobDialog onClose={() => setCreating(false)} onCreated={(j) => { setCreating(false); setJobId(j.id); }} />
      )}
    </AppShell>
  );
}

/* ========================================================================
   Dashboard
   ======================================================================== */

/* ========================================================================
   Jobs
   ======================================================================== */

function JobsScreen({ onOpenJob, search = "", onNew }) {
  const jobs = CM.listJobs();
  const [filter, setFilter] = useState("all");

  const q = search.trim().toLowerCase();
  const shown = jobs
    .filter((j) => filter === "all" || j.status === filter)
    // Matches job name, number and site address — the three things a builder
    // actually remembers about a job they are hunting for.
    .filter((j) => !q || [j.name, j.jobNo, j.siteAddress].some((v) => (v || "").toLowerCase().includes(q)));

  return (
    <>
      <PageHead title="Jobs" sub={q ? `${shown.length} of ${jobs.length} matching “${search.trim()}”` : `${jobs.length} job${jobs.length === 1 ? "" : "s"}`} />

      <div style={{ display: "flex", gap: 6, flexWrap: "wrap", marginBottom: 16 }}>
        <Chip active={filter === "all"} onClick={() => setFilter("all")} label={`All (${jobs.length})`} />
        {CM.JOB_STATUS.map((s) => {
          const n = jobs.filter((j) => j.status === s.id).length;
          if (!n && s.id === "lost") return null;
          return <Chip key={s.id} active={filter === s.id} onClick={() => setFilter(s.id)} label={`${s.label} (${n})`} />;
        })}
      </div>

      {!shown.length ? (
        <Empty>
          {q ? "Nothing matches that search." : jobs.length ? "No jobs at that stage." : "No jobs yet. Create one to start a takeoff, or open the estimator and price something first."}
        </Empty>
      ) : (
        <div style={{ display: "grid", gap: 8 }}>
          {shown.map((j) => <JobRow key={j.id} job={j} onOpen={() => onOpenJob(j.id)} />)}
        </div>
      )}
    </>
  );
}

function JobRow({ job, onOpen }) {
  const client = job.clientId ? CM.getClient(job.clientId) : null;
  const sum = CM.contractSum(job.id);
  const status = CM.JOB_STATUS.find((s) => s.id === job.status);
  const cur = currencySymbol(job.region || "AU");
  return (
    <div onClick={onOpen}
      style={{ display: "grid", gridTemplateColumns: "minmax(0,1fr) auto", gap: 12, alignItems: "center", padding: "12px 14px", background: TOKENS.card, border: `1px solid ${TOKENS.rule}`, cursor: "pointer" }}>
      <div style={{ minWidth: 0 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 3 }}>
          <span className="ec-mono" style={{ fontSize: 10, color: TOKENS.steel }}>{job.jobNo}</span>
          <StatusPill status={status} />
        </div>
        <div className="ec-display" style={{ fontSize: 17, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{job.name}</div>
        <div className="ec-mono" style={{ fontSize: 10, color: TOKENS.steel, marginTop: 2, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
          {[client?.company || client?.name, job.siteAddress].filter(Boolean).join(" · ") || "No client or site set"}
        </div>
      </div>
      <div className="ec-mono" style={{ textAlign: "right", whiteSpace: "nowrap" }}>
        <div style={{ fontSize: 17, fontWeight: 700 }}>{sum > 0 ? `${cur}${fmt(sum)}` : "—"}</div>
        <div style={{ fontSize: 9, color: TOKENS.steel }}>contract sum</div>
      </div>
    </div>
  );
}

function StatusPill({ status }) {
  if (!status) return null;
  const bg = { pre: TOKENS.paperLight, active: TOKENS.hivis, done: TOKENS.rule }[status.group];
  // The active pill sits on safety yellow, which is the same colour in both
  // themes — so its text must be onHivis, not ink. `ink` flips to near-white
  // in dark and left the pill unreadable.
  const fg = status.group === "active" ? TOKENS.onHivis : TOKENS.ink;
  return (
    <span className="ec-mono" title={status.hint}
      style={{ fontSize: 9, letterSpacing: "0.1em", fontWeight: 700, padding: "2px 7px", background: bg, border: `1px solid ${TOKENS.rule}`, color: fg }}>
      {status.label.toUpperCase()}
    </span>
  );
}

function NewJobDialog({ onClose, onCreated }) {
  const clients = CM.listClients();
  const [form, setForm] = useState({ name: "", clientId: "", siteAddress: "", contractValue: "", newClientName: "" });
  const set = (k) => (e) => setForm({ ...form, [k]: e.target.value });

  const submit = () => {
    if (!form.name.trim()) return;
    let clientId = form.clientId;
    if (!clientId && form.newClientName.trim()) {
      clientId = CM.createClient({ name: form.newClientName.trim() }).id;
    }
    onCreated(
      CM.createJob({
        name: form.name.trim(),
        clientId: clientId || null,
        siteAddress: form.siteAddress.trim(),
        contractValue: Number(form.contractValue) || 0,
      })
    );
    track("job_created", { contractValue: Number(form.contractValue) || 0 });
  };

  return (
    <Dialog title="New job" onClose={onClose}>
      <Field label="Job name"><input className="ec-input" autoFocus value={form.name} onChange={set("name")} placeholder="Smith residence — new build" /></Field>
      <Field label="Client">
        <select className="ec-select" value={form.clientId} onChange={set("clientId")}>
          <option value="">— new client —</option>
          {clients.map((c) => <option key={c.id} value={c.id}>{c.company || c.name}</option>)}
        </select>
      </Field>
      {!form.clientId && (
        <Field label="New client name"><input className="ec-input" value={form.newClientName} onChange={set("newClientName")} placeholder="Leave blank to add later" /></Field>
      )}
      <Field label="Site address"><input className="ec-input" value={form.siteAddress} onChange={set("siteAddress")} /></Field>
      <Field label="Contract value (ex GST)" hint="Leave at 0 until you've quoted — variations build on top of this.">
        <input className="ec-input" type="number" min="0" step="1000" value={form.contractValue} onChange={set("contractValue")} />
      </Field>
      <div style={{ display: "flex", gap: 8, marginTop: 6 }}>
        <button className="ec-btn ec-btn-hivis" style={{ flex: 1 }} onClick={submit} disabled={!form.name.trim()}>Create job</button>
        <button className="ec-btn ec-btn-ghost" onClick={onClose}>Cancel</button>
      </div>
    </Dialog>
  );
}

/* ========================================================================
   Job detail
   ======================================================================== */

function JobDetail({ job, onBack, onOpenEstimator }) {
  const [module, setModule] = useState("overview");
  const [takeoffId, setTakeoffId] = useState(null);
  const client = job.clientId ? CM.getClient(job.clientId) : null;
  const fin = CM.jobFinancials(job.id);
  const cur = currencySymbol(job.region || "AU");

  return (
    <>
      <button onClick={onBack} className="ec-mono"
        style={{ border: "none", background: "none", cursor: "pointer", fontSize: 10, color: TOKENS.steel, padding: 0, marginBottom: 10 }}>
        ← all jobs
      </button>

      <div style={{ display: "flex", alignItems: "flex-start", gap: 16, flexWrap: "wrap", marginBottom: 16 }}>
        <div style={{ flex: 1, minWidth: 240 }}>
          <div className="ec-mono" style={{ fontSize: 10, color: TOKENS.steel }}>{job.jobNo}</div>
          <h1 className="ec-display" style={{ fontSize: 28, margin: "2px 0 6px" }}>{job.name}</h1>
          <div className="ec-mono" style={{ fontSize: 11, color: TOKENS.inkSoft }}>
            {[client?.company || client?.name, job.siteAddress].filter(Boolean).join(" · ") || "No client or site set"}
          </div>
        </div>
        <select className="ec-select" value={job.status} onChange={(e) => CM.setJobStatus(job.id, e.target.value)} style={{ width: 190 }}>
          {CM.JOB_STATUS.map((s) => <option key={s.id} value={s.id}>{s.label} — {s.hint}</option>)}
        </select>
      </div>

      <div style={{ display: "flex", gap: 5, overflowX: "auto", borderBottom: `1px solid ${TOKENS.rule}`, marginBottom: 20, paddingBottom: 0 }}>
        {JOB_MODULES.map((m) => {
          const active = module === m.id;
          return (
            <button key={m.id} onClick={() => setModule(m.id)} className="ec-mono"
              style={{
                flexShrink: 0, padding: "8px 13px", fontSize: 10, letterSpacing: "0.06em",
                fontWeight: active ? 700 : 500, cursor: "pointer", border: "none",
                borderBottom: `2px solid ${active ? TOKENS.ink : "transparent"}`,
                background: "none", color: active ? TOKENS.ink : TOKENS.steel,
              }}>
              {m.label}
            </button>
          );
        })}
      </div>

      {module === "overview" && <Overview job={job} fin={fin} cur={cur} onOpenEstimator={onOpenEstimator} onModule={setModule} />}
      {module === "takeoff" && (
        takeoffId
          ? <>
              <button onClick={() => setTakeoffId(null)} className="ec-mono"
                style={{ border: "none", background: "none", cursor: "pointer", fontSize: 10, color: TOKENS.steel, padding: 0, marginBottom: 10 }}>
                ← all plan sheets
              </button>
              <TakeoffCanvas jobId={job.id} takeoffId={takeoffId} onQuoteLines={(lines) => alert(`${lines.length} line${lines.length === 1 ? "" : "s"} ready. Open the estimator to price them.`)} />
            </>
          : <TakeoffSheets jobId={job.id} activeId={takeoffId} onOpen={setTakeoffId} />
      )}
      {module === "budget" && <Budget job={job} fin={fin} cur={cur} />}
      {module === "purchase_orders" && <PurchaseOrders job={job} cur={cur} />}
      {module === "variations" && <Variations job={job} cur={cur} />}
      {module === "claims" && <Claims job={job} client={client} fin={fin} cur={cur} />}
      {module === "schedule" && <Schedule job={job} />}
      {module === "diary" && <Diary job={job} />}
      {module === "documents" && <Documents job={job} />}
    </>
  );
}

function Overview({ job, fin, cur, onOpenEstimator, onModule }) {
  const marginTone = fin.grossMarginPct < 5 ? "alert" : fin.grossMarginPct < 12 ? "warn" : "ok";
  return (
    <>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))", gap: 12, marginBottom: 20 }}>
        <Stat label="Contract sum" value={`${cur}${fmt(fin.contractSum)}`} sub="Incl. approved variations" hivis />
        <Stat label="Committed" value={`${cur}${fmt(fin.totalForecast)}`} sub="POs raised + variation cost" />
        <Stat label="Gross margin" value={`${cur}${fmt(fin.grossMargin)}`}
          sub={`${fin.grossMarginPct.toFixed(1)}% of contract`} alert={marginTone === "alert"} />
        <Stat label="Unclaimed" value={`${cur}${fmt(fin.unclaimed)}`} sub={`${cur}${fmt(fin.claimed)} claimed to date`} />
      </div>

      {fin.contractSum === 0 && (
        <Panel title="No contract value set" tone="warn">
          <p style={{ margin: "0 0 10px", fontSize: 13, lineHeight: 1.6 }}>
            Margin and claim figures stay at zero until this job has a contract sum. Price it in the estimator, then
            set the value on the job.
          </p>
          {onOpenEstimator && <button className="ec-btn ec-btn-ghost" onClick={() => onOpenEstimator(job)}>Open in estimator</button>}
        </Panel>
      )}

      {fin.atRiskCount > 0 && (
        <Panel title={`${fin.atRiskCount} cost centre${fin.atRiskCount === 1 ? "" : "s"} over budget`} tone="alert">
          <button className="ec-btn ec-btn-ghost" onClick={() => onModule("budget")}>Review the budget</button>
        </Panel>
      )}

      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(240px, 1fr))", gap: 12 }}>
        <MiniCount label="Plan sheets" n={CM.listTakeoffs(job.id).length} onClick={() => onModule("takeoff")} />
        <MiniCount label="Purchase orders" n={CM.listPurchaseOrders(job.id).length} onClick={() => onModule("purchase_orders")} />
        <MiniCount label="Variations" n={CM.listVariations(job.id).length} onClick={() => onModule("variations")} />
        <MiniCount label="Progress claims" n={CM.listClaims(job.id).length} onClick={() => onModule("claims")} />
        <MiniCount label="Schedule tasks" n={CM.listTasks(job.id).length} onClick={() => onModule("schedule")} />
        <MiniCount label="Diary entries" n={CM.listDiary(job.id).length} onClick={() => onModule("diary")} />
      </div>
    </>
  );
}

function MiniCount({ label, n, onClick }) {
  return (
    <button onClick={onClick}
      style={{ textAlign: "left", padding: "12px 14px", background: TOKENS.card, border: `1px solid ${TOKENS.rule}`, cursor: "pointer" }}>
      <div className="ec-mono" style={{ fontSize: 22, fontWeight: 700 }}>{n}</div>
      <div className="ec-mono" style={{ fontSize: 10, color: TOKENS.steel, letterSpacing: "0.08em" }}>{label.toUpperCase()}</div>
    </button>
  );
}

/* ---- Budget ------------------------------------------------------------ */

function Budget({ job, fin, cur }) {
  return (
    <>
      <SectionBar title="Budget vs committed"
        sub="Budget is what you allowed. Committed is what you've promised suppliers and subbies." />
      <div style={{ overflowX: "auto", border: `1px solid ${TOKENS.rule}`, background: TOKENS.card }}>
        <table style={{ width: "100%", borderCollapse: "collapse", minWidth: 700 }}>
          <thead>
            <tr>
              {["Code", "Cost centre", "Budget", "Committed", "Variations", "Variance"].map((h, i) => (
                <th key={h} className="ec-mono"
                  style={{ textAlign: i > 1 ? "right" : "left", fontSize: 9, letterSpacing: "0.12em", color: TOKENS.steel, padding: "8px 10px", borderBottom: `1px solid ${TOKENS.rule}`, whiteSpace: "nowrap" }}>
                  {h.toUpperCase()}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {fin.rows.map((r) => (
              <tr key={r.id} style={{ borderBottom: `1px dashed ${TOKENS.rule}`, background: r.atRisk ? TOKENS.errorWash : "transparent" }}>
                <td className="ec-mono" style={{ padding: "6px 10px", fontSize: 11, color: TOKENS.steel }}>{r.code}</td>
                <td style={{ padding: "6px 10px", fontSize: 12 }}>{r.name}</td>
                <td style={{ padding: "6px 10px", textAlign: "right" }}>
                  <input className="ec-input" type="number" min="0" step="100" value={r.budget}
                    onChange={(e) => CM.updateCostCentre(r.id, { budget: Number(e.target.value) || 0 })}
                    style={{ width: 110, textAlign: "right", padding: "3px 6px", fontSize: 11 }} />
                </td>
                <td className="ec-mono" style={{ padding: "6px 10px", textAlign: "right", fontSize: 11 }}>{r.committed ? fmt(r.committed) : "—"}</td>
                <td className="ec-mono" style={{ padding: "6px 10px", textAlign: "right", fontSize: 11 }}>{r.variationCost ? fmt(r.variationCost) : "—"}</td>
                <td className="ec-mono" style={{ padding: "6px 10px", textAlign: "right", fontSize: 11, fontWeight: 700, color: r.atRisk ? TOKENS.alert : TOKENS.ink }}>
                  {r.budget || r.forecast ? `${r.variance < 0 ? "−" : ""}${cur}${fmt(Math.abs(r.variance))}` : "—"}
                </td>
              </tr>
            ))}
          </tbody>
          <tfoot>
            <tr style={{ borderTop: `2px solid ${TOKENS.ink}` }}>
              <td colSpan={2} className="ec-mono" style={{ padding: "9px 10px", fontSize: 11, fontWeight: 700 }}>TOTAL</td>
              <td className="ec-mono" style={{ padding: "9px 10px", textAlign: "right", fontSize: 12, fontWeight: 700 }}>{cur}{fmt(fin.totalBudget)}</td>
              <td className="ec-mono" style={{ padding: "9px 10px", textAlign: "right", fontSize: 12, fontWeight: 700 }}>{cur}{fmt(fin.totalCommitted)}</td>
              <td className="ec-mono" style={{ padding: "9px 10px", textAlign: "right", fontSize: 12, fontWeight: 700 }}>{cur}{fmt(fin.totalVariationCost)}</td>
              <td className="ec-mono" style={{ padding: "9px 10px", textAlign: "right", fontSize: 12, fontWeight: 700 }}>{cur}{fmt(fin.totalBudget - fin.totalForecast)}</td>
            </tr>
          </tfoot>
        </table>
      </div>
      {fin.unassignedCommitted > 0 && (
        <Panel title="Uncoded commitments" tone="warn">
          {cur}{fmt(fin.unassignedCommitted)} of purchase orders has no cost centre, so it isn't counted against any
          trade above. Assign those POs to keep the variance column honest.
        </Panel>
      )}
    </>
  );
}

/* ---- Purchase orders --------------------------------------------------- */

function PurchaseOrders({ job, cur }) {
  const pos = CM.listPurchaseOrders(job.id);
  const centres = CM.listCostCentres(job.id);
  const [editing, setEditing] = useState(null);
  const [pushState, setPushState] = useState({});

  const push = async (po, provider) => {
    setPushState({ ...pushState, [po.id]: { busy: true } });
    try {
      const out = await pushPurchaseOrder(provider, { po, job });
      CM.updatePurchaseOrder(po.id, provider === "xero"
        ? { xeroPurchaseOrderId: out.purchaseOrderId }
        : { myobPurchaseOrderId: out.location });
      setPushState({ ...pushState, [po.id]: { ok: `Draft PO created in ${provider === "xero" ? "Xero" : "MYOB"}.` } });
    } catch (e) {
      setPushState({ ...pushState, [po.id]: { error: e.message } });
    }
  };

  return (
    <>
      <SectionBar title="Purchase orders" sub="A PO commits budget the moment it leaves draft."
        action={<button className="ec-btn ec-btn-hivis" onClick={() => setEditing(CM.createPurchaseOrder(job.id))}>New PO</button>} />

      {!pos.length ? <Empty>No purchase orders yet.</Empty> : (
        <div style={{ display: "grid", gap: 8 }}>
          {pos.map((po) => {
            const cc = centres.find((c) => c.id === po.costCentreId);
            const st = pushState[po.id] || {};
            return (
              <div key={po.id} style={{ background: TOKENS.card, border: `1px solid ${TOKENS.rule}`, padding: "12px 14px" }}>
                <div style={{ display: "flex", gap: 12, alignItems: "center", flexWrap: "wrap" }}>
                  <span className="ec-mono" style={{ fontSize: 11, fontWeight: 700 }}>{po.poNo}</span>
                  <span style={{ flex: 1, fontSize: 13, minWidth: 120 }}>{po.supplier || "No supplier"}</span>
                  <span className="ec-mono" style={{ fontSize: 10, color: TOKENS.steel }}>{cc ? cc.name : "uncoded"}</span>
                  <select className="ec-select" value={po.status} onChange={(e) => CM.updatePurchaseOrder(po.id, { status: e.target.value })}
                    style={{ width: 130, padding: "3px 6px", fontSize: 11 }}>
                    {CM.PO_STATUS.map((s) => <option key={s} value={s}>{s.replace(/_/g, " ")}</option>)}
                  </select>
                  <span className="ec-mono" style={{ fontSize: 13, fontWeight: 700, minWidth: 90, textAlign: "right" }}>{cur}{fmt(CM.poTotal(po))}</span>
                  <button className="ec-btn ec-btn-ghost" style={{ fontSize: 10, padding: "4px 10px" }} onClick={() => setEditing(po)}>Edit</button>
                </div>
                <div style={{ display: "flex", gap: 6, marginTop: 8, alignItems: "center", flexWrap: "wrap" }}>
                  <button className="ec-mono" onClick={() => push(po, "xero")} disabled={st.busy} style={tinyBtn}>Push to Xero</button>
                  <button className="ec-mono" onClick={() => push(po, "myob")} disabled={st.busy} style={tinyBtn}>Push to MYOB</button>
                  {st.busy && <span className="ec-mono" style={{ fontSize: 10, color: TOKENS.steel }}>sending…</span>}
                  {st.ok && <span className="ec-mono" style={{ fontSize: 10, color: TOKENS.ok }}>{st.ok}</span>}
                  {st.error && <span className="ec-mono" style={{ fontSize: 10, color: TOKENS.alert }}>{st.error}</span>}
                </div>
              </div>
            );
          })}
        </div>
      )}

      {editing && <POEditor po={editing} centres={centres} cur={cur} onClose={() => setEditing(null)} />}
    </>
  );
}

const tinyBtn = {
  padding: "4px 9px", fontSize: 10, fontWeight: 700, letterSpacing: "0.06em",
  border: `1px solid ${TOKENS.rule}`, background: TOKENS.paperLight, cursor: "pointer",
};

function POEditor({ po, centres, cur, onClose }) {
  const [lines, setLines] = useState(po.lines || []);
  const [head, setHead] = useState({
    supplier: po.supplier, supplierEmail: po.supplierEmail,
    costCentreId: po.costCentreId || "", requiredBy: po.requiredBy || "", notes: po.notes || "",
  });

  const total = lines.reduce((n, l) => n + (Number(l.qty) || 0) * (Number(l.rate) || 0), 0);
  const setLine = (i, k, v) => setLines(lines.map((l, j) => (j === i ? { ...l, [k]: v } : l)));

  const save = () => {
    CM.updatePurchaseOrder(po.id, { ...head, costCentreId: head.costCentreId || null, lines });
    onClose();
  };

  return (
    <Dialog title={`Purchase order ${po.poNo}`} wide onClose={onClose}>
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
        <Field label="Supplier"><input className="ec-input" value={head.supplier} onChange={(e) => setHead({ ...head, supplier: e.target.value })} /></Field>
        <Field label="Supplier email"><input className="ec-input" value={head.supplierEmail} onChange={(e) => setHead({ ...head, supplierEmail: e.target.value })} /></Field>
        <Field label="Cost centre" hint="Uncoded POs don't count against any trade budget.">
          <select className="ec-select" value={head.costCentreId} onChange={(e) => setHead({ ...head, costCentreId: e.target.value })}>
            <option value="">— none —</option>
            {centres.map((c) => <option key={c.id} value={c.id}>{c.code} {c.name}</option>)}
          </select>
        </Field>
        <Field label="Required by"><input className="ec-input" type="date" value={head.requiredBy} onChange={(e) => setHead({ ...head, requiredBy: e.target.value })} /></Field>
      </div>

      <div className="ec-label" style={{ margin: "12px 0 6px" }}>Lines</div>
      <div style={{ display: "grid", gap: 4 }}>
        {lines.map((l, i) => (
          <div key={i} style={{ display: "grid", gridTemplateColumns: "1fr 70px 60px 90px 80px 28px", gap: 5, alignItems: "center" }}>
            <input className="ec-input" placeholder="Description" value={l.description || ""} onChange={(e) => setLine(i, "description", e.target.value)} style={{ padding: "4px 7px", fontSize: 11 }} />
            <input className="ec-input" type="number" placeholder="Qty" value={l.qty ?? ""} onChange={(e) => setLine(i, "qty", e.target.value)} style={{ padding: "4px 7px", fontSize: 11 }} />
            <input className="ec-input" placeholder="Unit" value={l.unit || ""} onChange={(e) => setLine(i, "unit", e.target.value)} style={{ padding: "4px 7px", fontSize: 11 }} />
            <input className="ec-input" type="number" placeholder="Rate" value={l.rate ?? ""} onChange={(e) => setLine(i, "rate", e.target.value)} style={{ padding: "4px 7px", fontSize: 11 }} />
            <span className="ec-mono" style={{ fontSize: 11, textAlign: "right" }}>{fmt((Number(l.qty) || 0) * (Number(l.rate) || 0))}</span>
            <button onClick={() => setLines(lines.filter((_, j) => j !== i))}
              style={{ border: "none", background: "none", cursor: "pointer", color: TOKENS.steel, fontSize: 15 }}>×</button>
          </div>
        ))}
      </div>
      <button className="ec-mono" onClick={() => setLines([...lines, { description: "", qty: 1, unit: "ea", rate: 0 }])}
        style={{ ...tinyBtn, marginTop: 8 }}>+ Add line</button>

      <div className="ec-mono" style={{ textAlign: "right", fontSize: 16, fontWeight: 700, margin: "14px 0" }}>
        Total {cur}{fmt(total)}
      </div>

      <div style={{ display: "flex", gap: 8 }}>
        <button className="ec-btn ec-btn-hivis" style={{ flex: 1 }} onClick={save}>Save</button>
        <button className="ec-btn ec-btn-ghost" onClick={onClose}>Cancel</button>
      </div>
    </Dialog>
  );
}

/* ---- Variations -------------------------------------------------------- */

function Variations({ job, cur }) {
  const vars = CM.listVariations(job.id);
  const centres = CM.listCostCentres(job.id);
  const approved = vars.filter((v) => v.status === "approved");
  const pending = vars.filter((v) => ["draft", "submitted"].includes(v.status));

  return (
    <>
      <SectionBar title="Variations" sub="Only approved variations move the contract sum."
        action={<button className="ec-btn ec-btn-hivis" onClick={() => CM.createVariation(job.id)}>New variation</button>} />

      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))", gap: 12, marginBottom: 16 }}>
        <Stat label="Approved" value={`${cur}${fmt(approved.reduce((n, v) => n + (Number(v.charge) || 0), 0))}`} sub={`${approved.length} variation${approved.length === 1 ? "" : "s"}`} hivis />
        <Stat label="Pending" value={`${cur}${fmt(pending.reduce((n, v) => n + (Number(v.charge) || 0), 0))}`} sub={`${pending.length} awaiting approval`} />
        <Stat label="Margin on variations"
          value={`${cur}${fmt(approved.reduce((n, v) => n + ((Number(v.charge) || 0) - (Number(v.cost) || 0)), 0))}`}
          sub="Charge less cost" />
      </div>

      {!vars.length ? <Empty>No variations raised.</Empty> : (
        <div style={{ display: "grid", gap: 8 }}>
          {vars.map((v) => (
            <div key={v.id} style={{ background: TOKENS.card, border: `1px solid ${v.status === "approved" ? TOKENS.ok : TOKENS.rule}`, padding: "12px 14px" }}>
              <div style={{ display: "flex", gap: 10, alignItems: "center", flexWrap: "wrap", marginBottom: 8 }}>
                <span className="ec-mono" style={{ fontSize: 11, fontWeight: 700 }}>{v.varNo}</span>
                <input className="ec-input" value={v.title} onChange={(e) => CM.updateVariation(v.id, { title: e.target.value })}
                  style={{ flex: 1, minWidth: 150, padding: "4px 8px", fontSize: 12 }} />
                <select className="ec-select" value={v.status} onChange={(e) => CM.updateVariation(v.id, { status: e.target.value, approvedAt: e.target.value === "approved" ? Date.now() : null })}
                  style={{ width: 120, padding: "3px 6px", fontSize: 11 }}>
                  {CM.VARIATION_STATUS.map((s) => <option key={s} value={s}>{s}</option>)}
                </select>
                <button onClick={() => confirm(`Delete ${v.varNo}?`) && CM.deleteVariation(v.id)}
                  style={{ border: "none", background: "none", cursor: "pointer", color: TOKENS.steel, fontSize: 15 }}>×</button>
              </div>
              <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(130px, 1fr))", gap: 8 }}>
                <Field label="Cost to you">
                  <input className="ec-input" type="number" value={v.cost} onChange={(e) => CM.updateVariation(v.id, { cost: Number(e.target.value) || 0 })} style={{ padding: "4px 7px", fontSize: 11 }} />
                </Field>
                <Field label="Charge to client">
                  <input className="ec-input" type="number" value={v.charge} onChange={(e) => CM.updateVariation(v.id, { charge: Number(e.target.value) || 0 })} style={{ padding: "4px 7px", fontSize: 11 }} />
                </Field>
                <Field label="Delay (days)">
                  <input className="ec-input" type="number" value={v.scheduleImpactDays} onChange={(e) => CM.updateVariation(v.id, { scheduleImpactDays: Number(e.target.value) || 0 })} style={{ padding: "4px 7px", fontSize: 11 }} />
                </Field>
                <Field label="Cost centre">
                  <select className="ec-select" value={v.costCentreId || ""} onChange={(e) => CM.updateVariation(v.id, { costCentreId: e.target.value || null })} style={{ padding: "3px 6px", fontSize: 11 }}>
                    <option value="">— none —</option>
                    {centres.map((c) => <option key={c.id} value={c.id}>{c.code} {c.name}</option>)}
                  </select>
                </Field>
              </div>
            </div>
          ))}
        </div>
      )}
    </>
  );
}

/* ---- Progress claims --------------------------------------------------- */

function Claims({ job, client, fin, cur }) {
  const claims = CM.listClaims(job.id);
  const centres = CM.listCostCentres(job.id);
  const [pushState, setPushState] = useState({});

  const newClaim = () => {
    // Seed lines from the budget so the builder claims against the same
    // breakdown they costed, rather than inventing a schedule per claim.
    const lines = centres.filter((c) => c.budget > 0).map((c) => ({ name: c.name, value: c.budget, percentComplete: 0 }));
    CM.createClaim(job.id, { lines });
  };

  /** Everything certified on earlier claims — the deduction line. */
  const priorTotal = (claim) =>
    claims
      .filter((c) => c.claimNo < claim.claimNo && c.status !== "draft")
      .reduce((n, c) => n + CM.claimTotals(c, 0).workToDate, 0);

  const push = async (claim, provider) => {
    const totals = CM.claimTotals(claim, priorTotal(claim));
    if (totals.thisClaim <= 0) {
      setPushState({ ...pushState, [claim.id]: { error: "This claim has nothing new to invoice." } });
      return;
    }
    setPushState({ ...pushState, [claim.id]: { busy: true } });
    try {
      const out = await pushClaim(provider, {
        claim, job, client, totals,
        lineItems: claimToLineItems(claim, job, totals),
      });
      CM.updateClaim(claim.id, provider === "xero" ? { xeroInvoiceId: out.invoiceId } : { myobInvoiceId: out.location });
      setPushState({ ...pushState, [claim.id]: { ok: `Draft invoice created in ${provider === "xero" ? "Xero" : "MYOB"} — review and send it there.` } });
    } catch (e) {
      setPushState({ ...pushState, [claim.id]: { error: e.message } });
    }
  };

  return (
    <>
      <SectionBar title="Progress claims"
        sub={`Claimed ${cur}${fmt(fin.claimed)} of ${cur}${fmt(fin.contractSum)}. Retention and GST are applied in that order.`}
        action={<button className="ec-btn ec-btn-hivis" onClick={newClaim}>New claim</button>} />

      {!claims.length ? (
        <Empty>No claims yet. A new claim starts from your budget breakdown — set budgets first so there's something to claim against.</Empty>
      ) : (
        <div style={{ display: "grid", gap: 12 }}>
          {claims.map((claim) => {
            const prior = priorTotal(claim);
            const t = CM.claimTotals(claim, prior);
            const st = pushState[claim.id] || {};
            return (
              <div key={claim.id} style={{ background: TOKENS.card, border: `1px solid ${TOKENS.rule}`, padding: "14px 16px" }}>
                <div style={{ display: "flex", gap: 10, alignItems: "center", flexWrap: "wrap", marginBottom: 10 }}>
                  <span className="ec-mono" style={{ fontSize: 12, fontWeight: 700 }}>{claim.claimNo}</span>
                  <input className="ec-input" type="date" value={claim.periodTo} onChange={(e) => CM.updateClaim(claim.id, { periodTo: e.target.value })}
                    style={{ width: 140, padding: "3px 6px", fontSize: 11 }} />
                  <select className="ec-select" value={claim.status} onChange={(e) => CM.updateClaim(claim.id, { status: e.target.value })}
                    style={{ width: 110, padding: "3px 6px", fontSize: 11 }}>
                    {CM.CLAIM_STATUS.map((s) => <option key={s} value={s}>{s.replace(/_/g, " ")}</option>)}
                  </select>
                  <span style={{ flex: 1 }} />
                  <span className="ec-mono" style={{ fontSize: 18, fontWeight: 700 }}>{cur}{fmt(t.total)}</span>
                </div>

                <div style={{ display: "grid", gap: 3, marginBottom: 10 }}>
                  {(claim.lines || []).map((l, i) => (
                    <div key={i} style={{ display: "grid", gridTemplateColumns: "1fr 90px 60px 90px", gap: 6, alignItems: "center", fontSize: 11 }}>
                      <span style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{l.name}</span>
                      <span className="ec-mono" style={{ textAlign: "right", color: TOKENS.steel }}>{cur}{fmt(l.value)}</span>
                      <input className="ec-input" type="number" min="0" max="100" value={l.percentComplete}
                        onChange={(e) => {
                          const lines = [...claim.lines];
                          lines[i] = { ...l, percentComplete: Math.max(0, Math.min(100, Number(e.target.value) || 0)) };
                          CM.updateClaim(claim.id, { lines });
                        }}
                        style={{ padding: "3px 5px", fontSize: 11, textAlign: "right" }} />
                      <span className="ec-mono" style={{ textAlign: "right", fontWeight: 600 }}>
                        {cur}{fmt((Number(l.value) || 0) * ((Number(l.percentComplete) || 0) / 100))}
                      </span>
                    </div>
                  ))}
                </div>

                <div style={{ borderTop: `1px solid ${TOKENS.rule}`, paddingTop: 8, display: "grid", gap: 2, fontSize: 11 }}>
                  <TotalRow label="Work to date" value={t.workToDate} cur={cur} />
                  <TotalRow label="Less previously claimed" value={-t.previouslyClaimed} cur={cur} />
                  <TotalRow label={`Less retention (${((claim.retentionRate || 0) * 100).toFixed(1)}%)`} value={-t.retention} cur={cur} />
                  <TotalRow label="GST" value={t.gst} cur={cur} />
                  <TotalRow label="This claim" value={t.total} cur={cur} bold />
                </div>

                <div style={{ display: "flex", gap: 6, marginTop: 10, alignItems: "center", flexWrap: "wrap" }}>
                  <button className="ec-mono" onClick={() => push(claim, "xero")} disabled={st.busy} style={tinyBtn}>Push to Xero</button>
                  <button className="ec-mono" onClick={() => push(claim, "myob")} disabled={st.busy} style={tinyBtn}>Push to MYOB</button>
                  {st.busy && <span className="ec-mono" style={{ fontSize: 10, color: TOKENS.steel }}>sending…</span>}
                  {st.ok && <span className="ec-mono" style={{ fontSize: 10, color: TOKENS.ok }}>{st.ok}</span>}
                  {st.error && <span className="ec-mono" style={{ fontSize: 10, color: TOKENS.alert }}>{st.error}</span>}
                </div>
              </div>
            );
          })}
        </div>
      )}
    </>
  );
}

function TotalRow({ label, value, cur, bold }) {
  return (
    <div style={{ display: "flex", justifyContent: "space-between", fontWeight: bold ? 700 : 400, fontSize: bold ? 13 : 11 }}>
      <span>{label}</span>
      <span className="ec-mono">{value < 0 ? "−" : ""}{cur}{fmt(Math.abs(value))}</span>
    </div>
  );
}

/* ---- Schedule ---------------------------------------------------------- */

function Schedule({ job }) {
  const tasks = CM.listTasks(job.id);

  // Bar geometry is computed against the span of the whole programme, so a
  // job that slips just re-scales rather than overflowing its container.
  const { start, days } = useMemo(() => {
    if (!tasks.length) return { start: new Date(), days: 30 };
    const starts = tasks.map((t) => new Date(t.startDate).getTime());
    const ends = tasks.map((t) => CM.taskEndDate(t).getTime());
    const s = new Date(Math.min(...starts));
    const e = new Date(Math.max(...ends));
    return { start: s, days: Math.max(14, Math.ceil((e - s) / 86400000) + 3) };
  }, [tasks]);

  const offset = (d) => Math.max(0, (new Date(d) - start) / 86400000);

  return (
    <>
      <SectionBar title="Schedule" sub="Working days, weekends excluded."
        action={<button className="ec-btn ec-btn-hivis" onClick={() => CM.createTask(job.id)}>Add task</button>} />
      {!tasks.length ? (
        <Empty>No programme yet. Add tasks, or generate one from the estimator's timeline once the job is priced.</Empty>
      ) : (
        <div style={{ background: TOKENS.card, border: `1px solid ${TOKENS.rule}`, padding: 12, overflowX: "auto" }}>
          <div style={{ minWidth: 620 }}>
            {tasks.map((t) => {
              const left = (offset(t.startDate) / days) * 100;
              const width = Math.max(1.5, ((CM.taskEndDate(t) - new Date(t.startDate)) / 86400000 + 1) / days * 100);
              return (
                <div key={t.id} style={{ display: "grid", gridTemplateColumns: "190px 70px 1fr 28px", gap: 8, alignItems: "center", marginBottom: 5 }}>
                  <input className="ec-input" value={t.name} onChange={(e) => CM.updateTask(t.id, { name: e.target.value })} style={{ padding: "3px 7px", fontSize: 11 }} />
                  <input className="ec-input" type="number" min="1" value={t.days} onChange={(e) => CM.updateTask(t.id, { days: Number(e.target.value) || 1 })} style={{ padding: "3px 5px", fontSize: 11 }} />
                  <div style={{ position: "relative", height: 20, background: TOKENS.paperLight, border: `1px solid ${TOKENS.rule}` }}>
                    <div style={{ position: "absolute", left: `${left}%`, width: `${width}%`, top: 2, bottom: 2, background: TOKENS.ink }}>
                      <div style={{ position: "absolute", inset: 0, width: `${t.percentComplete}%`, background: TOKENS.hivis }} />
                    </div>
                  </div>
                  <button onClick={() => CM.deleteTask(t.id)} style={{ border: "none", background: "none", cursor: "pointer", color: TOKENS.steel, fontSize: 15 }}>×</button>
                </div>
              );
            })}
          </div>
        </div>
      )}
    </>
  );
}

/* ---- Site diary -------------------------------------------------------- */

function Diary({ job }) {
  const entries = CM.listDiary(job.id);
  return (
    <>
      <SectionBar title="Site diary"
        sub="A delay logged on the day it happened is evidence. Reconstructed six weeks later, it's an opinion."
        action={<button className="ec-btn ec-btn-hivis" onClick={() => CM.createDiaryEntry(job.id)}>Add entry</button>} />
      {!entries.length ? <Empty>No diary entries.</Empty> : (
        <div style={{ display: "grid", gap: 8 }}>
          {entries.map((d) => (
            <div key={d.id} style={{ background: TOKENS.card, border: `1px solid ${TOKENS.rule}`, padding: "12px 14px" }}>
              <div style={{ display: "flex", gap: 8, marginBottom: 8, flexWrap: "wrap", alignItems: "center" }}>
                <input className="ec-input" type="date" value={d.date} onChange={(e) => CM.updateDiaryEntry(d.id, { date: e.target.value })} style={{ width: 140, padding: "3px 6px", fontSize: 11 }} />
                <input className="ec-input" placeholder="Weather" value={d.weather} onChange={(e) => CM.updateDiaryEntry(d.id, { weather: e.target.value })} style={{ width: 130, padding: "3px 6px", fontSize: 11 }} />
                <input className="ec-input" placeholder="Crew on site" value={d.crewOnSite} onChange={(e) => CM.updateDiaryEntry(d.id, { crewOnSite: e.target.value })} style={{ flex: 1, minWidth: 130, padding: "3px 6px", fontSize: 11 }} />
                <input className="ec-input" type="number" min="0" title="Days lost" value={d.delayDays} onChange={(e) => CM.updateDiaryEntry(d.id, { delayDays: Number(e.target.value) || 0 })} style={{ width: 70, padding: "3px 6px", fontSize: 11 }} />
                <button onClick={() => CM.deleteDiaryEntry(d.id)} style={{ border: "none", background: "none", cursor: "pointer", color: TOKENS.steel, fontSize: 15 }}>×</button>
              </div>
              <textarea className="ec-input" rows={2} placeholder="Work completed" value={d.workDone}
                onChange={(e) => CM.updateDiaryEntry(d.id, { workDone: e.target.value })} style={{ width: "100%", fontSize: 12, marginBottom: 5 }} />
              <textarea className="ec-input" rows={2} placeholder="Delays, instructions, visitors" value={d.delays}
                onChange={(e) => CM.updateDiaryEntry(d.id, { delays: e.target.value })} style={{ width: "100%", fontSize: 12 }} />
            </div>
          ))}
        </div>
      )}
    </>
  );
}

/* ---- Documents --------------------------------------------------------- */

function Documents({ job }) {
  const docs = CM.listDocuments(job.id);
  return (
    <>
      <SectionBar title="Documents" sub="Plans, permits, contracts and site photos held against this job." />
      {!docs.length ? <Empty>No documents. Plan images uploaded in Takeoff appear here too.</Empty> : (
        <div style={{ display: "grid", gap: 4 }}>
          {docs.map((d) => (
            <div key={d.id} style={{ display: "flex", justifyContent: "space-between", gap: 10, padding: "8px 12px", background: TOKENS.card, border: `1px solid ${TOKENS.rule}`, fontSize: 12 }}>
              <span style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{d.name}</span>
              <span className="ec-mono" style={{ fontSize: 10, color: TOKENS.steel, whiteSpace: "nowrap" }}>
                {d.kind} · {(d.size / 1024 / 1024).toFixed(1)} MB
              </span>
            </div>
          ))}
        </div>
      )}
    </>
  );
}

/* ========================================================================
   Clients & Settings
   ======================================================================== */

function ClientsScreen({ search = "" }) {
  const q = search.trim().toLowerCase();
  const clients = CM.listClients()
    .filter((c) => !q || [c.name, c.company, c.email].some((v) => (v || "").toLowerCase().includes(q)));
  return (
    <>
      <PageHead title="Clients" sub="These are the contacts pushed to Xero and MYOB."
        action={<button className="ec-btn ec-btn-hivis" onClick={() => CM.createClient({})}>New client</button>} />
      {!clients.length ? <Empty>No clients yet.</Empty> : (
        <div style={{ display: "grid", gap: 8 }}>
          {clients.map((c) => (
            <div key={c.id} style={{ background: TOKENS.card, border: `1px solid ${TOKENS.rule}`, padding: "12px 14px", display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(160px, 1fr)) 28px", gap: 8, alignItems: "end" }}>
              <Field label="Name"><input className="ec-input" value={c.name} onChange={(e) => CM.updateClient(c.id, { name: e.target.value })} style={{ padding: "4px 7px", fontSize: 11 }} /></Field>
              <Field label="Company"><input className="ec-input" value={c.company} onChange={(e) => CM.updateClient(c.id, { company: e.target.value })} style={{ padding: "4px 7px", fontSize: 11 }} /></Field>
              <Field label="Email"><input className="ec-input" value={c.email} onChange={(e) => CM.updateClient(c.id, { email: e.target.value })} style={{ padding: "4px 7px", fontSize: 11 }} /></Field>
              <Field label="Phone"><input className="ec-input" value={c.phone} onChange={(e) => CM.updateClient(c.id, { phone: e.target.value })} style={{ padding: "4px 7px", fontSize: 11 }} /></Field>
              <Field label="ABN"><input className="ec-input" value={c.abn} onChange={(e) => CM.updateClient(c.id, { abn: e.target.value })} style={{ padding: "4px 7px", fontSize: 11 }} /></Field>
              <button onClick={() => confirm(`Delete ${c.name}?`) && CM.deleteClient(c.id)}
                style={{ border: "none", background: "none", cursor: "pointer", color: TOKENS.steel, fontSize: 15 }}>×</button>
            </div>
          ))}
        </div>
      )}
    </>
  );
}

function SettingsScreen() {
  const s = CM.getSettings();
  return (
    <>
      <PageHead title="Settings" sub="Company details, defaults, and accounting connections" />

      <Panel title="Your company">
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(200px, 1fr))", gap: 10 }}>
          <Field label="Trading name"><input className="ec-input" value={s.company.name} onChange={(e) => CM.saveSettings({ company: { name: e.target.value } })} /></Field>
          <Field label="ABN"><input className="ec-input" value={s.company.abn} onChange={(e) => CM.saveSettings({ company: { abn: e.target.value } })} /></Field>
          <Field label="Email"><input className="ec-input" value={s.company.email} onChange={(e) => CM.saveSettings({ company: { email: e.target.value } })} /></Field>
          <Field label="Phone"><input className="ec-input" value={s.company.phone} onChange={(e) => CM.saveSettings({ company: { phone: e.target.value } })} /></Field>
        </div>
      </Panel>

      <Panel title="Defaults">
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(160px, 1fr))", gap: 10 }}>
          <Field label="GST rate" hint="0.1 = 10%">
            <input className="ec-input" type="number" step="0.01" value={s.gstRate} onChange={(e) => CM.saveSettings({ gstRate: Number(e.target.value) || 0 })} />
          </Field>
          <Field label="Retention rate" hint="Held back per claim">
            <input className="ec-input" type="number" step="0.01" value={s.retentionRate} onChange={(e) => CM.saveSettings({ retentionRate: Number(e.target.value) || 0 })} />
          </Field>
          <Field label="Default markup">
            <input className="ec-input" type="number" step="0.01" value={s.defaultMarkup} onChange={(e) => CM.saveSettings({ defaultMarkup: Number(e.target.value) || 0 })} />
          </Field>
        </div>
      </Panel>

      <Integrations />
    </>
  );
}

/* ========================================================================
   Shared primitives
   ======================================================================== */

function PageHead({ title, sub, action }) {
  return (
    <div style={{ display: "flex", alignItems: "flex-end", gap: 16, flexWrap: "wrap", marginBottom: 20 }}>
      <div style={{ flex: 1, minWidth: 200 }}>
        <h1 className="ec-display" style={{ fontSize: 30, margin: 0 }}>{title}</h1>
        {sub && <div className="ec-mono" style={{ fontSize: 11, color: TOKENS.steel, marginTop: 3 }}>{sub}</div>}
      </div>
      {action}
    </div>
  );
}

function SectionBar({ title, sub, action }) {
  return (
    <div style={{ display: "flex", alignItems: "flex-end", gap: 14, flexWrap: "wrap", marginBottom: 14 }}>
      <div style={{ flex: 1, minWidth: 200 }}>
        <div className="ec-display" style={{ fontSize: 19 }}>{title}</div>
        {sub && <div style={{ fontSize: 11, color: TOKENS.steel, marginTop: 2, lineHeight: 1.5 }}>{sub}</div>}
      </div>
      {action}
    </div>
  );
}

function Stat({ label, value, sub, hivis, alert }) {
  return (
    <div style={{ padding: "14px 16px", background: hivis ? TOKENS.emphasis : TOKENS.card, border: `1px solid ${alert ? TOKENS.alert : TOKENS.rule}` }}>
      <div className="ec-mono" style={{ fontSize: 9, letterSpacing: "0.14em", color: hivis ? TOKENS.onEmphasisSoft : TOKENS.steel }}>{label.toUpperCase()}</div>
      <div className="ec-mono" style={{ fontSize: 22, fontWeight: 700, margin: "3px 0 1px", color: hivis ? TOKENS.onEmphasis : alert ? TOKENS.alert : TOKENS.ink }}>{value}</div>
      {sub && <div className="ec-mono" style={{ fontSize: 9, color: hivis ? TOKENS.onEmphasisSoft : TOKENS.steel }}>{sub}</div>}
    </div>
  );
}

function Panel({ title, tone, children }) {
  const border = { alert: TOKENS.alert, warn: TOKENS.hivisDeep }[tone] || TOKENS.rule;
  return (
    <section style={{ background: TOKENS.card, border: `1px solid ${border}`, padding: "16px 18px", marginBottom: 16 }}>
      <div className="ec-display" style={{ fontSize: 17, marginBottom: 10, color: tone === "alert" ? TOKENS.alert : TOKENS.ink }}>{title}</div>
      {children}
    </section>
  );
}

function Chip({ active, label, onClick }) {
  return (
    <button onClick={onClick} className="ec-mono"
      style={{ padding: "5px 11px", fontSize: 10, letterSpacing: "0.06em", fontWeight: 700, cursor: "pointer",
               border: `1px solid ${active ? TOKENS.emphasis : TOKENS.rule}`, background: active ? TOKENS.emphasis : TOKENS.card,
               color: active ? TOKENS.onEmphasis : TOKENS.inkSoft }}>
      {label}
    </button>
  );
}

function Empty({ children }) {
  return (
    <div style={{ padding: "32px 20px", textAlign: "center", color: TOKENS.steel, fontSize: 13, lineHeight: 1.6, background: TOKENS.card, border: `1px dashed ${TOKENS.rule}` }}>
      {children}
    </div>
  );
}

function Field({ label, hint, children }) {
  return (
    <div>
      <div className="ec-label" style={{ marginBottom: 3 }}>{label}</div>
      {children}
      {hint && <div style={{ fontSize: 10, color: TOKENS.steel, marginTop: 2, lineHeight: 1.4 }}>{hint}</div>}
    </div>
  );
}

function Dialog({ title, children, onClose, wide }) {
  return (
    <div onClick={onClose}
      style={{ position: "fixed", inset: 0, background: "rgba(20,23,26,0.55)", display: "grid", placeItems: "center", zIndex: 200, padding: 20, overflowY: "auto" }}>
      <div onClick={(e) => e.stopPropagation()}
        style={{ background: TOKENS.card, border: `1px solid ${TOKENS.ink}`, padding: 24, width: "100%", maxWidth: wide ? 720 : 420, maxHeight: "88vh", overflowY: "auto" }}>
        <div className="ec-display" style={{ fontSize: 21, marginBottom: 14 }}>{title}</div>
        {children}
      </div>
    </div>
  );
}
