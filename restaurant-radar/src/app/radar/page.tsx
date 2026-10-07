"use client";
import Link from "next/link";
import { DecisionPanel } from "@/components/DecisionPanel";
import { DigitalHealth } from "@/components/DigitalHealth";
import { Plan } from "@/components/Plan";
import { RadarChart } from "@/components/RadarChart";
import { ReviewIntel } from "@/components/ReviewIntel";
import { WarRoom } from "@/components/WarRoom";
import { DemoBadge, Logo, QualityBadge } from "@/components/ui";
import { ScanProgress } from "@/components/ScanProgress";
import { useRadarResult } from "@/lib/useRadarResult";
import { LangSwitch, useLocale } from "@/i18n/client";
import { priceSigns } from "@/lib/labels";

export default function RadarPage() {
  const { result: r, job, startedAt, error } = useRadarResult();
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

  const directThreats = r.competitors.filter((c) => c.competitorProbability >= 0.8 && c.threatScore >= 60).length;
  const dq = r.dataQuality;

  return (
    <main className="mx-auto max-w-6xl space-y-10 px-4 py-5 md:px-8 md:py-8">
      <header className="flex flex-wrap items-center justify-between gap-3">
        <Link href="/"><Logo /></Link>
        <div className="flex items-center gap-3">
          {r.demo && <DemoBadge />}
          <LangSwitch />
          <Link href="/" className="text-sm font-bold underline">{t("common.newScan")}</Link>
          <Link href="/report" className="rounded-lg bg-ink px-3.5 py-2 text-sm font-bold text-white">{t("common.createReport")}</Link>
        </div>
      </header>

      {r.warnings.length > 0 && (
        <div role="status" className="space-y-1 rounded-xl border border-saffron/40 bg-saffron/10 p-3 text-sm text-saffron">{r.warnings.map((w) => <p key={w}>{w}</p>)}</div>
      )}

      <section className="grid items-center gap-6 md:grid-cols-[1.2fr_1fr]">
        <div>
          <p className="text-sm text-mist">{r.target.address}, {priceSigns(r.target.priceLevel)}, {t("radar.rated", { r: r.target.rating, n: r.target.reviewCount })}</p>
          <h1 className="mt-1 font-display text-4xl font-extrabold leading-tight md:text-6xl">{r.target.name}</h1>
          <dl className="mt-6 grid grid-cols-3 gap-4 md:max-w-md">
            <div><dd className="font-display text-3xl font-extrabold">{dq.restaurantsDetected}</dd><dt className="text-sm text-mist">{t("radar.local")}</dt></div>
            <div><dd className="font-display text-3xl font-extrabold">{r.competitors.length}</dd><dt className="text-sm text-mist">{t("radar.competitors")}</dt></div>
            <div><dd className="font-display text-3xl font-extrabold">{directThreats}</dd><dt className="text-sm text-mist">{t("radar.threats")}</dt></div>
          </dl>
          <div className="mt-6 flex items-end gap-3">
            <span className="font-display text-7xl font-extrabold leading-none md:text-8xl">{r.radarScore.total}</span>
            <span className="pb-2 text-mist">{t("radar.scoreOf")}</span>
          </div>
        </div>
        <div className="flex justify-center"><RadarChart score={r.radarScore} /></div>
      </section>

      <DecisionPanel r={r} />
      <ReviewIntel r={r} />
      <WarRoom r={r} />
      <DigitalHealth r={r} />

      <section aria-labelledby="plan">
        <h2 id="plan" className="font-display text-2xl font-bold md:text-3xl">{t("radar.planTitle")}</h2>
        <p className="mb-3 text-sm text-mist">{t("radar.planSub")}</p>
        <Plan plan={r.plan} />
      </section>

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
      </section>
    </main>
  );
}
