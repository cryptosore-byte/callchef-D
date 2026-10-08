"use client";
import { useEffect, useState } from "react";
import type { JobView } from "@/lib/jobs";
import { STAGES, type Stage } from "@/lib/stages";
import { km } from "@/lib/labels";
import { stars } from "@/lib/reasons";
import { useLocale } from "@/i18n/client";

const STAGE_LABEL: Record<Stage, string> = {
  find: "home.stage1", nearby: "home.stage2", competitors: "home.stage4", reviews: "home.stage3", decisions: "home.stage5",
};

/** Live scan: real progress, then competitors as soon as they are confirmed, while reviews are still being read. */
export function ScanProgress({ job, startedAt }: { job: JobView | null; startedAt: number | null }) {
  const { t, locale } = useLocale();
  const [now, setNow] = useState(Date.now());
  useEffect(() => { const i = setInterval(() => setNow(Date.now()), 1000); return () => clearInterval(i); }, []);
  const idx = job?.stageIndex ?? 0;
  const p = job?.partial;
  const elapsed = startedAt ? Math.max(0, Math.round((now - startedAt) / 1000)) : 0;

  return (
    <div className="space-y-8">
      <section aria-live="polite" className="rounded-2xl border border-line bg-paper p-5">
        <div className="flex flex-wrap items-baseline justify-between gap-2">
          <p className="font-display text-xl font-bold">{t("home.running")}</p>
          <p className="text-sm tabular-nums text-mist">{t("scan.elapsed", { s: elapsed })}</p>
        </div>
        <div className="mt-3 h-1.5 w-full rounded-full bg-line/70" role="progressbar" aria-valuemin={0} aria-valuemax={STAGES.length} aria-valuenow={idx}>
          <div className="h-1.5 rounded-full bg-fennel transition-all duration-700" style={{ width: `${Math.max(4, (idx / STAGES.length) * 100)}%` }} />
        </div>
        <ol className="mt-4 grid gap-2 sm:grid-cols-5">
          {STAGES.map((s, i) => (
            <li key={s} className={`flex items-center gap-2 text-sm ${i <= idx ? "text-ink" : "text-mist/60"}`}>
              <span className={`h-2.5 w-2.5 shrink-0 rounded-full ${i < idx ? "bg-fennel" : i === idx ? "animate-pulse bg-saffron" : "bg-line"}`} />
              {t(STAGE_LABEL[s])}
            </li>
          ))}
        </ol>
      </section>

      {p?.target && (
        <section className="rise">
          <p className="text-sm text-mist">{p.target.address}, {t("radar.rated", { r: p.target.rating, n: p.target.reviewCount })}</p>
          <h1 className="mt-1 font-display text-4xl font-extrabold leading-tight md:text-6xl">{p.target.name}</h1>
          {p.nearbyCount !== undefined && <p className="mt-2 text-sm text-mist">{t("scan.nearby", { n: p.nearbyCount })}</p>}
        </section>
      )}

      {p?.competitors && (
        <section aria-labelledby="scan-comp" className="rise">
          <h2 id="scan-comp" className="font-display text-2xl font-bold md:text-3xl">{t("cc.title")}</h2>
          {p.competitors.length === 0 ? (
            <p className="mt-4 rounded-xl border border-line bg-paper p-5">{t("warn.noCompetitors")}</p>
          ) : (
            <ul className="mt-4 grid gap-3 md:grid-cols-2">
              {p.competitors.map((c) => (
                <li key={c.restaurant.id} className="rounded-2xl border border-line bg-paper p-4">
                  <p className="font-display text-xl font-extrabold">{c.restaurant.name}</p>
                  <p className="text-sm text-mist">{c.restaurant.foodProfile && c.restaurant.foodProfile.level !== "LOW" ? t("cuisine." + c.restaurant.foodProfile.primary) : t.opt(c.restaurant.primaryFoodType)}, {t("war.away", { d: km(c.distanceM, locale) })}</p>
                  <p className="mt-2 text-sm"><b>{stars(c.restaurant.rating, locale)} ★</b> <span className="text-mist">{t("cc.reviews", { n: c.restaurant.reviewCount })}</span></p>
                  <div className="mt-2 flex flex-wrap gap-1.5 text-xs font-bold">
                    <span className="rounded-full bg-line px-2.5 py-0.5">{t("cc.threat." + c.threatLevel)}</span>
                    <span className="rounded-full border border-line px-2.5 py-0.5">{t("cc.bench." + c.benchmarkLevel)}</span>
                  </div>
                </li>
              ))}
            </ul>
          )}
          <p className="mt-4 flex items-center gap-2 text-sm text-mist">
            <span className="h-2 w-2 animate-pulse rounded-full bg-saffron" />{t("scan.reviewsPending")}
          </p>
        </section>
      )}
    </div>
  );
}
