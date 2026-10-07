"use client";
import Link from "next/link";
import { DigitalHealth, HealthTiles } from "@/components/DigitalHealth";
import { DebugPanel, Decisions, Discovery, DontTouch, OwnerCard, PlanV3 } from "@/components/V3";
import { num, stars } from "@/lib/reasons";
import { ReviewIntel } from "@/components/ReviewIntel";
import { WarRoom } from "@/components/WarRoom";
import { DemoBadge, Logo, QualityBadge } from "@/components/ui";
import { ScanProgress } from "@/components/ScanProgress";
import { useRadarResult } from "@/lib/useRadarResult";
import { LangSwitch, useLocale } from "@/i18n/client";

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

  const dq = r.dataQuality;
  const fp = r.target.foodProfile;
  const rep = r.targetReputation;
  const closeCount = r.competitors.filter((c) => c.threatLevel === "HIGH").length;
  const debug = typeof window !== "undefined" && new URLSearchParams(window.location.search).has("debug");
  const Q = ({ n, children }: { n: number; children: React.ReactNode }) => (
    <div className="mb-3"><p className="text-xs font-bold uppercase tracking-widest text-mist">{t("eyebrow", { n })}</p><h2 className="font-display text-2xl font-bold md:text-3xl">{children}</h2></div>
  );

  return (
    <main className="mx-auto max-w-6xl space-y-10 px-4 py-5 md:px-8 md:py-8">
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

      {/* 1. Where do I stand? */}
      <section aria-labelledby="q1">
        <p className="text-sm text-mist">{r.target.address}</p>
        <h1 id="q1" className="mt-1 font-display text-4xl font-extrabold leading-tight md:text-6xl">{r.target.name}</h1>
        <div className="mt-3 flex flex-wrap items-center gap-2 text-sm">
          {fp && fp.level !== "LOW"
            ? <span className="rounded-full bg-ink px-3 py-1 font-bold text-white">{t("cuisine." + fp.primary)}</span>
            : <span className="rounded-full border border-line px-3 py-1 text-mist">{t("profile.uncertain")}</span>}
          {fp && fp.level !== "LOW" && fp.modifiers.map((m) => <span key={m.key} className="rounded-full border border-line px-3 py-1">{t("mod." + m.key)}</span>)}
          {fp && fp.level !== "LOW" && <span className="text-xs text-mist">{t("profile.level." + fp.level)}</span>}
        </div>
        <div className="mt-5 grid gap-4 md:grid-cols-[1fr_1.4fr]">
          <div>
            <p className="font-display text-3xl font-extrabold">{t("stand.google", { r: stars(r.target.rating, locale), n: num(r.target.reviewCount, locale) })}</p>
            {rep && <p className="text-sm text-mist">{t("stand.adjusted", { a: num(rep.adjustedRating, locale), c: num(rep.marketAverage, locale) })}</p>}
            <dl className="mt-4 grid grid-cols-3 gap-4">
              <div><dd className="font-display text-3xl font-extrabold">{dq.restaurantsDetected}</dd><dt className="text-sm text-mist">{t("stand.local")}</dt></div>
              <div><dd className="font-display text-3xl font-extrabold">{r.competitors.length}</dd><dt className="text-sm text-mist">{t("stand.direct")}</dt></div>
              <div><dd className="font-display text-3xl font-extrabold">{closeCount}</dd><dt className="text-sm text-mist">{t("stand.close")}</dt></div>
            </dl>
          </div>
          <HealthTiles r={r} />
        </div>
      </section>

      <Discovery r={r} />
      <OwnerCard r={r} />

      {/* 2. Who should I worry about? */}
      <div><Q n={2}>{t("q2")}</Q><WarRoom r={r} /></div>
      {/* 3. What do my customers really think? */}
      <div><Q n={3}>{t("q3")}</Q><ReviewIntel r={r} /></div>
      {/* 4. Where am I invisible or weak online? */}
      <div><Q n={4}>{t("q4")}</Q><DigitalHealth r={r} /></div>
      {/* 5. What should I test next? */}
      <div>
        <Q n={5}>{t("q5")}</Q>
        <Decisions r={r} />
        <h3 className="mt-6 font-display text-xl font-bold">{t("planv3.title")}</h3>
        <p className="mb-3 text-sm text-mist">{t("planv3.sub")}</p>
        <PlanV3 r={r} />
      </div>
      {/* 6. What should I NOT touch? */}
      <div><Q n={6}>{t("q6")}</Q><DontTouch r={r} /></div>

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
      {debug && <DebugPanel r={r} />}
    </main>
  );
}
