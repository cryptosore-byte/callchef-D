"use client";
import { forwardRef } from "react";
import { useT } from "@/i18n/client";
import type { RadarResult } from "@/types";
import { pct } from "@/lib/util";

export const ShareCard = forwardRef<HTMLDivElement, { r: RadarResult }>(function ShareCard({ r }, ref) {
  const t = useT();
  const d = r.decisions;
  const na = d.nextAction;
  const move = !na || na.tier === "INSUFFICIENT" || na.choice === "NO_ACTION" ? t("plan.fix.none") : t.opt(na.choice);
  const rows: [string, string][] = [
    [t("decision.threat"), d.biggestThreat?.choice ?? t("common.unavailable")],
    [t("decision.advantage"), d.advantage ? t.opt(d.advantage.choice) : t("common.unavailable")],
    [t("decision.weakness"), d.weakness ? t.opt(d.weakness.choice) : t("common.unavailable")],
  ];
  return (
    <div ref={ref} className="w-full max-w-[560px] overflow-hidden rounded-3xl bg-ink p-7 text-white md:p-9">
      <div className="flex items-center justify-between">
        <span className="font-display text-lg font-extrabold">Restaurant Radar</span>
        {r.demo && <span className="rounded-full border border-saffron/60 px-2.5 py-0.5 text-xs font-bold text-saffron">{t("common.demoData")}</span>}
      </div>
      <p className="mt-6 text-sm text-white/60">{t("share.reportFor")}</p>
      <h1 className="font-display text-4xl font-extrabold leading-tight">{r.target.name}</h1>
      <div className="mt-6 flex items-end gap-3">
        <span className="font-display text-7xl font-extrabold leading-none">{r.radarScore.total}</span>
        <span className="pb-2 text-white/60">{t("radar.scoreOf")}</span>
      </div>
      <dl className="mt-6 divide-y divide-white/15 border-y border-white/15">
        {rows.map(([k, v]) => (
          <div key={k} className="flex items-baseline justify-between gap-4 py-3"><dt className="text-sm text-white/60">{k}</dt><dd className="text-right font-display text-xl font-bold">{v}</dd></div>
        ))}
      </dl>
      <div className="mt-6 rounded-2xl bg-white p-5 text-ink">
        <p className="text-sm text-mist">{t("share.nextMove")}</p>
        <p className="font-display text-2xl font-extrabold leading-tight">{move}</p>
        {na && move !== t("plan.fix.none") && <p className="mt-1 text-sm text-mist">{t("share.conf", { p: pct(na.confidence), n: r.dataQuality.reviewsAnalyzed })}</p>}
      </div>
      <p className="mt-6 text-xs text-white/50">{t("share.footer")}</p>
    </div>
  );
});
