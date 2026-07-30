/* =========================================================================
   The Manage dashboard.

   Built to answer the four questions a builder actually opens software for,
   in the order they matter:

     1. Am I owed money?          → unclaimed, given the dominant tile
     2. Is a job losing money?    → at-risk trades, with how far over
     3. What is happening now?    → active jobs, contract vs committed vs claimed
     4. What is coming?           → pipeline by stage

   The old version gave all four equal weight in a flat row of tiles, which
   is why it read as unfinished — four identical boxes tell you nothing about
   what to look at first. Everything here is Tailwind over the same design
   tokens, so it follows the light/dark switch with no extra work.
   ========================================================================= */

import React, { useMemo } from "react";
import {
  Bar, BarChart, Cell, ResponsiveContainer, Tooltip, XAxis, YAxis,
} from "recharts";
import {
  AlertTriangle, ArrowRight, Building2, HardHat, Receipt, TrendingUp, Wallet,
} from "lucide-react";

import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { Separator } from "@/components/ui/separator";
import { useResolvedTokens } from "@/design/theme.js";
import { fmt, currencySymbol } from "@/lib/format.js";
import * as CM from "@/state/cm.js";

export function Dashboard({ onOpenJob, onSeeAll }) {
  const T = useResolvedTokens();
  const cur = currencySymbol("AU");

  const { pipeline, active, atRisk, jobRows, totals } = useMemo(() => {
    const p = CM.pipelineSummary();
    const jobs = CM.listJobs();
    const act = jobs.filter((j) => ["in_progress", "practical_completion"].includes(j.status));

    const risk = [];
    const rows = [];
    let committed = 0;
    let margin = 0;

    for (const j of act) {
      const f = CM.jobFinancials(j.id);
      committed += f.totalForecast;
      margin += f.grossMargin;
      rows.push({
        id: j.id,
        jobNo: j.jobNo,
        name: j.name,
        contract: f.contractSum,
        committed: f.totalForecast,
        claimed: f.claimed,
        unclaimed: f.unclaimed,
        marginPct: f.grossMarginPct,
        atRisk: f.atRiskCount,
      });
      for (const r of f.rows.filter((x) => x.atRisk)) risk.push({ job: j, row: r });
    }

    // Worst overrun first — the point of the panel is triage, not a list.
    risk.sort((a, b) => a.row.variance - b.row.variance);
    rows.sort((a, b) => b.unclaimed - a.unclaimed);

    return {
      pipeline: p,
      active: act,
      atRisk: risk,
      jobRows: rows,
      totals: { committed, margin },
    };
  }, []);

  const hasAnything = pipeline.totalJobs > 0;

  return (
    <div className="space-y-5">
      <header className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="font-display text-3xl leading-none">Dashboard</h1>
          <p className="mt-1.5 font-mono text-[11px] tracking-wide text-steel">
            Where the business is right now
          </p>
        </div>
        {hasAnything && (
          <Button variant="outline" size="sm" onClick={onSeeAll}>
            All jobs <ArrowRight className="size-3.5" />
          </Button>
        )}
      </header>

      {!hasAnything ? (
        <EmptyState onSeeAll={onSeeAll} />
      ) : (
        <>
          {/* Money row. Unclaimed gets double width and the accent, because
              it is the number that decides whether payroll clears. */}
          <section className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
            <HeroMetric
              className="xl:col-span-2"
              icon={Receipt}
              label="Unclaimed"
              value={`${cur}${fmt(pipeline.unclaimedTotal)}`}
              caption="Work earned on site but not yet invoiced"
              tone={pipeline.unclaimedTotal > 0 ? "accent" : "flat"}
            />
            <Metric
              icon={Building2}
              label="Contracted"
              value={`${cur}${fmt(pipeline.contractedValue)}`}
              caption="Won and under way"
            />
            <Metric
              icon={TrendingUp}
              label="Pipeline"
              value={`${cur}${fmt(pipeline.pipelineValue)}`}
              caption="Leads, estimating, quoted"
            />
          </section>

          <section className="grid gap-3 lg:grid-cols-[1.6fr_1fr]">
            <JobFinancialsChart rows={jobRows} cur={cur} T={T} onOpenJob={onOpenJob} />
            <PipelineFunnel pipeline={pipeline} cur={cur} />
          </section>

          <section className="grid gap-3 lg:grid-cols-2">
            <AtRiskPanel atRisk={atRisk} cur={cur} onOpenJob={onOpenJob} />
            <ActiveJobsPanel rows={jobRows} active={active} cur={cur} onOpenJob={onOpenJob} />
          </section>
        </>
      )}
    </div>
  );
}

/* ---------------------------------------------------------------- metrics */

function HeroMetric({ icon: Icon, label, value, caption, tone = "flat", className }) {
  const accent = tone === "accent";
  return (
    <Card
      className={[
        className,
        "relative overflow-hidden",
        accent ? "border-hivis-deep bg-emphasis" : "",
      ].join(" ")}
    >
      <CardContent className="p-5">
        <div className="flex items-center gap-2">
          <Icon className={accent ? "size-4 text-on-emphasis" : "size-4 text-steel"} />
          <span
            className={[
              "font-mono text-[10px] font-bold uppercase tracking-[0.14em]",
              accent ? "text-on-emphasis-soft" : "text-steel",
            ].join(" ")}
          >
            {label}
          </span>
        </div>
        <div
          className={[
            "mt-2 font-mono text-4xl font-bold leading-none tabular-nums",
            accent ? "text-on-emphasis" : "text-ink",
          ].join(" ")}
        >
          {value}
        </div>
        <p
          className={[
            "mt-2 text-xs leading-relaxed",
            accent ? "text-on-emphasis-soft" : "text-steel",
          ].join(" ")}
        >
          {caption}
        </p>
      </CardContent>
    </Card>
  );
}

function Metric({ icon: Icon, label, value, caption }) {
  return (
    <Card>
      <CardContent className="p-5">
        <div className="flex items-center gap-2">
          <Icon className="size-4 text-steel" />
          <span className="font-mono text-[10px] font-bold uppercase tracking-[0.14em] text-steel">
            {label}
          </span>
        </div>
        <div className="mt-2 font-mono text-2xl font-bold leading-none tabular-nums text-ink">
          {value}
        </div>
        <p className="mt-2 text-xs leading-relaxed text-steel">{caption}</p>
      </CardContent>
    </Card>
  );
}

/* ------------------------------------------------------------------ chart */

function JobFinancialsChart({ rows, cur, T, onOpenJob }) {
  if (!rows.length) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>Money on site</CardTitle>
          <CardDescription>Contract, committed cost and claimed, per active job.</CardDescription>
        </CardHeader>
        <CardContent>
          <Hint>No jobs on site yet. Move a won job to “On site” and it appears here.</Hint>
        </CardContent>
      </Card>
    );
  }

  const data = rows.slice(0, 6).map((r) => ({
    name: r.jobNo,
    full: r.name,
    Contract: Math.round(r.contract),
    Committed: Math.round(r.committed),
    Claimed: Math.round(r.claimed),
    id: r.id,
  }));

  const money = (n) => `${cur}${fmt(n)}`;

  return (
    <Card>
      <CardHeader>
        <CardTitle>Money on site</CardTitle>
        <CardDescription>
          Contract sum against committed cost and what has been claimed. A committed bar
          approaching the contract bar is a job with no margin left.
        </CardDescription>
      </CardHeader>
      <CardContent className="pt-1">
        <div className="h-[240px] w-full">
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={data} layout="vertical" margin={{ top: 4, right: 12, bottom: 4, left: 4 }} barGap={2}>
              <XAxis type="number" hide />
              <YAxis
                type="category"
                dataKey="name"
                width={62}
                axisLine={false}
                tickLine={false}
                tick={{ fill: T.steel, fontSize: 10, fontFamily: "JetBrains Mono, monospace" }}
              />
              <Tooltip
                cursor={{ fill: T.paperLight }}
                formatter={(v, k) => [money(v), k]}
                labelFormatter={(l) => data.find((d) => d.name === l)?.full || l}
                contentStyle={{
                  background: T.card,
                  border: `1px solid ${T.rule}`,
                  borderRadius: 2,
                  fontSize: 11,
                  color: T.ink,
                }}
                itemStyle={{ color: T.ink }}
                labelStyle={{ color: T.steel, fontSize: 10, marginBottom: 4 }}
              />
              <Bar dataKey="Contract" fill={T.rule} radius={[0, 2, 2, 0]} barSize={9}
                   onClick={(d) => onOpenJob?.(d.id)} cursor="pointer" />
              <Bar dataKey="Committed" radius={[0, 2, 2, 0]} barSize={9}
                   onClick={(d) => onOpenJob?.(d.id)} cursor="pointer">
                {data.map((d) => (
                  // Red once committed cost has passed the contract sum — the
                  // moment the job stops making money.
                  <Cell key={d.id} fill={d.Committed > d.Contract ? T.alert : T.inkSoft} />
                ))}
              </Bar>
              <Bar dataKey="Claimed" fill={T.hivisDeep} radius={[0, 2, 2, 0]} barSize={9}
                   onClick={(d) => onOpenJob?.(d.id)} cursor="pointer" />
            </BarChart>
          </ResponsiveContainer>
        </div>
        <Legend items={[
          { color: T.rule, label: "Contract" },
          { color: T.inkSoft, label: "Committed" },
          { color: T.hivisDeep, label: "Claimed" },
        ]} />
      </CardContent>
    </Card>
  );
}

function Legend({ items }) {
  return (
    <div className="mt-3 flex flex-wrap items-center gap-4 border-t border-rule pt-3">
      {items.map((i) => (
        <span key={i.label} className="flex items-center gap-1.5">
          <span className="size-2.5 rounded-[1px]" style={{ background: i.color }} />
          <span className="font-mono text-[10px] uppercase tracking-wider text-steel">{i.label}</span>
        </span>
      ))}
    </div>
  );
}

/* --------------------------------------------------------------- pipeline */

function PipelineFunnel({ pipeline, cur }) {
  const stages = CM.JOB_STATUS.filter((s) => s.group !== "done");
  const max = Math.max(1, ...stages.map((s) => pipeline.byStatus[s.id]?.count || 0));

  return (
    <Card>
      <CardHeader>
        <CardTitle>Pipeline</CardTitle>
        <CardDescription>Every job by stage, enquiry through to practical completion.</CardDescription>
      </CardHeader>
      <CardContent className="space-y-2.5 pt-1">
        {stages.map((s) => {
          const bucket = pipeline.byStatus[s.id] || { count: 0, value: 0 };
          const share = (bucket.count / max) * 100;
          const live = s.group === "active";
          return (
            <div key={s.id} title={s.hint}>
              <div className="flex items-baseline justify-between gap-2">
                <span className="font-mono text-[10px] font-bold uppercase tracking-[0.1em] text-ink-soft">
                  {s.label}
                </span>
                <span className="font-mono text-[11px] tabular-nums text-steel">
                  {bucket.count} · {cur}{fmt(bucket.value)}
                </span>
              </div>
              <div className="mt-1 h-1.5 w-full overflow-hidden rounded-sm bg-paper-light">
                <div
                  className={live ? "h-full bg-hivis-deep" : "h-full bg-steel"}
                  style={{ width: `${Math.max(bucket.count ? 4 : 0, share)}%` }}
                />
              </div>
            </div>
          );
        })}
      </CardContent>
    </Card>
  );
}

/* ---------------------------------------------------------------- at risk */

function AtRiskPanel({ atRisk, cur, onOpenJob }) {
  return (
    <Card className={atRisk.length ? "border-alert" : undefined}>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          {atRisk.length > 0 && <AlertTriangle className="size-4 text-alert" />}
          Trades over budget
        </CardTitle>
        <CardDescription>
          {atRisk.length
            ? "Committed cost has passed the allowance. These are still fixable today."
            : "Nothing committed beyond its allowance."}
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-2.5 pt-1">
        {!atRisk.length ? (
          <Hint>Every trade is inside its budget. This panel fills in once a purchase order or approved variation pushes one over.</Hint>
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
                  {cur}{fmt(Math.abs(row.variance))} over
                </span>
              </div>
              <div className="mt-1.5 flex items-center gap-2">
                <Progress value={row.percentUsed === Infinity ? 100 : row.percentUsed} className="flex-1" />
                <span className="font-mono text-[10px] tabular-nums text-steel">
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

/* ----------------------------------------------------------- active jobs */

function ActiveJobsPanel({ rows, active, cur, onOpenJob }) {
  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <HardHat className="size-4 text-steel" />
          On site
        </CardTitle>
        <CardDescription>
          {active.length
            ? "Sorted by what you are owed."
            : "No jobs are on site."}
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-2 pt-1">
        {!rows.length ? (
          <Hint>Move a won job to “On site” to start tracking cost against it.</Hint>
        ) : (
          rows.slice(0, 5).map((r) => {
            const claimedPct = r.contract > 0 ? (r.claimed / r.contract) * 100 : 0;
            const thin = r.marginPct < 8;
            return (
              <button
                key={r.id}
                onClick={() => onOpenJob?.(r.id)}
                className="w-full rounded-sm border border-rule bg-paper-light p-2.5 text-left transition-colors hover:border-ink"
              >
                <div className="flex items-baseline justify-between gap-3">
                  <span className="truncate text-xs font-medium text-ink">{r.name}</span>
                  <Badge variant={thin ? "alert" : "outline"}>
                    {r.marginPct.toFixed(0)}% margin
                  </Badge>
                </div>
                <div className="mt-1.5 flex items-center gap-2">
                  <Progress value={claimedPct} barClassName="bg-hivis-deep" className="flex-1" />
                  <span className="shrink-0 font-mono text-[10px] tabular-nums text-steel">
                    {Math.round(claimedPct)}% claimed
                  </span>
                </div>
                <div className="mt-1 flex items-center gap-1.5 font-mono text-[9px] uppercase tracking-wider text-steel">
                  <span>{r.jobNo}</span>
                  <Separator orientation="vertical" className="h-2.5" />
                  <span>{cur}{fmt(r.unclaimed)} unclaimed</span>
                </div>
              </button>
            );
          })
        )}
      </CardContent>
    </Card>
  );
}

/* ---------------------------------------------------------------- shared */

function Hint({ children }) {
  return <p className="text-xs leading-relaxed text-steel">{children}</p>;
}

function EmptyState({ onSeeAll }) {
  return (
    <Card className="border-dashed">
      <CardContent className="flex flex-col items-center gap-3 px-6 py-14 text-center">
        <Wallet className="size-7 text-steel" />
        <h2 className="font-display text-xl">Nothing to show yet</h2>
        <p className="max-w-md text-xs leading-relaxed text-steel">
          This fills in as soon as you have a job. Create one, drop a plan into Takeoff to
          measure it, set budgets, and the cash and risk numbers here start tracking on their own.
        </p>
        <Button variant="hivis" size="sm" onClick={onSeeAll} className="mt-1">
          Go to jobs <ArrowRight className="size-3.5" />
        </Button>
      </CardContent>
    </Card>
  );
}

export default Dashboard;
