/* =========================================================================
   MODULE: logic/programme.js
   The construction programme as a builder actually runs it. Pure: no React,
   no storage, dates as "YYYY-MM-DD" strings (local calendar days, so a task
   never shifts a day because of a time zone).

     - working days: weekends, AU public holidays for the job's state, the
       industry Christmas shutdown, and any extra days the builder marks
     - finish-to-start dependencies with lag: when one task slips, every
       task after it moves
     - critical path (zero float) so the builder knows which slips matter
     - baseline vs current: the slip, in working days, per task
     - .ics calendar export, per job or per trade, so subbies get their
       dates in Google / Outlook / Apple Calendar without logging in
   ========================================================================= */

/* ---------- calendar arithmetic on YYYY-MM-DD ---------- */

const pad = (n) => String(n).padStart(2, "0");
export const ymd = (d) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
export const parse = (s) => { const [y, m, d] = String(s).slice(0, 10).split("-").map(Number); return new Date(y, (m || 1) - 1, d || 1); };
export const addDays = (s, n) => { const d = parse(s); d.setDate(d.getDate() + n); return ymd(d); };
const dow = (s) => parse(s).getDay();

/* Easter Sunday (anonymous Gregorian computus). */
export function easter(y) {
  const a = y % 19, b = Math.floor(y / 100), c = y % 100, d = Math.floor(b / 4), e = b % 4;
  const f = Math.floor((b + 8) / 25), g = Math.floor((b - f + 1) / 3), h = (19 * a + b - d - g + 15) % 30;
  const i = Math.floor(c / 4), k = c % 4, l = (32 + 2 * e + 2 * i - h - k) % 7, m = Math.floor((a + 11 * h + 22 * l) / 451);
  const month = Math.floor((h + l - 7 * m + 114) / 31), day = ((h + l - 7 * m + 114) % 31) + 1;
  return ymd(new Date(y, month - 1, day));
}

/* nth weekday (0=Sun..6=Sat) of a month; n = 1.. */
const nthWeekday = (y, m, wd, n) => {
  const first = new Date(y, m - 1, 1);
  const off = (wd - first.getDay() + 7) % 7;
  return ymd(new Date(y, m - 1, 1 + off + (n - 1) * 7));
};
/* a fixed-date holiday that falls on a weekend is observed on the Monday */
const observed = (s) => (dow(s) === 6 ? addDays(s, 2) : dow(s) === 0 ? addDays(s, 1) : s);

export const STATES = ["NSW", "VIC", "QLD", "WA", "SA", "TAS", "ACT", "NT"];

/**
 * Public holidays for one year and state, as { date: name }.
 * Covers the gazetted state-wide days that stop a building site; local
 * show days and part-day holidays are left to `extraNonWorkingDays`.
 */
export function publicHolidays(year, state = "NSW") {
  const H = {};
  const put = (d, name) => { H[d] = H[d] ? `${H[d]} / ${name}` : name; };
  const e = easter(year);
  put(observed(`${year}-01-01`), "New Year's Day");
  put(observed(`${year}-01-26`), "Australia Day");
  put(addDays(e, -2), "Good Friday");
  if (state !== "TAS" && state !== "WA") put(addDays(e, -1), "Easter Saturday");
  put(addDays(e, 1), "Easter Monday");
  put(`${year}-04-25`, "Anzac Day");
  if (["WA", "ACT"].includes(state) && dow(`${year}-04-25`) % 6 === 0) put(observed(`${year}-04-25`), "Anzac Day (observed)");
  // King's Birthday: 2nd Monday in June, except WA (late Sep) and QLD (1st Monday Oct)
  if (state === "QLD") put(nthWeekday(year, 10, 1, 1), "King's Birthday");
  else if (state === "WA") put(nthWeekday(year, 9, 1, 4), "King's Birthday");
  else put(nthWeekday(year, 6, 1, 2), "King's Birthday");
  // Labour Day
  const labour = { NSW: [10, 1], ACT: [10, 1], SA: [10, 1], VIC: [3, 2], TAS: [3, 2], WA: [3, 1], QLD: [5, 1], NT: [5, 1] }[state] || [10, 1];
  put(nthWeekday(year, labour[0], 1, labour[1]), state === "NT" ? "May Day" : state === "TAS" ? "Eight Hours Day" : "Labour Day");
  if (state === "VIC") { put(nthWeekday(year, 11, 2, 1), "Melbourne Cup"); }
  if (state === "ACT") put(nthWeekday(year, 3, 1, 2), "Canberra Day");
  if (state === "SA") put(nthWeekday(year, 3, 1, 2), "Adelaide Cup");
  if (state === "WA") put(nthWeekday(year, 6, 1, 1), "WA Day");
  if (state === "ACT") { const r = `${year}-05-27`; put(addDays(r, (8 - dow(r)) % 7), "Reconciliation Day"); }   // Monday on or after 27 May
  if (state === "NT") put(nthWeekday(year, 8, 1, 1), "Picnic Day");
  // Christmas and Boxing Day, with substitutes when they fall on a weekend
  const xmas = `${year}-12-25`, box = `${year}-12-26`;
  put(xmas, "Christmas Day");
  put(box, state === "SA" ? "Proclamation Day" : "Boxing Day");
  if (dow(xmas) === 6) { put(`${year}-12-27`, "Christmas Day (observed)"); put(`${year}-12-28`, "Boxing Day (observed)"); }
  else if (dow(xmas) === 0) put(`${year}-12-27`, "Christmas Day (observed)");
  else if (dow(box) === 6) put(`${year}-12-28`, "Boxing Day (observed)");
  return H;
}

/**
 * A calendar: what's a working day on this job.
 * @param opts { state, christmasShutdown (bool), extraNonWorkingDays: [YYYY-MM-DD], saturdays (bool) }
 */
export function makeCalendar(opts = {}) {
  const state = STATES.includes(opts.state) ? opts.state : "NSW";
  const byYear = new Map();
  const extra = new Set(opts.extraNonWorkingDays || []);
  const hol = (s) => {
    const y = +s.slice(0, 4);
    if (!byYear.has(y)) byYear.set(y, publicHolidays(y, state));
    return byYear.get(y)[s] || null;
  };
  // building industry shutdown: roughly the Friday before Christmas through the second week of January
  const shutdown = (s) => {
    if (!opts.christmasShutdown) return false;
    const m = +s.slice(5, 7), d = +s.slice(8, 10);
    return (m === 12 && d >= 20) || (m === 1 && d <= 9);
  };
  const reason = (s) => {
    const w = dow(s);
    if (w === 0 || (w === 6 && !opts.saturdays)) return w === 0 ? "Sunday" : "Saturday";
    return hol(s) || (shutdown(s) ? "Christmas shutdown" : null) || (extra.has(s) ? "Non-working day" : null);
  };
  const isWorking = (s) => !reason(s);
  const nextWorking = (s) => { let d = s; for (let i = 0; i < 400 && !isWorking(d); i++) d = addDays(d, 1); return d; };
  /* end date of a task that starts on `s` and takes n working days (n >= 1) */
  const endOf = (s, n) => { let d = nextWorking(s); let left = Math.max(1, Math.round(n)) - 1; while (left > 0) { d = addDays(d, 1); if (isWorking(d)) left--; } return d; };
  /* the working day n working days after s (n may be 0) */
  const after = (s, n) => { let d = s; let left = n; while (left > 0) { d = addDays(d, 1); if (isWorking(d)) left--; } return nextWorking(d); };
  /* working days strictly between a and b (b later): count of working days in (a, b] */
  const between = (a, b) => {
    if (a === b) return 0;
    const sign = a < b ? 1 : -1;
    let [lo, hi] = sign > 0 ? [a, b] : [b, a];
    let n = 0;
    while (lo < hi) { lo = addDays(lo, 1); if (isWorking(lo)) n++; }
    return sign * n;
  };
  return { state, isWorking, reason, nextWorking, endOf, after, between, holiday: hol };
}

/** Duration in working days, including delays logged against the task. */
export const duration = (t) => Math.max(1, Math.round(+t.days || 1)) + Math.max(0, Math.round(+t.delayDays || 0));

/**
 * Forward and backward pass.
 * Each task: { id, startDate, days, delayDays, dependsOn: [id], lag (working days), pinStart }
 * A task with predecessors starts the working day after the last of them
 * finishes (+ lag); its own startDate only holds it back when pinStart is
 * set ("not before"). A task with none starts on its startDate.
 * @returns Map id → { start, end, dur, early, float, critical, drivenBy }
 */
export function computeProgramme(tasks, cal) {
  const byId = new Map(tasks.map((t) => [t.id, t]));
  const out = new Map();
  const visiting = new Set();
  const preds = (t) => (t.dependsOn || []).filter((p) => byId.has(p) && p !== t.id);

  const forward = (t) => {
    if (out.has(t.id)) return out.get(t.id);
    if (visiting.has(t.id)) return null;           // a cycle: this edge is ignored
    visiting.add(t.id);
    const own = cal.nextWorking(t.startDate || ymd(new Date()));
    let start = null;
    let drivenBy = null;
    for (const pid of preds(t)) {
      const p = forward(byId.get(pid));
      if (!p) continue;
      const s = cal.after(p.end, 1 + Math.max(0, Math.round(+t.lag || 0)));
      if (!start || s > start) { start = s; drivenBy = pid; }
    }
    if (!start) start = own;
    else if (t.pinStart && own > start) { start = own; drivenBy = null; }
    const dur = duration(t);
    const r = { start, end: cal.endOf(start, dur), dur, drivenBy };
    visiting.delete(t.id);
    out.set(t.id, r);
    return r;
  };
  tasks.forEach(forward);

  // backward pass: latest finish without moving the project end
  const projectEnd = [...out.values()].reduce((m, r) => (r.end > m ? r.end : m), "0000-00-00");
  const succ = new Map(tasks.map((t) => [t.id, []]));
  for (const t of tasks) for (const p of preds(t)) succ.get(p).push(t);
  const lateFinish = new Map();
  const lf = (t) => {
    if (lateFinish.has(t.id)) return lateFinish.get(t.id);
    lateFinish.set(t.id, projectEnd);                 // provisional (guards cycles)
    let v = projectEnd;
    for (const s of succ.get(t.id)) {
      const sr = out.get(s.id);
      // latest this can finish = the successor's latest start, less lag, less one day
      const sLateStart = addBack(cal, lf(s), sr.dur - 1);
      const mine = addBack(cal, sLateStart, 1 + Math.max(0, Math.round(+s.lag || 0)));
      if (mine < v) v = mine;
    }
    lateFinish.set(t.id, v);
    return v;
  };
  for (const t of tasks) {
    const r = out.get(t.id);
    const f = cal.between(r.end, lf(t));
    r.float = Math.max(0, f);
    r.critical = r.float === 0;
  }
  return out;
}

/* the working day n working days before s */
function addBack(cal, s, n) {
  let d = s, left = n;
  while (left > 0) { d = addDays(d, -1); if (cal.isWorking(d)) left--; }
  return d;
}

/** Baseline snapshot: { takenAt, tasks: { id: { start, end } } } */
export function takeBaseline(prog) {
  const tasks = {};
  for (const [id, r] of prog) tasks[id] = { start: r.start, end: r.end };
  return { takenAt: new Date().toISOString(), tasks };
}

/** Slip of each task against the baseline, in working days (+ = late). */
export function slipAgainst(prog, baseline, cal) {
  const out = new Map();
  if (!baseline?.tasks) return out;
  for (const [id, r] of prog) {
    const b = baseline.tasks[id];
    if (b) out.set(id, cal.between(b.end, r.end));
  }
  return out;
}

/** Tasks that should be finished by today and aren't. */
export const isOverdue = (r, task, today) => r.end < today && (+task.percentComplete || 0) < 100;

/* ---------- .ics ---------- */

const icsEsc = (s) => String(s ?? "").replace(/\\/g, "\\\\").replace(/;/g, "\\;").replace(/,/g, "\\,").replace(/\r?\n/g, "\\n");
const icsDate = (s) => s.replace(/-/g, "");
/* RFC 5545 line folding at 75 octets */
const fold = (line) => {
  const out = [];
  let cur = "";
  for (const ch of line) {
    if (new TextEncoder().encode(cur + ch).length > (out.length ? 74 : 75)) { out.push(cur); cur = ""; }
    cur += ch;
  }
  out.push(cur);
  return out.join("\r\n ");
};

/**
 * Calendar file for a job's programme (optionally one trade / assignee).
 * @param job   { id, name, siteAddress }
 * @param tasks the job's tasks
 * @param prog  computeProgramme result
 * @param opts  { who: filter on assignedTo or trade, stamp: ISO }
 */
export function programmeIcs(job, tasks, prog, opts = {}) {
  const who = (opts.who || "").trim().toLowerCase();
  const stamp = (opts.stamp || new Date().toISOString()).replace(/[-:]/g, "").replace(/\.\d+/, "").slice(0, 15) + "Z";
  const lines = ["BEGIN:VCALENDAR", "VERSION:2.0", "PRODID:-//BuildYourOwn//Programme//EN", "CALSCALE:GREGORIAN", "METHOD:PUBLISH",
    `X-WR-CALNAME:${icsEsc(`${job.name || "Job"}${who ? ` - ${opts.who}` : ""}`)}`];
  for (const t of tasks) {
    if (who && !`${t.assignedTo || ""} ${t.trade || ""}`.toLowerCase().includes(who)) continue;
    const r = prog.get(t.id);
    if (!r) continue;
    lines.push("BEGIN:VEVENT",
      `UID:${t.id}@buildyourown.${job.id || "job"}`,
      `DTSTAMP:${stamp}`,
      `DTSTART;VALUE=DATE:${icsDate(r.start)}`,
      `DTEND;VALUE=DATE:${icsDate(addDays(r.end, 1))}`,
      `SUMMARY:${icsEsc(`${t.name}${job.name ? ` - ${job.name}` : ""}`)}`,
      `DESCRIPTION:${icsEsc([`${r.dur} working days`, t.assignedTo && `Assigned: ${t.assignedTo}`, t.trade && `Trade: ${t.trade}`, r.critical && "On the critical path: a day late here is a day late at handover."].filter(Boolean).join("\n"))}`,
      ...(job.siteAddress ? [`LOCATION:${icsEsc(job.siteAddress)}`] : []),
      "TRANSP:TRANSPARENT",
      "END:VEVENT");
  }
  lines.push("END:VCALENDAR");
  return lines.map(fold).join("\r\n") + "\r\n";
}
