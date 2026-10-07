"use client";
import { useEffect, useRef, useState } from "react";
import type { BattleVerdict, Competitor, RadarResult, Reason } from "@/types";
import { km } from "@/lib/labels";
import { reasonText, stars } from "@/lib/reasons";
import { useT, useLocale } from "@/i18n/client";
import { pct } from "@/lib/util";
import { Plan } from "./Plan";
import { TierBadge } from "./ui";

const VERDICT_CLS: Record<BattleVerdict, string> = {
  YOU_WIN: "bg-fennel text-white",
  COMPETITOR_WINS: "bg-chili text-white",
  TOO_CLOSE: "bg-line text-ink",
};

function BattleMode({ r, c, onClose }: { r: RadarResult; c: Competitor; onClose: () => void }) {
  const t = useT();
  const b = r.battles[c.restaurant.id];
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    ref.current?.focus();
    const esc = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", esc);
    document.body.style.overflow = "hidden";
    return () => { window.removeEventListener("keydown", esc); document.body.style.overflow = ""; };
  }, [onClose]);
  if (!b) return null;
  return (
    <div className="fixed inset-0 z-50 overflow-y-auto bg-ink/60 p-3 md:p-8" onClick={onClose}>
      <div ref={ref} tabIndex={-1} role="dialog" aria-modal="true" aria-label={t("battle.aria", { a: r.target.name, b: b.competitorName })}
        onClick={(e) => e.stopPropagation()} className="mx-auto max-w-3xl rounded-2xl bg-linen p-5 outline-none md:p-8">
        <div className="flex items-start justify-between gap-3">
          <div>
            <p className="text-sm text-mist">{t("battle.title")}</p>
            <h3 className="font-display text-2xl font-extrabold md:text-3xl">{r.target.name} <span className="text-mist">{t("battle.vs")}</span> {b.competitorName}</h3>
          </div>
          <button onClick={onClose} className="rounded-lg border border-line bg-paper px-3 py-1.5 text-sm font-bold">{t("common.close")}</button>
        </div>

        <p className="mt-3 text-sm text-mist">
          {t("battle.summary", { w: b.verdictCounts.YOU_WIN, c: b.verdictCounts.TOO_CLOSE, l: b.verdictCounts.COMPETITOR_WINS })}
        </p>

        <ul className="mt-4 space-y-2">
          {b.dimensions.map((d) => (
            <li key={d.key} className="rounded-xl bg-paper p-3">
              <div className="flex items-center justify-between gap-2">
                <span className="font-semibold">{d.label}</span>
                <span className={`rounded-full px-2.5 py-0.5 text-xs font-bold ${VERDICT_CLS[d.verdict]}`}>{t("verdict." + d.verdict)}</span>
              </div>
              <div className="mt-2 grid grid-cols-[auto_1fr_auto] items-center gap-2 text-xs">
                <span className="w-7 font-bold">{d.you}</span>
                <div className="flex h-2 overflow-hidden rounded-full bg-line/60" aria-hidden>
                  <div className="bg-fennel" style={{ width: `${(d.you / Math.max(1, d.you + d.them)) * 100}%` }} />
                  <div className="bg-chili/80" style={{ width: `${(d.them / Math.max(1, d.you + d.them)) * 100}%` }} />
                </div>
                <span className="w-7 text-right font-bold">{d.them}</span>
              </div>
              <p className="mt-1 text-xs text-mist">{d.note}</p>
            </li>
          ))}
        </ul>

        <div className="mt-5 rounded-2xl bg-ink p-5 text-white">
          <p className="text-sm text-white/70">{t("battle.howToWin")}</p>
          <p className="mt-1 font-display text-xl font-bold leading-snug">{b.howToWin}</p>
          {b.battleground && <p className="mt-2 text-xs text-white/60">{t("battle.bgDecision", { p: pct(b.battleground.confidence), engine: b.battleground.engine === "jev-demo" ? t("battle.engineDemo") : "Jev" })}</p>}
        </div>

        <h4 className="mt-6 font-display text-lg font-bold">{t("battle.yourPlan")}</h4>
        <div className="mt-2"><Plan plan={r.plan} compact /></div>
      </div>
    </div>
  );
}

const THREAT_CLS = { HIGH: "bg-chili text-white", MEDIUM: "bg-saffron text-white", LOW: "bg-line text-ink" } as const;
const BENCH_CLS = { STRONG: "border-fennel text-fennel", MEDIUM: "border-ink/40 text-ink", WEAK: "border-line text-mist" } as const;

function Lines({ items, empty }: { items: Reason[]; empty: string }) {
  const t = useT();
  if (!items.length) return <p className="text-sm text-mist">{empty}</p>;
  return <ul className="space-y-1 text-sm">{items.map((r, i) => <li key={i} className="flex gap-2"><span aria-hidden className="text-mist">•</span><span>{reasonText(t, r)}</span></li>)}</ul>;
}

export function WarRoom({ r }: { r: RadarResult }) {
  const t = useT();
  const { locale } = useLocale();
  const [sel, setSel] = useState<Competitor | null>(null);
  const confirmedIds = new Set(r.competitors.map((c) => c.restaurant.id));
  const ruledOut = r.nearby.filter((n) => !confirmedIds.has(n.restaurant.id));
  const roles = r.roles;
  // Order: main threat, best benchmark, emerging threats, then the rest by threat.
  const rank = (c: Competitor) => (c.restaurant.id === roles?.topThreatId ? 0 : c.restaurant.id === roles?.bestBenchmarkId ? 1 : roles?.emergingThreatIds.includes(c.restaurant.id) ? 2 : 3);
  const list = [...r.competitors].sort((a, b) => rank(a) - rank(b) || b.threatScore - a.threatScore);

  return (
    <section aria-labelledby="wr">
      <div className="flex flex-wrap items-end justify-between gap-2">
        <h2 id="wr" className="font-display text-2xl font-bold md:text-3xl">{t("cc.title")}</h2>
        <p className="text-sm text-mist">{t("cc.sub", { n: r.nearby.length, radius: r.input.radiusM >= 1000 ? `${r.input.radiusM / 1000} km` : `${r.input.radiusM} m`, c: r.competitors.length })}</p>
      </div>

      {list.length === 0 ? (
        <p className="mt-4 rounded-xl border border-line bg-paper p-5">{t("warn.noCompetitors")}</p>
      ) : (
        <ul className="mt-4 grid gap-3 md:grid-cols-2">
          {list.map((c) => {
            const x = c.restaurant;
            const card = r.competitorCards?.[x.id];
            const roleKeys = [
              x.id === roles?.topThreatId && "cc.role.topThreat",
              x.id === roles?.bestBenchmarkId && "cc.role.bestBenchmark",
              roles?.emergingThreatIds.includes(x.id) && "cc.role.emerging",
            ].filter(Boolean) as string[];
            return (
              <li key={x.id} className={`flex flex-col rounded-2xl border bg-paper p-4 ${x.id === roles?.topThreatId ? "border-chili" : "border-line"}`}>
                {roleKeys.length > 0 && <p className="mb-1 text-xs font-bold uppercase tracking-wide text-chili">{roleKeys.map((k) => t(k)).join(" · ")}</p>}
                <div className="flex items-start justify-between gap-2">
                  <div>
                    <p className="font-display text-xl font-extrabold">{x.name}</p>
                    <p className="text-sm text-mist">{x.foodProfile && x.foodProfile.level !== "LOW" ? t("cuisine." + x.foodProfile.primary) : t.opt(x.primaryFoodType)}, {t("cc.away", { d: km(c.distanceM, locale) })}</p>
                  </div>
                  <div className="text-right">
                    <p className="font-display text-lg font-extrabold">{stars(x.rating, locale)} ★</p>
                    <p className="text-xs text-mist">{t("cc.reviews", { n: x.reviewCount })}</p>
                  </div>
                </div>
                {card && <p className="mt-1 text-xs text-mist">{t("repnote." + card.reputationNote)}</p>}
                <div className="mt-2 flex flex-wrap gap-1.5">
                  <span className={`rounded-full px-2.5 py-0.5 text-xs font-bold ${THREAT_CLS[c.threatLevel]}`}>{t("cc.threat." + c.threatLevel)}</span>
                  <span className={`rounded-full border px-2.5 py-0.5 text-xs font-bold ${BENCH_CLS[c.benchmarkLevel]}`}>{t("cc.bench." + c.benchmarkLevel)}</span>
                </div>
                {card && (
                  <div className="mt-3 space-y-3">
                    <div><p className="text-xs font-bold uppercase tracking-wide text-mist">{t("cc.why")}</p><Lines items={card.whyItMatters} empty={t("cc.nothing")} /></div>
                    <div className="grid gap-3 sm:grid-cols-2">
                      <div><p className="text-xs font-bold uppercase tracking-wide text-chili">{t("cc.theyBetter")}</p><Lines items={card.theyDoBetter} empty={t("cc.nothing")} /></div>
                      <div><p className="text-xs font-bold uppercase tracking-wide text-fennel">{t("cc.youBetter")}</p><Lines items={card.youDoBetter} empty={t("cc.nothing")} /></div>
                    </div>
                    <div className="rounded-xl bg-linen p-3">
                      <p className="text-xs font-bold uppercase tracking-wide text-mist">{t("cc.verdict")}</p>
                      <p className="text-sm font-semibold">{t("verdict." + card.verdict, { r: stars(card.verdictParams.r, locale), n: card.verdictParams.n })}</p>
                    </div>
                  </div>
                )}
                {r.battles[x.id] && <button onClick={() => setSel(c)} className="mt-3 self-start text-sm font-bold underline">{t("cc.compare")}</button>}
              </li>
            );
          })}
        </ul>
      )}

      {ruledOut.length > 0 && (
        <details className="mt-3 rounded-xl border border-line bg-paper p-4 text-sm">
          <summary className="cursor-pointer font-semibold">{t("war.ruledOut", { n: ruledOut.length })}</summary>
          <ul className="mt-2 grid gap-1 sm:grid-cols-2">
            {ruledOut.map((n) => <li key={n.restaurant.id} className="text-mist">{n.restaurant.name}: {n.restaurant.foodProfile && n.restaurant.foodProfile.level !== "LOW" ? t("cuisine." + n.restaurant.foodProfile.primary) : t.opt(n.restaurant.primaryFoodType)}, {t("war.relevance", { n: Math.round(n.relevance) })}</li>)}
          </ul>
        </details>
      )}
      {sel && <BattleMode r={r} c={sel} onClose={() => setSel(null)} />}
    </section>
  );
}
