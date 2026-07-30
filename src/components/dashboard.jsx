/* =========================================================================
   MODULE: components/dashboard.jsx — Site Office dashboard

   Layout borrows the Efferd block's hairline-grid idiom: a `gap-px
   bg-border` grid of flush, borderless cards, so the panels read as one
   continuous instrument rather than a scatter of floating boxes. That single
   pattern is most of what makes a dashboard look built rather than assembled.

   Everything in it is REAL. The Efferd block ships with hardcoded demo
   numbers (net revenue, channel sales, activity feed); those were removed.
   Showing a builder invented figures on their own dashboard is worse than
   showing nothing, because they cannot tell which numbers to trust.

   Priority order, top-left to bottom-right, is the order the questions
   actually get asked:
     1. Am I owed money?        → the KPI row, unclaimed first
     2. Is money coming in?     → claimed per month
     3. Is a job losing money?  → margin column + over-budget list
     4. What is coming?         → pipeline
   ========================================================================= */

import React, { useMemo } from "react";
import {
  Area, AreaChart, Bar, BarChart, Cell, ResponsiveContainer, Tooltip, XAxis, YAxis,
} from "recharts";
import {
  AlertTriangle, ArrowDownRight, ArrowUpRight, HardHat, Minus, Plus, Wallet,
} from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import { useResolvedTokens } from "@/design/theme.js";
import { fmt, currencySymbol } from "@/lib/format.js";
import { cn } from "@/lib/utils";
import * as CM from "@/state/cm.js";

export function Dashboard({ onOpenJob, onSeeAll, onNewJob }) {
  const T = useResolvedTokens();
  const cur = currencySymbol("AU");
  const m = useMemo(buildModel, []);

  if (!m.pipeline.totalJobs) return <EmptyState onNewJob={onNewJob} />;

  return (
    /* The grid IS the border: 1px gaps over a bg-rule surface. Children are
       flush and borderless, so every divider is exactly one hairline and
       nothing double-borders against its neighbour. */
    <div className="overflow-hidden rounded-sm border border-rule bg-rule">
      <div className="grid grid-cols-1 gap-px sm:grid-cols-2 xl:grid-cols-4">
        <Kpi
          label="Owed to you"
          value={`${cur}${fmt(m.pipeline.unclaimedTotal)}`}
          foot="Earned on site, not yet invoiced"
          icon={Wallet}
          accent
          action={m.pipeline.unclaimedTotal > 0 ? <Button variant="hivis" size="xs" onClick={onSeeAll}>Claim</Button> : null}
        />
        <Kpi
          label="Contracted"
          value={`${cur}${fmt(m.pipeline.contractedValue)}`}
          foot={`${m.pipeline.activeJobs} on site of ${m.pipeline.totalJobs}`}
          icon={HardHat}
        />
        <Kpi
          label="Committed"
          value={`${cur}${fmt(m.totals.committed)}`}
          foot="Purchase orders + approved variations"
        />
        <Kpi
          label="Margin"
          value={`${m.totals.marginPct.toFixed(1)}%`}
          foot="Across jobs on site"
          delta={m.totals.marginPct}
          deltaFloor={8}
        />
      </div>

      <div className="grid grid-cols-1 gap-px border-t border-rule lg:grid-cols-[1.6fr_1fr]">
        <Panel title="Money in" sub="Claimed per month. Drafts excluded — only issued claims count.">
          {m.series.length < 2 ? (
            <Hint>Two months of issued claims and this draws your cash-in curve.</Hint>
          ) : (
            <div className="h-[180px] w-full">
              <ResponsiveContainer width="100%" height="100%">
                <AreaChart data={m.series} margin={{ top: 6, right: 4, bottom: 0, left: 0 }}>
                  <defs>
                    <linearGradient id="cashIn" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="0%" stopColor={T.hivisDeep} stopOpacity={0.32} />
                      <stop offset="100%" stopColor={T.hivisDeep} stopOpacity={0.02} />
                    </linearGradient>
                  </defs>
                  <XAxis dataKey="month" axisLine={false} tickLine={false}
                    tick={{ fill: T.steel, fontSize: 10, fontFamily: "JetBrains Mono, monospace" }} />
                  <YAxis hide />
                  <Tooltip
                    cursor={{ stroke: T.rule }}
                    formatter={(v, k) => [`${cur}${fmt(v)}`, k === "cumulative" ? "Running total" : "This month"]}
                    contentStyle={tooltipStyle(T)}
                    labelStyle={{ color: T.steel, fontSize: 10 }}
                  />
                  <Area type="monotone" dataKey="cumulative" stroke={T.hivisDeep} strokeWidth={2} fill="url(#cashIn)" />
                </AreaChart>
              </ResponsiveContainer>
            </div>
          )}
        </Panel>

        <Panel title="Pipeline" sub="Enquiry through to practical completion.">
          <div className="h-[180px] w-full">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={m.stages} layout="vertical" margin={{ top: 0, right: 8, bottom: 0, left: 0 }}>
                <XAxis type="number" hide />
                <YAxis type="category" dataKey="name" width={74} axisLine={false} tickLine={false}
                  tick={{ fill: T.steel, fontSize: 10, fontFamily: "JetBrains Mono, monospace" }} />
                <Tooltip
                  cursor={{ fill: T.paperLight }}
                  formatter={(v, _k, p) => [`${v} job${v === 1 ? "" : "s"} · ${cur}${fmt(p.payload.value)}`, "Stage"]}
                  contentStyle={tooltipStyle(T)}
                  labelStyle={{ color: T.steel, fontSize: 10 }}
                />
                <Bar dataKey="count" radius={[0, 2, 2, 0]} barSize={13}>
                  {m.stages.map((d, i) => <Cell key={i} fill={d.live ? T.hivisDeep : T.steel} />)}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </div>
        </Panel>
      </div>

      <div className="grid grid-cols-1 gap-px border-t border-rule lg:grid-cols-[1.6fr_1fr]">
        <Panel
          title="Jobs on site"
          sub="Sorted by what you are owed."
          action={<Button variant="subtle" size="xs" onClick={onSeeAll}>All jobs</Button>}
          flush
        >
          {!m.rows.length ? (
            <div className="p-4 pt-0"><Hint>Move a won job to “On site” to start tracking cost against it.</Hint></div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full min-w-[520px] border-collapse">
                <thead>
                  <tr className="border-y border-rule">
                    {["Job", "Claimed", "Committed", "Owed", "Margin"].map((h, i) => (
                      <th key={h} className={cn(
                        "px-4 py-2 font-mono text-[9px] font-bold uppercase tracking-[0.14em] text-steel",
                        i === 0 ? "text-left" : "text-right"
                      )}>{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {m.rows.slice(0, 6).map((r) => {
                    const pct = r.contract > 0 ? (r.claimed / r.contract) * 100 : 0;
                    return (
                      <tr key={r.id} onClick={() => onOpenJob?.(r.id)}
                        className="cursor-pointer border-b border-rule/60 transition-colors last:border-0 hover:bg-paper-light">
                        <td className="max-w-[190px] px-4 py-2.5">
                          <div className="truncate text-xs font-medium text-ink">{r.name}</div>
                          <div className="mt-0.5 flex items-center gap-1.5 font-mono text-[9px] uppercase tracking-wider text-steel">
                            <span>{r.jobNo}</span>
                            {r.atRisk > 0 && <span className="font-bold text-alert">{r.atRisk} over</span>}
                          </div>
                        </td>
                        <td className="px-4 py-2.5">
                          <div className="flex items-center justify-end gap-2">
                            <Progress value={pct} className="w-16" />
                            <span className="w-8 text-right font-mono text-[10px] tabular-nums text-steel">{Math.round(pct)}%</span>
                          </div>
                        </td>
                        <td className="px-4 py-2.5 text-right font-mono text-[11px] tabular-nums text-ink-soft">{cur}{fmt(r.committed)}</td>
                        <td className="px-4 py-2.5 text-right font-mono text-[11px] font-bold tabular-nums text-ink">{cur}{fmt(r.unclaimed)}</td>
                        <td className="px-4 py-2.5 text-right">
                          <span className={cn("font-mono text-[11px] font-bold tabular-nums", r.marginPct < 8 ? "text-alert" : "text-ok")}>
                            {r.marginPct.toFixed(0)}%
                          </span>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </Panel>

        <Panel
          title="Over budget"
          sub={m.atRisk.length ? "Committed cost past the allowance. Worst first." : "Every trade inside its allowance."}
          icon={m.atRisk.length ? AlertTriangle : null}
        >
          {!m.atRisk.length ? (
            <Hint>Fills in when a purchase order or approved variation pushes a trade past its budget.</Hint>
          ) : (
            <div className="space-y-2">
              {m.atRisk.slice(0, 4).map(({ job, row }) => (
                <button key={`${job.id}-${row.id}`} onClick={() => onOpenJob?.(job.id)}
                  className="w-full rounded-sm border border-rule bg-paper-light p-2.5 text-left transition-colors hover:border-alert">
                  <div className="flex items-baseline justify-between gap-3">
                    <span className="truncate text-xs font-medium text-ink">{row.name}</span>
                    <span className="shrink-0 font-mono text-[11px] font-bold tabular-nums text-alert">
                      +{cur}{fmt(Math.abs(row.variance))}
                    </span>
                  </div>
                  <div className="mt-1.5 flex items-center gap-2">
                    <Progress value={row.percentUsed === Infinity ? 100 : row.percentUsed} className="flex-1" />
                    <span className="w-9 text-right font-mono text-[10px] tabular-nums text-steel">
                      {row.percentUsed === Infinity ? "—" : `${Math.round(row.percentUsed)}%`}
                    </span>
                  </div>
                  <div className="mt-1 font-mono text-[9px] uppercase tracking-wider text-steel">
                    {job.jobNo} · {row.code}
                  </div>
                </button>
              ))}
            </div>
          )}
        </Panel>
      </div>
    </div>
  );
}

const tooltipStyle = (T) => ({
  background: T.card, border: `1px solid ${T.rule}`, borderRadius: 2, fontSize: 11, color: T.ink,
});

/* ------------------------------------------------------------------- KPI */

function Kpi({ label, value, foot, icon: Icon, accent, action, delta, deltaFloor }) {
  const dir = delta == null ? null : delta >= deltaFloor ? "up" : delta > 0 ? "flat" : "down";
  const DeltaIcon = dir === "up" ? ArrowUpRight : dir === "down" ? ArrowDownRight : Minus;

  return (
    <div className={cn("flex flex-col justify-between gap-3 p-4", accent ? "bg-emphasis" : "bg-card")}>
      <div className="flex items-center justify-between gap-2">
        <span className={cn(
          "font-mono text-[10px] font-bold uppercase tracking-[0.16em]",
          accent ? "text-on-emphasis-soft" : "text-steel"
        )}>
          {label}
        </span>
        {Icon && <Icon className={cn("size-3.5", accent ? "text-on-emphasis" : "text-steel")} />}
      </div>

      <div className={cn(
        "font-mono text-[26px] font-bold leading-none tabular-nums",
        accent ? "text-on-emphasis" : "text-ink"
      )}>
        {value}
      </div>

      <div className="flex items-center justify-between gap-2">
        <span className={cn("text-[10px] leading-snug", accent ? "text-on-emphasis-soft" : "text-steel")}>
          {foot}
        </span>
        {action}
        {dir && (
          <span className={cn(
            "flex shrink-0 items-center gap-0.5 font-mono text-[10px] font-bold tabular-nums",
            dir === "up" ? "text-ok" : dir === "down" ? "text-alert" : "text-steel"
          )}>
            <DeltaIcon className="size-3" />
          </span>
        )}
      </div>
    </div>
  );
}

/* ----------------------------------------------------------------- panel */

function Panel({ title, sub, action, icon: Icon, flush, children }) {
  return (
    <section className="bg-card">
      <div className="flex items-start justify-between gap-3 p-4">
        <div className="min-w-0">
          <h3 className="flex items-center gap-2 font-display text-base leading-none">
            {Icon && <Icon className="size-4 text-alert" />}
            {title}
          </h3>
          {sub && <p className="mt-1.5 text-[11px] leading-relaxed text-steel">{sub}</p>}
        </div>
        {action}
      </div>
      <div className={flush ? "" : "p-4 pt-0"}>{children}</div>
    </section>
  );
}

function Hint({ children }) {
  return <p className="text-xs leading-relaxed text-steel">{children}</p>;
}

/* ----------------------------------------------------------------- model */

function buildModel() {
  const pipeline = CM.pipelineSummary();
  const jobs = CM.listJobs();
  const active = jobs.filter((j) => ["in_progress", "practical_completion"].includes(j.status));

  const rows = [];
  const atRisk = [];
  let committed = 0;
  let contract = 0;

  for (const j of active) {
    const f = CM.jobFinancials(j.id);
    committed += f.totalForecast;
    contract += f.contractSum;
    rows.push({
      id: j.id, jobNo: j.jobNo, name: j.name,
      contract: f.contractSum, committed: f.totalForecast,
      claimed: f.claimed, unclaimed: f.unclaimed,
      marginPct: f.grossMarginPct, atRisk: f.atRiskCount,
    });
    for (const r of f.rows.filter((x) => x.atRisk)) atRisk.push({ job: j, row: r });
  }

  atRisk.sort((a, b) => a.row.variance - b.row.variance);
  rows.sort((a, b) => b.unclaimed - a.unclaimed);

  const stages = CM.JOB_STATUS.filter((s) => s.group !== "done").map((s) => ({
    name: s.label,
    count: pipeline.byStatus[s.id]?.count || 0,
    value: pipeline.byStatus[s.id]?.value || 0,
    live: s.group === "active",
  }));

  return {
    pipeline, rows, atRisk, stages,
    series: claimSeries(jobs),
    totals: { committed, contract, marginPct: contract > 0 ? ((contract - committed) / contract) * 100 : 0 },
  };
}

/** Issued claims bucketed by month, plus a running total. */
function claimSeries(jobs) {
  const byMonth = new Map();
  for (const j of jobs) {
    for (const c of CM.listClaims(j.id)) {
      if (c.status === "draft") continue;
      const key = (c.periodTo || "").slice(0, 7);
      if (!key) continue;
      byMonth.set(key, (byMonth.get(key) || 0) + CM.claimTotals(c).thisClaim);
    }
  }
  let running = 0;
  return [...byMonth.keys()].sort().map((k) => {
    running += byMonth.get(k);
    const [y, mo] = k.split("-");
    return {
      month: new Date(+y, +mo - 1, 1).toLocaleDateString(undefined, { month: "short" }),
      claimed: Math.round(byMonth.get(k)),
      cumulative: Math.round(running),
    };
  });
}

function EmptyState({ onNewJob }) {
  return (
    <div className="rounded-sm border border-dashed border-rule bg-card">
      <div className="flex flex-col items-center gap-3 px-6 py-16 text-center">
        <span className="grid size-10 place-items-center rounded-sm bg-emphasis">
          <Wallet className="size-5 text-on-emphasis" />
        </span>
        <h2 className="font-display text-xl">No jobs yet</h2>
        <p className="max-w-md text-xs leading-relaxed text-steel">
          Create a job, drop a plan into Takeoff to measure it, then set budgets. Cash, margin and
          risk start tracking here on their own from that point.
        </p>
        <Button variant="hivis" size="sm" className="mt-1" onClick={onNewJob}>
          <Plus className="size-3.5" /> New job
        </Button>
      </div>
    </div>
  );
}

export default Dashboard;
