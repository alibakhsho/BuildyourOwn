/* =========================================================================
   mobile/screens/Jobs.jsx — Site Office on the phone
   ------------------------------------------------------------------------
   What a builder needs standing on site, from the same job store as the
   full Site Office: where the job stands on money, what's on this week,
   today's diary (with photos from the camera, and delay days that go
   onto the programme), and variations to raise and mark approved.
   Budgets, purchase orders, claims, Xero/MYOB and takeoffs stay on the
   computer, as most builder apps keep their admin on desktop.
   ========================================================================= */
import { useEffect, useMemo, useRef, useState } from "react";
import { ChevronLeft, Plus, Camera, ImagePlus, Info, TriangleAlert, Check, ChevronRight, HardHat, CircleUser } from "lucide-react";
import {
  subscribe, listJobs, getJob, createJob, JOB_STATUS, nextJobStatus, advanceJob, pipelineSummary, jobFinancials,
  listDiary, createDiaryEntry, applyDiaryDelay, listVariations, createVariation, approveVariation, jobProgramme,
} from "../../state/cm.js";
import { putBlob, getBlobURL } from "../../state/blobstore.js";
import { isNative, takePhoto } from "../../lib/native.js";
import { Sheet, Stepper, Chips, money } from "../ui.jsx";

const statusLabel = (id) => JOB_STATUS.find((s) => s.id === id)?.label || id;

/* Re-render whenever the job store changes (here or from a sync). */
function useCm() {
  const [, bump] = useState(0);
  useEffect(() => subscribe(() => bump((n) => n + 1)), []);
}

export default function JobsScreen({ jobId, onOpenJob, onBack, onAccount, toast }) {
  useCm();
  if (jobId) return <JobDetail id={jobId} onBack={onBack} toast={toast} />;
  return <JobList onOpenJob={onOpenJob} onAccount={onAccount} />;
}

const GROUPS = [
  { title: "On site", ids: ["in_progress", "practical_completion"] },
  { title: "Won", ids: ["won"] },
  { title: "Quoting", ids: ["lead", "estimating", "quoted"] },
  { title: "Finished", ids: ["closed", "lost"] },
];

function JobList({ onOpenJob, onAccount }) {
  const jobs = listJobs();
  const sum = pipelineSummary();
  const [adding, setAdding] = useState(false);
  const [name, setName] = useState("");

  return (
    <div>
      <header className="m-top">
        <span className="m-top-title" style={{ fontSize: 22, fontWeight: 800, paddingLeft: 4 }}>Jobs</span>
        <button className="m-btn m-btn-sm" onClick={() => setAdding(true)}><Plus size={18} />New job</button>
        <button className="m-icon-btn" onClick={onAccount} aria-label="Account"><CircleUser size={24} /></button>
      </header>
      <div className="m-pad m-stack">
        {jobs.length > 0 && (
          <section className="m-card m-card-pad m-num" style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 14 }}>
            <div><div className="m-small">On site</div><div style={{ fontSize: 22, fontWeight: 800 }}>{sum.activeJobs}</div></div>
            <div><div className="m-small">Contracted</div><div style={{ fontSize: 22, fontWeight: 800 }}>{money(sum.contractedValue)}</div></div>
            <div><div className="m-small">In the pipeline</div><div style={{ fontSize: 17, fontWeight: 750 }}>{money(sum.pipelineValue)}</div></div>
            <div><div className="m-small">Not yet claimed</div><div style={{ fontSize: 17, fontWeight: 750, color: sum.unclaimedTotal > 0 ? "var(--m-coral-ink)" : undefined }}>{money(sum.unclaimedTotal)}</div></div>
          </section>
        )}

        {jobs.length === 0 && (
          <div className="m-empty">
            <span className="m-thumb" style={{ margin: "0 auto 12px", background: "var(--m-coral-wash)", color: "var(--m-coral-ink)" }}><HardHat size={22} /></span>
            <h2 className="m-h2">No jobs yet</h2>
            <p>Add a job to keep its diary, photos and variations here. Quotes sent to Site Office on a computer show up too.</p>
            <button className="m-btn" style={{ marginTop: 12 }} onClick={() => setAdding(true)}><Plus size={18} />New job</button>
          </div>
        )}

        {GROUPS.map((g) => {
          const list = jobs.filter((j) => g.ids.includes(j.status));
          if (!list.length) return null;
          return (
            <section key={g.title} aria-label={g.title}>
              <h2 className="m-h2" style={{ fontSize: 15, color: "var(--m-ink2)", margin: "8px 0 6px" }}>{g.title}</h2>
              <ul className="m-list m-card">
                {list.map((j) => (
                  <li key={j.id}>
                    <button className="m-list-row" onClick={() => onOpenJob(j.id)}>
                      <span className="m-list-main">
                        <span className="m-list-title" style={{ display: "block" }}>{j.name}</span>
                        <span className="m-list-meta">{j.jobNo} · {statusLabel(j.status)}{j.siteAddress ? ` · ${j.siteAddress}` : ""}</span>
                      </span>
                      <span className="m-num" style={{ fontWeight: 700 }}>{j.contractValue > 0 ? money(j.contractValue) : ""}</span>
                      <ChevronRight size={18} style={{ color: "var(--m-ink2)" }} />
                    </button>
                  </li>
                ))}
              </ul>
            </section>
          );
        })}
      </div>

      {adding && (
        <Sheet title="New job" onClose={() => setAdding(false)}>
          <label className="m-label" htmlFor="job-name">Job name or site address</label>
          <input id="job-name" className="m-input" autoFocus value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. 14 Banksia St, Kellyville" />
          <button className="m-btn m-btn-block" style={{ marginTop: 14 }} disabled={!name.trim()}
            onClick={() => { const j = createJob({ name: name.trim(), siteAddress: name.trim(), status: "won" }); setAdding(false); setName(""); onOpenJob(j.id); }}>
            Add the job
          </button>
        </Sheet>
      )}
    </div>
  );
}

/* ------------------------------------------------------------------------ */

const today = () => new Date().toISOString().slice(0, 10);
const plusDays = (iso, n) => { const d = new Date(iso + "T00:00:00"); d.setDate(d.getDate() + n); return d.toISOString().slice(0, 10); };
const nice = (iso) => new Date(iso + "T00:00:00").toLocaleDateString("en-AU", { weekday: "short", day: "numeric", month: "short" });

function JobDetail({ id, onBack, toast }) {
  const job = getJob(id);
  const [diaryOpen, setDiaryOpen] = useState(false);
  const [varOpen, setVarOpen] = useState(false);
  if (!job) return <div className="m-empty"><button className="m-btn" onClick={onBack}>Back to jobs</button></div>;

  const fin = jobFinancials(id);
  const diary = listDiary(id);
  const variations = listVariations(id);
  const { tasks, prog } = jobProgramme(id);
  const now = today(), weekEnd = plusDays(now, 7);
  const thisWeek = tasks
    .map((t) => ({ t, r: prog.get(t.id) }))
    .filter(({ r }) => r && r.start <= weekEnd && r.end >= now)
    .sort((a, b) => a.r.start.localeCompare(b.r.start));
  const next = nextJobStatus(job.status);

  return (
    <div>
      <header className="m-top">
        <button className="m-icon-btn" onClick={onBack} aria-label="Back to jobs"><ChevronLeft size={26} /></button>
        <span className="m-top-title">{job.name}</span>
      </header>
      <div className="m-pad m-stack">
        <section className="m-card m-card-pad">
          <div className="m-row-between">
            <span className="m-small">{job.jobNo} · {statusLabel(job.status)}</span>
            {next && <button className="m-btn m-btn-sm m-btn-soft" onClick={() => { const s = advanceJob(id); toast(`Moved to ${statusLabel(s)}`); }}>Move to {statusLabel(next)}</button>}
          </div>
          <div className="m-num" style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 14, marginTop: 14 }}>
            <div><div className="m-small">Contract</div><div style={{ fontSize: 20, fontWeight: 800 }}>{money(fin.contractSum)}</div></div>
            <div><div className="m-small">Forecast cost</div><div style={{ fontSize: 20, fontWeight: 800 }}>{money(fin.totalForecast)}</div></div>
            <div><div className="m-small">Margin</div><div style={{ fontSize: 17, fontWeight: 750, color: fin.grossMargin < 0 ? "var(--m-coral-ink)" : "var(--m-ok)" }}>{money(fin.grossMargin)} ({Math.round(fin.grossMarginPct)}%)</div></div>
            <div><div className="m-small">Not yet claimed</div><div style={{ fontSize: 17, fontWeight: 750 }}>{money(fin.unclaimed)}</div></div>
          </div>
          {fin.atRiskCount > 0 && <p className="m-small" style={{ margin: "12px 0 0", color: "var(--m-coral-ink)", display: "flex", gap: 6 }}><TriangleAlert size={15} />{fin.atRiskCount} trade{fin.atRiskCount === 1 ? " is" : "s are"} over budget.</p>}
        </section>

        <section className="m-card" aria-label="This week">
          <h2 className="m-h2" style={{ padding: "16px 16px 0" }}>This week</h2>
          {thisWeek.length === 0 ? (
            <p className="m-small" style={{ padding: "0 16px 16px", margin: 0 }}>{tasks.length ? "Nothing scheduled in the next 7 days." : "No programme yet. Build it in Site Office on a computer, or send a quote across with its timeline."}</p>
          ) : (
            <ul className="m-list">
              {thisWeek.map(({ t, r }) => (
                <li key={t.id}><div className="m-list-row" style={{ cursor: "default" }}>
                  <span className="m-list-main"><span className="m-list-title" style={{ display: "block" }}>{t.name}</span><span className="m-list-meta">{nice(r.start)} to {nice(r.end)}{t.assignedTo ? ` · ${t.assignedTo}` : ""}</span></span>
                  {t.percentComplete > 0 && <span className="m-small m-num">{t.percentComplete}%</span>}
                </div></li>
              ))}
            </ul>
          )}
        </section>

        <section className="m-card" aria-label="Site diary">
          <div className="m-row-between" style={{ padding: "16px 16px 4px" }}>
            <h2 className="m-h2" style={{ margin: 0 }}>Site diary</h2>
            <button className="m-btn m-btn-sm" onClick={() => setDiaryOpen(true)}><Plus size={16} />Today</button>
          </div>
          {diary.length === 0 ? <p className="m-small" style={{ padding: "0 16px 16px", margin: 0 }}>Log each day on site. Delays you record here are your evidence for an extension of time.</p> : (
            <ul className="m-list">{diary.slice(0, 10).map((d) => <DiaryRow key={d.id} d={d} />)}</ul>
          )}
        </section>

        <section className="m-card" aria-label="Variations">
          <div className="m-row-between" style={{ padding: "16px 16px 4px" }}>
            <h2 className="m-h2" style={{ margin: 0 }}>Variations</h2>
            <button className="m-btn m-btn-sm" onClick={() => setVarOpen(true)}><Plus size={16} />New</button>
          </div>
          {variations.length === 0 ? <p className="m-small" style={{ padding: "0 16px 16px", margin: 0 }}>Raise a variation on site the moment the client asks for a change.</p> : (
            <ul className="m-list">
              {variations.map((v) => (
                <li key={v.id}><div className="m-list-row" style={{ cursor: "default" }}>
                  <span className="m-list-main"><span className="m-list-title" style={{ display: "block" }}>{v.varNo} {v.title}</span>
                    <span className="m-list-meta m-num">Charge {money(v.charge)} · cost {money(v.cost)} · {v.status === "approved" ? "approved" : v.status}</span></span>
                  {v.status !== "approved" && v.status !== "rejected" && (
                    <button className="m-btn m-btn-sm m-btn-soft" onClick={() => { approveVariation(v.id, "On site"); toast(`${v.varNo} approved: the contract is now ${money(fin.contractSum + (Number(v.charge) || 0))}`); }}><Check size={16} />Mark approved</button>
                  )}
                </div></li>
              ))}
            </ul>
          )}
        </section>

        <div className="m-note"><Info size={16} /><span>Budgets, purchase orders, progress claims, Xero and MYOB, takeoffs and the full programme are in Site Office on a computer.</span></div>
      </div>

      {diaryOpen && <DiarySheet jobId={id} tasks={tasks} onClose={() => setDiaryOpen(false)} toast={toast} />}
      {varOpen && <VariationSheet jobId={id} onClose={() => setVarOpen(false)} toast={toast} />}
    </div>
  );
}

function DiaryRow({ d }) {
  const [urls, setUrls] = useState([]);
  useEffect(() => {
    let live = true; const made = [];
    Promise.all((d.photoIds || []).slice(0, 4).map((pid) => getBlobURL(pid))).then((list) => {
      list.forEach((u) => u && made.push(u));
      if (live) setUrls(made); else made.forEach((u) => URL.revokeObjectURL(u));
    });
    return () => { live = false; made.forEach((u) => URL.revokeObjectURL(u)); };
  }, [d.photoIds]);
  return (
    <li><div className="m-list-row" style={{ cursor: "default", display: "block" }}>
      <div className="m-row-between"><span style={{ fontWeight: 700 }}>{nice(d.date)}</span><span className="m-small">{[d.weather, d.crewOnSite && `${d.crewOnSite} on site`].filter(Boolean).join(" · ")}</span></div>
      {d.workDone && <p style={{ margin: "4px 0 0" }}>{d.workDone}</p>}
      {d.delayDays > 0 && <p className="m-small" style={{ margin: "4px 0 0", color: "var(--m-coral-ink)" }}>{d.delayDays} day{d.delayDays === 1 ? "" : "s"} lost{d.delays ? `: ${d.delays}` : ""}</p>}
      {urls.length > 0 && <div style={{ display: "flex", gap: 6, marginTop: 8 }}>{urls.map((u) => <img key={u} src={u} alt="" style={{ width: 64, height: 64, objectFit: "cover", borderRadius: 10 }} />)}</div>}
    </div></li>
  );
}

const WEATHER = [{ id: "Fine", label: "Fine" }, { id: "Rain", label: "Rain" }, { id: "Wind", label: "Wind" }, { id: "Hot", label: "Hot" }, { id: "Storm", label: "Storm" }];

function DiarySheet({ jobId, tasks, onClose, toast }) {
  const [weather, setWeather] = useState("Fine");
  const [crew, setCrew] = useState(2);
  const [work, setWork] = useState("");
  const [delayDays, setDelayDays] = useState(0);
  const [delays, setDelays] = useState("");
  const [taskId, setTaskId] = useState("");
  const [photos, setPhotos] = useState([]); // { id, url }
  const [busy, setBusy] = useState(false);
  const fileRef = useRef(null);
  useEffect(() => () => photos.forEach((p) => URL.revokeObjectURL(p.url)), []); // eslint-disable-line react-hooks/exhaustive-deps

  const addFile = async (file) => {
    if (!file) return;
    const rec = await putBlob(file, { name: file.name });
    setPhotos((ps) => [...ps, { id: rec.id, url: URL.createObjectURL(file) }]);
  };
  const shoot = async () => {
    if (!isNative) { fileRef.current?.click(); return; }
    try { await addFile(await takePhoto()); } catch (e) { toast(`Camera: ${e.message || "couldn't take the photo"}`); }
  };
  const save = async () => {
    setBusy(true);
    const entry = createDiaryEntry(jobId, {
      weather, crewOnSite: String(crew), workDone: work.trim(), delays: delays.trim(),
      delayDays, taskId: delayDays > 0 && taskId ? taskId : null, photoIds: photos.map((p) => p.id),
    });
    if (delayDays > 0 && taskId) applyDiaryDelay(entry.id);
    setBusy(false);
    toast(delayDays > 0 && taskId ? `Saved. ${delayDays} day${delayDays === 1 ? "" : "s"} added to the programme.` : "Saved today's diary.");
    onClose();
  };

  return (
    <Sheet title="Today on site" onClose={onClose}>
      <Chips label="Weather" options={WEATHER} value={weather} onChange={setWeather} />
      <Stepper label="Crew on site" value={crew} min={0} max={40} onChange={setCrew} />
      <label className="m-label" htmlFor="d-work" style={{ marginTop: 14 }}>Work done</label>
      <textarea id="d-work" className="m-input" rows={3} value={work} onChange={(e) => setWork(e.target.value)} placeholder="e.g. Frame inspection passed, trusses delivered" />
      <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginTop: 12 }}>
        {photos.map((p) => <img key={p.id} src={p.url} alt="" style={{ width: 64, height: 64, objectFit: "cover", borderRadius: 10 }} />)}
        <button className="m-btn m-btn-sm m-btn-line" onClick={shoot} style={{ height: 64 }}>{isNative ? <Camera size={18} /> : <ImagePlus size={18} />}Photo</button>
        <input ref={fileRef} type="file" accept="image/*" capture="environment" hidden onChange={(e) => { addFile(e.target.files?.[0]); e.target.value = ""; }} />
      </div>
      <Stepper label="Days lost" hint="Rain, late delivery, waiting on an inspection" value={delayDays} min={0} max={20} onChange={setDelayDays} />
      {delayDays > 0 && (
        <>
          <label className="m-label" htmlFor="d-why" style={{ marginTop: 12 }}>What held it up</label>
          <input id="d-why" className="m-input" value={delays} onChange={(e) => setDelays(e.target.value)} placeholder="e.g. Rain, site too wet to pour" />
          {tasks.length > 0 && (
            <>
              <label className="m-label" htmlFor="d-task" style={{ marginTop: 12 }}>Task it held up (moves the programme)</label>
              <select id="d-task" className="m-input" value={taskId} onChange={(e) => setTaskId(e.target.value)}>
                <option value="">Don't change the programme</option>
                {tasks.map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}
              </select>
            </>
          )}
        </>
      )}
      <button className="m-btn m-btn-block" style={{ marginTop: 16 }} onClick={save} disabled={busy}>Save today's diary</button>
    </Sheet>
  );
}

function VariationSheet({ jobId, onClose, toast }) {
  const [title, setTitle] = useState("");
  const [desc, setDesc] = useState("");
  const [cost, setCost] = useState("");
  const [charge, setCharge] = useState("");
  const [days, setDays] = useState(0);
  const margin = useMemo(() => (Number(charge) || 0) - (Number(cost) || 0), [cost, charge]);
  const save = () => {
    const v = createVariation(jobId, { title: title.trim(), description: desc.trim(), cost, charge, scheduleImpactDays: days, status: "submitted" });
    toast(`Raised ${v.varNo}. Mark it approved when the client signs.`);
    onClose();
  };
  return (
    <Sheet title="New variation" onClose={onClose}>
      <label className="m-label" htmlFor="v-title">What's changing</label>
      <input id="v-title" className="m-input" autoFocus value={title} onChange={(e) => setTitle(e.target.value)} placeholder="e.g. Upgrade to 900 mm cooktop" />
      <label className="m-label" htmlFor="v-desc" style={{ marginTop: 12 }}>Details</label>
      <textarea id="v-desc" className="m-input" rows={2} value={desc} onChange={(e) => setDesc(e.target.value)} />
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10, marginTop: 12 }}>
        <div><label className="m-label" htmlFor="v-cost">Your cost</label><input id="v-cost" className="m-input m-num" inputMode="decimal" value={cost} onChange={(e) => setCost(e.target.value.replace(/[^0-9.]/g, ""))} placeholder="0" /></div>
        <div><label className="m-label" htmlFor="v-charge">Charge the client</label><input id="v-charge" className="m-input m-num" inputMode="decimal" value={charge} onChange={(e) => setCharge(e.target.value.replace(/[^0-9.]/g, ""))} placeholder="0" /></div>
      </div>
      <p className="m-small m-num" style={{ margin: "8px 0 0", color: margin < 0 ? "var(--m-coral-ink)" : undefined }}>Margin on this variation: {money(margin)}</p>
      <Stepper label="Extra days on the programme" value={days} min={0} max={60} onChange={setDays} />
      <button className="m-btn m-btn-block" style={{ marginTop: 16 }} disabled={!title.trim()} onClick={save}>Raise the variation</button>
    </Sheet>
  );
}
