"use client";
import { useEffect, useRef, useState } from "react";
import type { BattleVerdict, Competitor, RadarResult } from "@/types";
import { km, priceSigns } from "@/lib/labels";
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

export function WarRoom({ r }: { r: RadarResult }) {
  const t = useT();
  const { locale } = useLocale();
  const [sel, setSel] = useState<Competitor | null>(null);
  const confirmedIds = new Set(r.competitors.map((c) => c.restaurant.id));
  const ruledOut = r.nearby.filter((n) => !confirmedIds.has(n.restaurant.id));
  const tg = r.target;
  const topName = r.decisions.biggestThreat?.choice;

  return (
    <section aria-labelledby="wr">
      <div className="flex flex-wrap items-end justify-between gap-2">
        <h2 id="wr" className="font-display text-2xl font-bold md:text-3xl">{t("war.title")}</h2>
        <p className="text-sm text-mist">{t("war.counts", { n: r.nearby.length, radius: r.input.radiusM >= 1000 ? `${r.input.radiusM / 1000} km` : `${r.input.radiusM} m`, c: r.competitors.length })}</p>
      </div>

      {r.competitors.length === 0 ? (
        <p className="mt-4 rounded-xl border border-line bg-paper p-5">{t("warn.noCompetitors")}</p>
      ) : (
        <ul className="mt-4 grid gap-3 md:grid-cols-2">
          {r.competitors.map((c) => {
            const x = c.restaurant;
            const isTop = x.name === topName;
            return (
              <li key={x.id}>
                <button onClick={() => setSel(c)} className={`w-full rounded-2xl border bg-paper p-4 text-left transition-colors hover:border-ink ${isTop ? "border-chili" : "border-line"}`}>
                  <div className="flex items-start justify-between gap-2">
                    <div>
                      <p className="font-display text-xl font-extrabold">{x.name}</p>
                      <p className="text-sm text-mist">{t.opt(x.primaryFoodType)}, {priceSigns(x.priceLevel)}, {t("war.away", { d: km(c.distanceM, locale) })}</p>
                    </div>
                    {isTop && <span className="rounded-full bg-chili px-2.5 py-0.5 text-xs font-bold text-white">{t("decision.threat")}</span>}
                  </div>
                  <dl className="mt-3 grid grid-cols-4 gap-2 text-sm">
                    <div><dt className="text-xs text-mist">{t("war.rating")}</dt><dd className="font-bold">{x.rating}<span className="text-xs font-normal text-mist"> ({x.reviewCount})</span></dd></div>
                    <div><dt className="text-xs text-mist">{t("war.competitor")}</dt><dd className="font-bold">{pct(c.competitorProbability)}</dd></div>
                    <div><dt className="text-xs text-mist">{t("war.threat")}</dt><dd className="font-bold">{Math.round(c.threatScore)}</dd></div>
                    <div><dt className="text-xs text-mist">{t("war.closes")}</dt><dd className="font-bold">{x.openingHours?.close ?? "n/a"}</dd></div>
                  </dl>
                  <p className="mt-2 text-xs text-mist">{t("war.youClose", { h: tg.openingHours?.close ?? "n/a" })} {x.openingHours && tg.openingHours && x.openingHours.close !== tg.openingHours.close ? t("war.hoursDiffer") : t("war.sameClose")} {t("war.openBattle")}</p>
                </button>
              </li>
            );
          })}
        </ul>
      )}

      {ruledOut.length > 0 && (
        <details className="mt-3 rounded-xl border border-line bg-paper p-4 text-sm">
          <summary className="cursor-pointer font-semibold">{t("war.ruledOut", { n: ruledOut.length })}</summary>
          <ul className="mt-2 grid gap-1 sm:grid-cols-2">
            {ruledOut.map((n) => <li key={n.restaurant.id} className="text-mist">{n.restaurant.name}: {t.opt(n.restaurant.primaryFoodType)}, {t("war.relevance", { n: Math.round(n.relevance) })}</li>)}
          </ul>
        </details>
      )}
      {sel && <BattleMode r={r} c={sel} onClose={() => setSel(null)} />}
    </section>
  );
}
