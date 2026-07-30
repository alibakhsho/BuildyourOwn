/* =========================================================================
   MODULE: components/dashboard.jsx — Site Office dashboard

   Answers, in priority order, the questions a builder opens this for:
     1. Am I owed money?        → the hero strip
     2. Is money coming in?     → claimed-over-time
     3. Is a job losing money?  → risk list + the margin column
     4. What is coming?         → pipeline

   Composition notes, since "make it look designed" was the brief:
   - One hero band, not a row of equal tiles. Equal weight communicates no
     priority, which is what made the previous version read as unfinished.
   - Jobs are a dense TABLE, not cards. Cards waste horizontal space and
     stop you comparing a margin column down the page, which is the whole
     reason to look at a job list.
   - Colour is rationed. Hi-vis marks one thing per view; red only ever
     means money is being lost.
   ========================================================================= */

import React, { useMemo } from "react";
import {
  Area, AreaChart, Bar, BarChart, Cell, ResponsiveContainer, Tooltip, XAxis, YAxis,
} from "recharts";
import { AlertTriangle, ArrowUpRight, Plus, TrendingUp, Wallet } from "lucide-react";

import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
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

  const model = useMemo(buildModel, []);
  const { pipeline, rows, atRisk, series, totals } = model;

  if (!pipeline.totalJobs) return <EmptyState onNewJob={onNewJob} />;

  return (
    <div className="space-y-4">
      <HeroBand pipeline={pipeline} totals={totals} cur={cur} onSeeAll={onSeeAll} />

      <div className="grid gap-4 xl:grid-cols-[1.55fr_1fr]">
        <MoneyIn series={series} cur={cur} T={T} />
        <PipelineCard pipeline={pipeline} cur={cur} T={T} />
      </div>

      <div className="grid gap-4 xl:grid-cols-[1.55fr_1fr]">
        <JobsTable rows={rows} cur={cur} onOpenJob={onOpenJob} onSeeAll={onSeeAll} />
        <RiskCard atRisk={atRisk} cur={cur} onOpenJob={onOpenJob} />
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ model */

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
      id: j.id,
      jobNo: j.jobNo,
      name: j.name,
      status: j.status,
      contract: f.contractSum,
      committed: f.totalForecast,
      claimed: f.claimed,
      unclaimed: f.unclaimed,
      marginPct: f.grossMarginPct,
      atRisk: f.atRiskCount,
    });
    for (const r of f.rows.filter((x) => x.atRisk)) atRisk.push({ job: j, row: r });
  }

  atRisk.sort((a, b) => a.row.variance - b.row.variance);
  rows.sort((a, b) => b.unclaimed - a.unclaimed);

  return {
    pipeline,
    rows,
    atRisk,
    series: claimSeries(jobs),
    totals: {
      committed,
      contract,
      marginPct: contract > 0 ? ((contract - committed) / contract) * 100 : 0,
    },
  };
}

/** Claimed value bucketed by month, cumulative — the cash-in curve. */
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
  const keys = [...byMonth.keys()].sort();
  let running = 0;
  return keys.map((k) => {
    running += byMonth.get(k);
    const [y, m] = k.split("-");
    return {
      month: new Date(+y, +m - 1, 1).toLocaleDateString(undefined, { month: "short" }),
      claimed: Math.round(byMonth.get(k)),
      cumulative: Math.round(running),
    };
  });
}

/* --------------------------------------------------------------- hero band */

function HeroBand({ pipeline, totals, cur, onSeeAll }) {
  const owed = pipeline.unclaimedTotal;
  return (
    <Card className="overflow-hidden border-0 bg-emphasis">
      <div className="grid gap-px bg-white/10 md:grid-cols-[1.5fr_1fr_1fr_1fr]">
        <div className="bg-emphasis p-5">
          <div className="flex items-center gap-2">
            <Wallet className="size-4 text-on-emphasis" />
            <span className="font-mono text-[10px] font-bold uppercase tracking-[0.16em] text-on-emphasis-soft">
              Owed to you
            </span>
          </div>
          <div className="mt-2 font-mono text-[38px] font-bold leading-none tabular-nums text-on-emphasis">
            {cur}{fmt(owed)}
          </div>
          <p className="mt-2 max-w-xs text-xs leading-relaxed text-on-emphasis-soft">
            Work completed on site that has not been invoiced yet.
          </p>
          {owed > 0 && (
            <Button variant="hivis" size="sm" className="mt-3" onClick={onSeeAll}>
              Raise a claim <ArrowUpRight className="size-3.5" />
            </Button>
          )}
        </div>

        <HeroCell label="On site" value={pipeline.activeJobs} sub={`of ${pipeline.totalJobs} jobs`} />
        <HeroCell label="Contracted" value={`${cur}${fmt(pipeline.contractedValue)}`} sub="Won and running" />
        <HeroCell
          label="Margin"
          value={`${totals.marginPct.toFixed(1)}%`}
          sub="Across active jobs"
          tone={totals.marginPct < 8 ? "warn" : "flat"}
        />
      </div>
    </Card>
  );
}

function HeroCell({ label, value, sub, tone = "flat" }) {
  return (
    <div className="flex flex-col justify-center bg-emphasis p-5">
      <span className="font-mono text-[10px] font-bold uppercase tracking-[0.16em] text-on-emphasis-soft">
        {label}
      </span>
      <span
        className={cn(
          "mt-1.5 font-mono text-2xl font-bold leading-none tabular-nums",
          tone === "warn" ? "text-hivis" : "text-on-emphasis"
        )}
      >
        {value}
      </span>
      <span className="mt-1.5 text-[11px] text-on-emphasis-soft">{sub}</span>
    </div>
  );
}

/* ---------------------------------------------------------------- money in */

function MoneyIn({ series, cur, T }) {
  return (
    <Card>
      <CardHeader className="flex-row items-start justify-between gap-3">
        <div>
          <CardTitle className="flex items-center gap-2">
            <TrendingUp className="size-4 text-steel" />
            Money in
          </CardTitle>
          <CardDescription>Claimed each month, and the running total.</CardDescription>
        </div>
      </CardHeader>
      <CardContent>
        {series.length < 2 ? (
          <Hint>
            Two months of issued claims and this draws a cash-in curve. Draft claims are excluded —
            only what has actually gone out to a client counts.
          </Hint>
        ) : (
          <div className="h-[190px] w-full">
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart data={series} margin={{ top: 6, right: 4, bottom: 0, left: 0 }}>
                <defs>
                  <linearGradient id="claimFill" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor={T.hivisDeep} stopOpacity={0.35} />
                    <stop offset="100%" stopColor={T.hivisDeep} stopOpacity={0.02} />
                  </linearGradient>
                </defs>
                <XAxis
                  dataKey="month" axisLine={false} tickLine={false}
                  tick={{ fill: T.steel, fontSize: 10, fontFamily: "JetBrains Mono, monospace" }}
                />
                <YAxis hide />
                <Tooltip
                  cursor={{ stroke: T.rule }}
                  formatter={(v, k) => [`${cur}${fmt(v)}`, k === "cumulative" ? "Running total" : "This month"]}
                  contentStyle={{
                    background: T.card, border: `1px solid ${T.rule}`,
                    borderRadius: 2, fontSize: 11, color: T.ink,
                  }}
                  labelStyle={{ color: T.steel, fontSize: 10 }}
                />
                <Area
                  type="monotone" dataKey="cumulative" stroke={T.hivisDeep}
                  strokeWidth={2} fill="url(#claimFill)"
                />
              </AreaChart>
            </ResponsiveContainer>
          </div>
        )}
      </CardContent>
    </Card>
  );
}

/* ---------------------------------------------------------------- pipeline */

function PipelineCard({ pipeline, cur, T }) {
  const stages = CM.JOB_STATUS.filter((s) => s.group !== "done");
  const data = stages.map((s) => ({
    name: s.label,
    count: pipeline.byStatus[s.id]?.count || 0,
    value: pipeline.byStatus[s.id]?.value || 0,
    live: s.group === "active",
  }));

  return (
    <Card>
      <CardHeader>
        <CardTitle>Pipeline</CardTitle>
        <CardDescription>Enquiry through to practical completion.</CardDescription>
      </CardHeader>
      <CardContent>
        <div className="h-[190px] w-full">
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={data} layout="vertical" margin={{ top: 0, right: 8, bottom: 0, left: 0 }}>
              <XAxis type="number" hide />
              <YAxis
                type="category" dataKey="name" width={78} axisLine={false} tickLine={false}
                tick={{ fill: T.steel, fontSize: 10, fontFamily: "JetBrains Mono, monospace" }}
              />
              <Tooltip
                cursor={{ fill: T.paperLight }}
                formatter={(v, _k, p) => [`${v} job${v === 1 ? "" : "s"} · ${cur}${fmt(p.payload.value)}`, "Stage"]}
                contentStyle={{
                  background: T.card, border: `1px solid ${T.rule}`,
                  borderRadius: 2, fontSize: 11, color: T.ink,
                }}
                labelStyle={{ color: T.steel, fontSize: 10 }}
              />
              <Bar dataKey="count" radius={[0, 2, 2, 0]} barSize={14}>
                {data.map((d, i) => (
                  <Cell key={i} fill={d.live ? T.hivisDeep : T.steel} />
                ))}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        </div>
      </CardContent>
    </Card>
  );
}

/* ------------------------------------------------------------- jobs table */

function JobsTable({ rows, cur, onOpenJob, onSeeAll }) {
  return (
    <Card>
      <CardHeader className="flex-row items-center justify-between gap-3">
        <div>
          <CardTitle>Jobs on site</CardTitle>
          <CardDescription>Sorted by what you are owed.</CardDescription>
        </div>
        <Button variant="subtle" size="sm" onClick={onSeeAll}>All jobs</Button>
      </CardHeader>
      <CardContent className="px-0 pb-0">
        {!rows.length ? (
          <div className="px-4 pb-4">
            <Hint>Move a won job to “On site” and it starts tracking cost here.</Hint>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[560px] border-collapse">
              <thead>
                <tr className="border-y border-rule">
                  {["Job", "Progress", "Committed", "Unclaimed", "Margin"].map((h, i) => (
                    <th
                      key={h}
                      className={cn(
                        "px-4 py-2 font-mono text-[9px] font-bold uppercase tracking-[0.14em] text-steel",
                        i === 0 ? "text-left" : "text-right"
                      )}
                    >
                      {h}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {rows.slice(0, 6).map((r) => {
                  const claimedPct = r.contract > 0 ? (r.claimed / r.contract) * 100 : 0;
                  const thin = r.marginPct < 8;
                  return (
                    <tr
                      key={r.id}
                      onClick={() => onOpenJob?.(r.id)}
                      className="cursor-pointer border-b border-rule/60 transition-colors last:border-0 hover:bg-paper-light"
                    >
                      <td className="max-w-[210px] px-4 py-2.5">
                        <div className="truncate text-xs font-medium text-ink">{r.name}</div>
                        <div className="mt-0.5 flex items-center gap-1.5">
                          <span className="font-mono text-[9px] uppercase tracking-wider text-steel">{r.jobNo}</span>
                          {r.atRisk > 0 && (
                            <span className="font-mono text-[9px] font-bold text-alert">
                              {r.atRisk} over
                            </span>
                          )}
                        </div>
                      </td>
                      <td className="px-4 py-2.5">
                        <div className="flex items-center justify-end gap-2">
                          <Progress value={claimedPct} className="w-20" />
                          <span className="w-8 text-right font-mono text-[10px] tabular-nums text-steel">
                            {Math.round(claimedPct)}%
                          </span>
                        </div>
                      </td>
                      <td className="px-4 py-2.5 text-right font-mono text-[11px] tabular-nums text-ink-soft">
                        {cur}{fmt(r.committed)}
                      </td>
                      <td className="px-4 py-2.5 text-right font-mono text-[11px] font-bold tabular-nums text-ink">
                        {cur}{fmt(r.unclaimed)}
                      </td>
                      <td className="px-4 py-2.5 text-right">
                        <span
                          className={cn(
                            "font-mono text-[11px] font-bold tabular-nums",
                            thin ? "text-alert" : "text-ok"
                          )}
                        >
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
      </CardContent>
    </Card>
  );
}

/* ------------------------------------------------------------------- risk */

function RiskCard({ atRisk, cur, onOpenJob }) {
  return (
    <Card className={atRisk.length ? "border-alert" : undefined}>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          {atRisk.length > 0 && <AlertTriangle className="size-4 text-alert" />}
          Over budget
        </CardTitle>
        <CardDescription>
          {atRisk.length
            ? "Committed cost has passed the allowance. Worst first."
            : "Every trade is inside its allowance."}
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-2">
        {!atRisk.length ? (
          <Hint>This fills in when a purchase order or approved variation pushes a trade past its budget.</Hint>
        ) : (
          atRisk.slice(0, 5).map(({ job, row }) => (
            <button
              key={`${job.id}-${row.id}`}
              onClick={() => onOpenJob?.(job.id)}
              className="w-full rounded-sm border border-rule bg-paper-light p-2.5 text-left transition-colors hover:border-alert"
            >
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
          ))
        )}
      </CardContent>
    </Card>
  );
}

/* ----------------------------------------------------------------- shared */

function Hint({ children }) {
  return <p className="text-xs leading-relaxed text-steel">{children}</p>;
}

function EmptyState({ onNewJob }) {
  return (
    <Card className="border-dashed">
      <CardContent className="flex flex-col items-center gap-3 px-6 py-16 text-center">
        <span className="grid size-10 place-items-center rounded-sm bg-emphasis">
          <Wallet className="size-5 text-on-emphasis" />
        </span>
        <h2 className="font-display text-xl">No jobs yet</h2>
        <p className="max-w-md text-xs leading-relaxed text-steel">
          Create a job, drop a plan into Takeoff to measure it, and set budgets. Cash, margin and
          risk start tracking here on their own from then on.
        </p>
        <Button variant="hivis" size="sm" className="mt-1" onClick={onNewJob}>
          <Plus className="size-3.5" /> New job
        </Button>
      </CardContent>
    </Card>
  );
}

export default Dashboard;
