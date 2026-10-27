/* =========================================================================
   MODULE: modules/Programme.jsx
   The job's programme (Gantt). Dates are computed, not typed: each task
   says what it follows and how long it takes, and logic/programme.js works
   out when it happens on the job's working-day calendar (state public
   holidays, Christmas shutdown, Saturdays if worked). So when the frame
   slips, the roof, the fit-off and handover move with it.

     drag a bar         — move it (a task with a predecessor gets a lag
                          instead, so the link is kept)
     drag its right end — change its duration
     red bar            — on the critical path: a day late here is a day
                          late at handover
     outlined ghost     — where it was when the baseline was set
   ========================================================================= */
import { useMemo, useRef, useState } from "react";
import { colors as TOKENS } from "../design/system.js";
import * as CM from "../state/cm.js";
import { addDays, parse, ymd, isOverdue, programmeIcs } from "../logic/programme.js";

const DAY = 86400000;
const calDays = (a, b) => Math.round((parse(b) - parse(a)) / DAY);
const nice = (s) => (s ? parse(s).toLocaleDateString("en-AU", { day: "numeric", month: "short", year: "numeric" }) : "—");

function download(text, name) {
  const a = document.createElement("a");
  a.href = URL.createObjectURL(new Blob([text], { type: "text/calendar" }));
  a.download = name;
  a.click();
  setTimeout(() => URL.revokeObjectURL(a.href), 1000);
}

export default function Programme({ job, SectionBar, Empty }) {
  const { tasks, prog, slip, cal, end, baseEnd, handoverSlip } = CM.jobProgramme(job.id);
  const settings = CM.getSettings().programme;
  const today = ymd(new Date());
  const [who, setWho] = useState("");
  const trackRef = useRef(null);
  const [drag, setDrag] = useState(null);   // { id, mode: "move"|"size", x0, dx }

  // the chart spans every task, its baseline, and today
  const { start, days } = useMemo(() => {
    const ds = [today];
    for (const r of prog.values()) ds.push(r.start, r.end);
    for (const b of Object.values(job.baseline?.tasks || {})) ds.push(b.start, b.end);
    const s = ds.reduce((m, d) => (d < m ? d : m));
    const e = ds.reduce((m, d) => (d > m ? d : m));
    const s0 = addDays(s, -((parse(s).getDay() + 6) % 7));   // from the Monday
    return { start: s0, days: Math.max(21, calDays(s0, e) + 7) };
  }, [prog, job.baseline, today]);
  const pct = (d) => (calDays(start, d) / days) * 100;
  const span = (a, b) => ((calDays(a, b) + 1) / days) * 100;

  const critical = tasks.filter((t) => prog.get(t.id)?.critical).length;
  const overdue = tasks.filter((t) => prog.get(t.id) && isOverdue(prog.get(t.id), t, today));
  const people = [...new Set(tasks.flatMap((t) => [t.assignedTo, t.trade]).filter(Boolean))];

  /* drag: px → calendar days → working-day change, committed on release */
  const onDown = (e, t, mode) => {
    e.preventDefault();
    e.currentTarget.setPointerCapture?.(e.pointerId);
    setDrag({ id: t.id, mode, x0: e.clientX, dx: 0 });
  };
  const onMove = (e) => drag && setDrag({ ...drag, dx: e.clientX - drag.x0 });
  const onUp = () => {
    if (!drag) return;
    const w = trackRef.current?.getBoundingClientRect().width || 1;
    const dDays = Math.round((drag.dx / w) * days);
    const t = tasks.find((x) => x.id === drag.id);
    const r = prog.get(drag.id);
    setDrag(null);
    if (!t || !r || !dDays) return;
    if (drag.mode === "size") {
      const newEnd = addDays(r.end, dDays);
      const work = Math.max(1, cal.between(r.start, newEnd < r.start ? r.start : newEnd) + 1 - (t.delayDays || 0));
      CM.updateTask(t.id, { days: work });
    } else if ((t.dependsOn || []).length) {
      const moved = cal.between(r.start, addDays(r.start, dDays));
      CM.updateTask(t.id, { lag: Math.max(0, (t.lag || 0) + moved) });
    } else {
      CM.updateTask(t.id, { startDate: cal.nextWorking(addDays(r.start, dDays)) });
    }
  };
  const preview = (t, r) => {
    if (!drag || drag.id !== t.id) return { left: pct(r.start), width: span(r.start, r.end) };
    const w = trackRef.current?.getBoundingClientRect().width || 1;
    const d = (drag.dx / w) * 100;
    return drag.mode === "size" ? { left: pct(r.start), width: Math.max(1, span(r.start, r.end) + d) } : { left: pct(r.start) + d, width: span(r.start, r.end) };
  };

  // month ticks for the header
  const months = [];
  for (let d = start; calDays(start, d) < days; d = addDays(d, 1)) if (parse(d).getDate() === 1 || d === start) months.push(d);

  const addTask = () => {
    const last = tasks[tasks.length - 1];
    CM.createTask(job.id, last ? { dependsOn: [last.id], startDate: last.startDate } : { startDate: cal.nextWorking(today) });
  };
  const exportIcs = () => download(programmeIcs({ id: job.id, name: job.name, siteAddress: job.siteAddress || job.address || "" }, tasks, prog, { who }),
    `${(job.name || "job").replace(/[^\w-]+/g, "-")}${who ? `-${who.replace(/[^\w-]+/g, "-")}` : ""}.ics`);

  return (
    <>
      <SectionBar title="Schedule"
        sub={`Working days on the ${settings.state} calendar — weekends${settings.saturdays ? " (Saturdays worked)" : ""}, public holidays${settings.christmasShutdown ? " and the Christmas shutdown" : ""} excluded. Change it in Settings.`}
        action={<button className="ec-btn ec-btn-hivis" onClick={addTask}>Add task</button>} />

      {!tasks.length ? (
        <Empty>No programme yet. Add tasks, or generate one from the estimator's timeline once the job is priced.</Empty>
      ) : (
        <>
          <div style={{ display: "flex", gap: 10, flexWrap: "wrap", marginBottom: 12 }}>
            <Stat label="Handover" value={nice(end)} />
            <Stat label="Against baseline" value={!job.baseline ? "No baseline" : handoverSlip > 0 ? `${handoverSlip} days late` : handoverSlip < 0 ? `${-handoverSlip} days early` : "On time"}
              tone={job.baseline && handoverSlip > 0 ? "alert" : undefined} />
            <Stat label="Critical tasks" value={`${critical} of ${tasks.length}`} />
            <Stat label="Overdue" value={String(overdue.length)} tone={overdue.length ? "alert" : undefined} />
            <span style={{ flex: 1 }} />
            <div style={{ display: "flex", gap: 6, alignItems: "center", flexWrap: "wrap" }}>
              {job.baseline ? (
                <button className="ec-btn ec-btn-ghost" style={{ fontSize: 12 }} title={`Baseline set ${nice(job.baseline.takenAt.slice(0, 10))} (handover ${nice(baseEnd)})`}
                  onClick={() => confirm("Reset the baseline to today's programme? The current slip will be forgotten.") && CM.setBaseline(job.id)}>Reset baseline</button>
              ) : (
                <button className="ec-btn ec-btn-ghost" style={{ fontSize: 12 }} title="Freeze today's dates — usually when the contract is signed" onClick={() => CM.setBaseline(job.id)}>Set baseline</button>
              )}
              <select className="ec-input" value={who} onChange={(e) => setWho(e.target.value)} style={{ fontSize: 12, padding: "5px 8px", width: "auto" }} aria-label="Calendar for">
                <option value="">Whole job</option>
                {people.map((p) => <option key={p} value={p}>{p}</option>)}
              </select>
              <button className="ec-btn ec-btn-ghost" style={{ fontSize: 12 }} onClick={exportIcs} title="Opens in Google Calendar, Outlook and Apple Calendar — send it to the trade">Calendar (.ics)</button>
            </div>
          </div>

          <div style={{ background: TOKENS.card, border: `1px solid ${TOKENS.rule}`, padding: 12, overflowX: "auto" }}
            onPointerMove={onMove} onPointerUp={onUp} onPointerCancel={() => setDrag(null)}>
            <div style={{ minWidth: 900 }}>
              <div style={{ display: "grid", gridTemplateColumns: COLS, gap: 6, fontSize: 10, color: TOKENS.steel, textTransform: "uppercase", letterSpacing: "0.06em", marginBottom: 6 }}>
                <span>Task</span><span>Who</span><span>After</span><span>Days</span><span>%</span>
                <div ref={trackRef} style={{ position: "relative", height: 14 }}>
                  {months.map((m) => (
                    <span key={m} className="ec-mono" style={{ position: "absolute", left: `${pct(m)}%`, whiteSpace: "nowrap", borderLeft: `1px solid ${TOKENS.rule}`, paddingLeft: 3 }}>
                      {parse(m).toLocaleDateString("en-AU", { month: "short", year: "2-digit" })}
                    </span>
                  ))}
                </div>
                <span />
              </div>
              {tasks.map((t) => {
                const r = prog.get(t.id);
                if (!r) return null;
                const b = job.baseline?.tasks?.[t.id];
                const late = isOverdue(r, t, today);
                const s = slip.get(t.id) || 0;
                const geo = preview(t, r);
                return (
                  <div key={t.id} style={{ display: "grid", gridTemplateColumns: COLS, gap: 6, alignItems: "center", marginBottom: 5 }}>
                    <div style={{ position: "relative" }}>
                      <input className="ec-input" value={t.name} onChange={(e) => CM.updateTask(t.id, { name: e.target.value })} style={{ ...inp, paddingRight: 30 }}
                        title={`${nice(r.start)} → ${nice(r.end)}${r.critical ? " · critical" : ` · ${r.float} days float`}${s ? ` · ${s > 0 ? `${s} late` : `${-s} early`} vs baseline` : ""}`} />
                      {(r.critical || late) && (
                        <span className="ec-mono" style={{ position: "absolute", right: 5, top: 4, fontSize: 9, fontWeight: 700, color: late ? TOKENS.alert : TOKENS.hivisDeep }}>{late ? "LATE" : "CP"}</span>
                      )}
                    </div>
                    <input className="ec-input" placeholder="Trade / sub" value={t.assignedTo || ""} onChange={(e) => CM.updateTask(t.id, { assignedTo: e.target.value })} style={inp} />
                    <select className="ec-input" value={(t.dependsOn || [])[0] || ""} style={inp}
                      onChange={(e) => CM.updateTask(t.id, { dependsOn: e.target.value ? [e.target.value] : [], lag: 0, ...(e.target.value ? {} : { startDate: r.start }) })}>
                      <option value="">Start {nice(r.start).replace(/ \d{4}$/, "")}</option>
                      {tasks.filter((x) => x.id !== t.id).map((x) => <option key={x.id} value={x.id}>{x.name}</option>)}
                    </select>
                    <div style={{ display: "flex", alignItems: "center", gap: 3 }}>
                      <input className="ec-input" type="number" min="1" value={t.days} onChange={(e) => CM.updateTask(t.id, { days: Math.max(1, Number(e.target.value) || 1) })} style={{ ...inp, width: 46 }} />
                      {t.delayDays > 0 && <span className="ec-mono" title={(t.delayLog || []).map((d) => `${d.date}: ${d.days}d ${d.reason}`).join("\n")} style={{ fontSize: 10, color: TOKENS.alert }}>+{t.delayDays}</span>}
                    </div>
                    <input className="ec-input" type="number" min="0" max="100" step="10" value={t.percentComplete} onChange={(e) => CM.updateTask(t.id, { percentComplete: Math.min(100, Math.max(0, Number(e.target.value) || 0)) })} style={inp} />
                    <div style={{ position: "relative", height: 22, background: TOKENS.paperLight, border: `1px solid ${TOKENS.rule}` }}>
                      {pct(today) >= 0 && pct(today) <= 100 && <div title="Today" style={{ position: "absolute", left: `${pct(today)}%`, top: -2, bottom: -2, width: 2, background: TOKENS.alert, opacity: 0.6 }} />}
                      {b && <div title={`Baseline ${nice(b.start)} → ${nice(b.end)}`} style={{ position: "absolute", left: `${pct(b.start)}%`, width: `${span(b.start, b.end)}%`, bottom: 1, height: 5, border: `1px dashed ${TOKENS.steel}`, boxSizing: "border-box" }} />}
                      <div onPointerDown={(e) => onDown(e, t, "move")}
                        title={`${nice(r.start)} → ${nice(r.end)} · ${r.dur} working days${r.critical ? " · critical path" : ` · ${r.float} days float`}`}
                        style={{ position: "absolute", left: `${geo.left}%`, width: `${geo.width}%`, top: 2, bottom: 7, cursor: "grab", touchAction: "none",
                          background: r.critical ? TOKENS.alert : TOKENS.ink, outline: late ? `2px solid ${TOKENS.alert}` : "none", outlineOffset: 1 }}>
                        <div style={{ position: "absolute", inset: 0, width: `${t.percentComplete}%`, background: TOKENS.hivis }} />
                        <div onPointerDown={(e) => { e.stopPropagation(); onDown(e, t, "size"); }} title="Drag to change the duration"
                          style={{ position: "absolute", right: -3, top: 0, bottom: 0, width: 8, cursor: "ew-resize" }} />
                      </div>
                    </div>
                    <button onClick={() => CM.deleteTask(t.id)} aria-label={`Delete ${t.name}`} style={{ border: "none", background: "none", cursor: "pointer", color: TOKENS.steel, fontSize: 15 }}>×</button>
                  </div>
                );
              })}
              <div style={{ fontSize: 11, color: TOKENS.steel, marginTop: 8, lineHeight: 1.5 }}>
                Drag a bar to move it, or its right end to change its length. <span style={{ color: TOKENS.alert, fontWeight: 700 }}>Red</span> = critical path.
                Dashed outline = baseline. +n = days added from the site diary (hover for the evidence).
              </div>
            </div>
          </div>
        </>
      )}
    </>
  );
}

const COLS = "180px 110px 120px 70px 52px 1fr 24px";
const inp = { padding: "3px 6px", fontSize: 11, width: "100%", minWidth: 0, boxSizing: "border-box" };

function Stat({ label, value, tone }) {
  return (
    <div style={{ border: `1px solid ${tone === "alert" ? TOKENS.alert : TOKENS.rule}`, background: TOKENS.card, padding: "7px 12px", minWidth: 120 }}>
      <div style={{ fontSize: 10, color: TOKENS.steel, textTransform: "uppercase", letterSpacing: "0.06em" }}>{label}</div>
      <div className="ec-mono" style={{ fontSize: 14, fontWeight: 700, color: tone === "alert" ? TOKENS.alert : TOKENS.ink }}>{value}</div>
    </div>
  );
}
