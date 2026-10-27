/* The construction programme (src/logic/programme.js): AU working days,
   dependencies, critical path, baseline slip and calendar export. */
import { publicHolidays, easter, makeCalendar, computeProgramme, takeBaseline, slipAgainst, programmeIcs, isOverdue } from "../src/logic/programme.js";

let pass = 0, fail = 0;
const ok = (name, good, detail = "") => {
  console.log(`${good ? "PASS" : "FAIL"}  ${name}${good || !detail ? "" : `\n        ${detail}`}`);
  good ? pass++ : fail++;
};
const eq = (name, got, want) => ok(name, JSON.stringify(got) === JSON.stringify(want), `got ${JSON.stringify(got)}, want ${JSON.stringify(want)}`);

/* ---- holidays ---- */
eq("Easter 2026", easter(2026), "2026-04-05");
eq("Easter 2027", easter(2027), "2027-03-28");
const nsw26 = publicHolidays(2026, "NSW");
ok("NSW 2026: Good Friday, Easter Monday, Labour Day 5 Oct, King's Birthday 8 Jun",
  nsw26["2026-04-03"] && nsw26["2026-04-06"] && /Labour/.test(nsw26["2026-10-05"]) && /King/.test(nsw26["2026-06-08"]));
ok("Australia Day 2026 on Monday 26 Jan", /Australia/.test(nsw26["2026-01-26"]));
ok("Christmas 2027 falls Saturday: observed Mon 27 + Tue 28", /Christmas/.test(publicHolidays(2027, "NSW")["2027-12-27"]) && /Boxing/.test(publicHolidays(2027, "NSW")["2027-12-28"]));
ok("VIC 2026: Labour Day 9 Mar and Melbourne Cup 3 Nov", /Labour/.test(publicHolidays(2026, "VIC")["2026-03-09"]) && /Cup/.test(publicHolidays(2026, "VIC")["2026-11-03"]));
ok("QLD 2026: King's Birthday first Monday in October", /King/.test(publicHolidays(2026, "QLD")["2026-10-05"]));
ok("WA 2026: Labour Day 2 Mar, WA Day 1 Jun", /Labour/.test(publicHolidays(2026, "WA")["2026-03-02"]) && /WA Day/.test(publicHolidays(2026, "WA")["2026-06-01"]));
ok("ACT 2026: Reconciliation Day Monday 1 June", /Reconciliation/.test(publicHolidays(2026, "ACT")["2026-06-01"]));

/* ---- calendar ---- */
const cal = makeCalendar({ state: "NSW" });
ok("weekends are not working days", !cal.isWorking("2026-08-01") && !cal.isWorking("2026-08-02") && cal.isWorking("2026-08-03"));
eq("10 working days from Mon 3 Aug lands Fri 14 Aug", cal.endOf("2026-08-03", 10), "2026-08-14");
eq("a task over Labour Day loses a day", cal.endOf("2026-09-28", 10), "2026-10-12");
const shut = makeCalendar({ state: "NSW", christmasShutdown: true });
eq("Christmas shutdown: a task starting 18 Dec resumes after the break", shut.endOf("2026-12-18", 2), "2027-01-11");
eq("extra non-working days count", makeCalendar({ extraNonWorkingDays: ["2026-08-04"] }).endOf("2026-08-03", 2), "2026-08-05");
eq("Saturday work when switched on", makeCalendar({ saturdays: true }).endOf("2026-08-06", 3), "2026-08-08");
eq("working days between", cal.between("2026-08-03", "2026-08-10"), 5);

/* ---- dependencies ---- */
const T = [
  { id: "slab", name: "Slab", startDate: "2026-08-03", days: 5 },
  { id: "frame", name: "Frame", startDate: "2026-01-01", days: 10, dependsOn: ["slab"] },
  { id: "roof", name: "Roof", days: 5, dependsOn: ["frame"] },
  { id: "elec", name: "Electrical rough-in", days: 3, dependsOn: ["frame"], assignedTo: "Sparky Co", trade: "electrical" },
  { id: "plaster", name: "Plaster", days: 8, dependsOn: ["roof", "elec"] },
];
let P = computeProgramme(T, cal);
eq("slab runs Mon–Fri", [P.get("slab").start, P.get("slab").end], ["2026-08-03", "2026-08-07"]);
eq("frame starts the Monday after the slab (ignores its stale date)", P.get("frame").start, "2026-08-10");
eq("plaster waits for the later of roof and electrical", [P.get("plaster").start, P.get("plaster").drivenBy], [cal.after(P.get("roof").end, 1), "roof"]);
ok("critical path: slab, frame, roof, plaster — electrical has float", ["slab", "frame", "roof", "plaster"].every((id) => P.get(id).critical) && !P.get("elec").critical && P.get("elec").float === 2);

const base = takeBaseline(P);
const slipped = T.map((t) => (t.id === "frame" ? { ...t, delayDays: 3 } : t));
const P2 = computeProgramme(slipped, cal);
const slip = slipAgainst(P2, base, cal);
eq("3 rain days on the frame push everything after it 3 days", ["slab", "frame", "roof", "elec", "plaster"].map((id) => slip.get(id)), [0, 3, 3, 3, 3]);
eq("lag: a 2-day cure before the frame", computeProgramme([T[0], { ...T[1], lag: 2 }], cal).get("frame").start, "2026-08-12");
eq("pinned start holds a task back", computeProgramme([T[0], { ...T[1], startDate: "2026-08-17", pinStart: true }], cal).get("frame").start, "2026-08-17");
const cyc = computeProgramme([{ id: "a", startDate: "2026-08-03", days: 2, dependsOn: ["b"] }, { id: "b", startDate: "2026-08-03", days: 2, dependsOn: ["a"] }], cal);
ok("a dependency loop does not hang or crash", cyc.size === 2);
ok("overdue: past its end and not finished", isOverdue(P.get("slab"), { percentComplete: 50 }, "2026-08-20") && !isOverdue(P.get("slab"), { percentComplete: 100 }, "2026-08-20"));

/* ---- calendar file ---- */
const ics = programmeIcs({ id: "J1", name: "Smith, 12 Rose St", siteAddress: "12 Rose St, Ryde NSW" }, T, P, { stamp: "2026-07-01T00:00:00Z" });
ok("ics: one event per task, CRLF, all-day dates", (ics.match(/BEGIN:VEVENT/g) || []).length === T.length && ics.includes("\r\n") && ics.includes("DTSTART;VALUE=DATE:20260803") && ics.includes("DTEND;VALUE=DATE:20260808"));
ok("ics: commas and semicolons escaped", ics.includes("Smith\\, 12 Rose St"));
ok("ics: lines folded at 75 octets", ics.split("\r\n").every((l) => new TextEncoder().encode(l).length <= 75));
const sparky = programmeIcs({ id: "J1", name: "Smith" }, T, P, { who: "sparky", stamp: "2026-07-01T00:00:00Z" });
ok("ics for one trade has only their tasks", (sparky.match(/BEGIN:VEVENT/g) || []).length === 1 && sparky.includes("Electrical rough-in"));

console.log(`\n${pass} passed, ${fail} failed`);
if (fail) process.exit(1);
