"use client";
import Link from "next/link";
import { DigitalHealth, HealthTiles } from "@/components/DigitalHealth";
import { DebugPanel, Decisions, DontTouch } from "@/components/V3";
import { Changes, CostPanel, CustomerInsights, DeepDive, MenuInsightsView, MonthlyReportView, NextMove, Timeline } from "@/components/Owner";
import { Action, Competition, Reputation, Social, Visibility } from "@/components/report/Chapters";
import { ChapterNav, Hero } from "@/components/report/Hero";
import { WarRoom } from "@/components/WarRoom";
import { DemoBadge, Logo, QualityBadge } from "@/components/ui";
import { ScanProgress } from "@/components/ScanProgress";
import { useRadarResult } from "@/lib/useRadarResult";
import { LangSwitch, useLocale } from "@/i18n/client";

export default function RadarPage() {
  const { result: r, job, startedAt, error, rerun } = useRadarResult();
  const { t, locale } = useLocale();

  if (error) return <main className="p-8"><p role="alert" className="font-semibold text-chili">{error === "network" ? t("home.errNetwork") : error}</p><Link href="/" className="underline">{t("radar.startAgain")}</Link></main>;
  if (!r && startedAt) return (
    <main className="mx-auto max-w-6xl space-y-8 px-4 py-5 md:px-8 md:py-8">
      <header className="flex flex-wrap items-center justify-between gap-3">
        <Link href="/"><Logo /></Link>
        <div className="flex items-center gap-3">{job?.partial.demo && <DemoBadge />}<LangSwitch /></div>
      </header>
      <ScanProgress job={job} startedAt={startedAt} />
    </main>
  );
  if (!r) return <main className="p-8 text-mist">{t("radar.loading")}</main>;

  const dq = r.dataQuality;
  const debug = typeof window !== "undefined" && new URLSearchParams(window.location.search).has("debug");
  const rid = r.continuous?.restaurantId;
  const call = async (path: string, method: string, body: unknown) => {
    if (!rid) return;
    const res = await fetch(`/api/restaurants/${encodeURIComponent(rid)}/${path}`, { method, headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
    if (!res.ok) { const d = await res.json().catch(() => ({})); alert(t("owner.err." + (d.code ?? "error"))); return; }
    await rerun("cache"); // rebuild from stored data: no provider call
  };
  const actions = {
    onLog: (id: string, value: number) => call("experiments", "PATCH", { experimentId: id, value }),
    onStop: (id: string) => call("experiments", "PATCH", { experimentId: id, action: "stop" }),
    onSaveFinancials: (f: Record<string, number>) => call("financials", "PUT", f),
  };

  return (
    <main className="mx-auto max-w-6xl space-y-12 px-4 py-5 md:px-8 md:py-8">
      <header className="flex flex-wrap items-center justify-between gap-3">
        <Link href="/"><Logo /></Link>
        <div className="flex flex-wrap items-center gap-2 sm:gap-3">
          {r.demo && <DemoBadge />}
          <LangSwitch />
          <Link href="/" className="text-sm font-bold underline">{t("common.newScan")}</Link>
          <Link href="/report" className="rounded-lg bg-ink px-3.5 py-2 text-sm font-bold text-white">{t("common.createReport")}</Link>
        </div>
      </header>

      {r.warnings.length > 0 && (
        <div role="status" className="space-y-1 rounded-xl border border-saffron/40 bg-saffron/10 p-3 text-sm text-saffron">{r.warnings.map((w) => <p key={w}>{w}</p>)}</div>
      )}

      <Hero r={r} />
      <ChapterNav />
      {(r.continuous?.changes.length ?? 0) > 0 && <Changes r={r} />}

      {/* The report: 5 chapters, one sentence + charts each */}
      <Competition r={r} />
      <Reputation r={r} />
      <Visibility r={r} />
      <Social r={r} />
      <Action r={r} onStart={(type) => call("experiments", "POST", { type })} />

      {/* Follow-up and everything else: progressive disclosure */}
      <details className="rounded-[20px] bg-paper p-5 shadow-[0_1px_0_#CBD2CC]">
        <summary className="cursor-pointer font-display text-lg font-bold">{t("rp.more")}</summary>
        <div className="mt-6 space-y-10">
          <NextMove r={r} actions={actions} />
          <WarRoom r={r} />
          <CustomerInsights r={r} />
          <MonthlyReportView r={r} />
          <Timeline r={r} />
          <div><h3 className="mb-2 font-display text-lg font-bold">{t("q5")}</h3><Decisions r={r} /></div>
          <div><h3 className="mb-2 font-display text-lg font-bold">{t("q6")}</h3><DontTouch r={r} /></div>
          <div><h3 className="mb-2 font-display text-lg font-bold">{t("health.title")}</h3><HealthTiles r={r} /><div className="mt-3"><DigitalHealth r={r} /></div></div>
          <MenuInsightsView r={r} />
          <DeepDive onRun={(area) => rerun("deep", area)} />
        </div>
      </details>

      <section aria-labelledby="dq" className="rounded-2xl border border-line bg-paper p-5">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h2 id="dq" className="font-display text-xl font-bold">{t("dq.title")}</h2>
          <QualityBadge level={dq.level} />
        </div>
        <p className="mt-2 text-sm">{t("dq.summary", { r: dq.reviewsAnalyzed, c: dq.competitorsAnalyzed, d: new Date(dq.refreshedAt).toLocaleString(locale) })}</p>
        <ul className="mt-2 list-disc space-y-1 pl-5 text-sm text-mist">{dq.notes.map((n) => <li key={n}>{n}</li>)}</ul>
        <p className="mt-2 text-sm text-mist">{t("dq.source", { s: r.sources.map((s) => s.provider === "demo" ? t("dq.demoSource") : `${s.provider}${s.attribution ? `, ${s.attribution}` : ""}`).join("; ") })}</p>
        <details className="mt-3 text-sm">
          <summary className="cursor-pointer font-semibold">{t("dq.how")}</summary>
          <ul className="mt-2 space-y-1.5">
            {r.radarScore.dimensions.map((d) => <li key={d.key}><b>{d.label} ({d.score}).</b> <span className="text-mist">{d.formula}{d.lowEvidence ? " " + t("dq.lowEvidence") : ""}</span></li>)}
            <li><b>{t("dq.total")} ({r.radarScore.total}).</b> <span className="text-mist">{t("formula.total")} {t("dq.byCode")}</span></li>
          </ul>
        </details>
        <p className="mt-2 text-xs text-mist">{t("dq.debugHint")}</p>
      </section>
      {debug && <div className="text-xs"><DebugPanel r={r} /><CostPanel r={r} /></div>}
    </main>
  );
}
