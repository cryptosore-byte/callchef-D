"use client";
import { forwardRef } from "react";
import { useLocale } from "@/i18n/client";
import type { RadarResult } from "@/types";
import { NONE } from "@/services/BusinessDecisionService";
import { evidenceText } from "@/lib/evidence";

const isNone = (c?: string) => !c || Object.values(NONE).includes(c);

/** Share report V3: readable in under 10 seconds. Leads with takeaways, not with a score. */
export const ShareCard = forwardRef<HTMLDivElement, { r: RadarResult }>(function ShareCard({ r }, ref) {
  const { t } = useLocale();
  const d = r.decisions;
  const threat = r.competitors.find((c) => c.restaurant.id === r.roles?.topThreatId);
  const strength = !isNone(d.dontTouch?.choice) ? t("dopt." + d.dontTouch!.choice) : t("common.unavailable");
  const gap = !isNone(d.focus10h?.choice) ? t("dopt." + d.focus10h!.choice) : t("common.unavailable");
  const rows: [string, string, string][] = [
    ["01", t("share.strength"), strength],
    ["02", t("share.gap"), gap],
    ["03", t("share.watch"), threat?.restaurant.name ?? t("common.unavailable")],
  ];
  const test = d.bestTest && !isNone(d.bestTest.choice) ? d.bestTest : undefined;
  const why = (r.evidence ?? []).filter((e) => test?.supportingEvidenceIds.includes(e.id)).slice(0, 3);
  return (
    <div ref={ref} className="w-full max-w-[560px] overflow-hidden rounded-3xl bg-ink p-7 text-white md:p-9">
      <div className="flex items-center justify-between">
        <span className="font-display text-sm font-extrabold uppercase tracking-widest">Restaurant Radar</span>
        {r.demo && <span className="rounded-full border border-saffron/60 px-2.5 py-0.5 text-xs font-bold text-saffron">{t("common.demoData")}</span>}
      </div>
      <h1 className="mt-5 font-display text-3xl font-extrabold uppercase leading-tight">{r.target.name}</h1>
      <p className="text-sm text-white/60">{r.input.address}</p>
      <p className="mt-6 text-xs font-bold uppercase tracking-widest text-white/60">{t("share.three")}</p>
      <ol className="mt-2 divide-y divide-white/15 border-y border-white/15">
        {rows.map(([n, k, v]) => (
          <li key={n} className="flex items-baseline gap-4 py-3">
            <span className="font-display text-2xl font-extrabold text-saffron">{n}</span>
            <div><p className="text-xs text-white/60">{k}</p><p className="font-display text-xl font-bold leading-snug">{v}</p></div>
          </li>
        ))}
      </ol>
      <div className="mt-6 rounded-2xl bg-white p-5 text-ink">
        <p className="text-xs font-bold uppercase tracking-widest text-mist">{t("share.test")}</p>
        <p className="font-display text-2xl font-extrabold leading-tight">{test ? t("dopt." + test.choice) : t("planv3.test.none")}</p>
        {why.length > 0 && <>
          <p className="mt-3 text-xs font-bold uppercase tracking-widest text-mist">{t("share.why")}</p>
          <ul className="mt-1 space-y-1 text-sm">{why.map((e) => <li key={e.id}>• {evidenceText(t, e)}</li>)}</ul>
        </>}
      </div>
      <p className="mt-6 text-xs text-white/50">{t("share.footer")}</p>
    </div>
  );
});
