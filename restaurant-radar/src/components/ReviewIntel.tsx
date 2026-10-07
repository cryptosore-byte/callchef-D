"use client";
import type { RadarResult, ThemeStat } from "@/types";
import { useT } from "@/i18n/client";
import { pct } from "@/lib/util";
import { Bar } from "./ui";

const MIN = 8;

function Row({ s, kind }: { s: ThemeStat; kind: "love" | "complain" }) {
  const t = useT();
  const rate = kind === "love" ? s.positiveRate : s.negativeRate;
  return (
    <li className="border-b border-line/70 py-3 last:border-0">
      <div className="flex items-baseline justify-between gap-3">
        <span className="font-display text-lg font-bold">{t.theme(s.theme)}</span>
        <span className="text-sm text-mist">{t("ri.mentions", { n: s.mentions })}</span>
      </div>
      <p className="text-sm font-semibold">{t(kind === "love" ? "ri.posRate" : "ri.negRate", { p: pct(rate) })}
        {s.recentTrend === "worsening" && <span className="ml-2 text-chili">{t("ri.worse")}</span>}
        {s.recentTrend === "improving" && <span className="ml-2 text-fennel">{t("ri.better")}</span>}
      </p>
      <div className="mt-1.5"><Bar value={rate * 100} tone={kind === "love" ? "fennel" : "chili"} /></div>
      {s.signals.length > 0 && (
        <p className="mt-1.5 text-xs text-mist">{t("ri.signals", { list: s.signals.map((x) => `${t.sig(x.word)} (${x.count})`).join(", ") })}</p>
      )}
    </li>
  );
}

export function ReviewIntel({ r }: { r: RadarResult }) {
  const t = useT();
  const s = r.summaries[r.target.id];
  const eligible = s.stats.filter((x) => x.mentions >= MIN);
  const love = eligible.filter((x) => x.positiveRate >= 0.6).sort((a, b) => b.positive - a.positive).slice(0, 4);
  const complain = eligible.filter((x) => x.negativeRate >= 0.35).sort((a, b) => b.negative - a.negative).slice(0, 4);
  const rc = s.rootCauses[0];
  const burger = s.stats.find((x) => x.theme === "BURGER" || x.theme === "FOOD_QUALITY");
  const insight = rc && rc.key === "DELIVERY_HOLDING" && burger && burger.positiveRate >= 0.8
    ? t("ri.insight.holding")
    : rc ? t("ri.insight.rc", { label: rc.label.toLowerCase() }) : t("ri.insight.none");

  return (
    <section aria-labelledby="ri">
      <div className="flex flex-wrap items-end justify-between gap-2">
        <h2 id="ri" className="font-display text-2xl font-bold md:text-3xl">{t("ri.title")}</h2>
        <p className="text-sm text-mist">{t("ri.sample", { n: s.reviewsAnalyzed, m: s.totalMentions })}</p>
      </div>
      <div className="mt-4 grid gap-4 md:grid-cols-2">
        <div className="rounded-2xl border border-line bg-paper p-5">
          <h3 className="font-display text-lg font-bold text-fennel">{t("ri.love")}</h3>
          <ul className="mt-1">{love.length ? love.map((x) => <Row key={x.theme} s={x} kind="love" />) : <li className="py-3 text-sm text-mist">{t("ri.noPos")}</li>}</ul>
        </div>
        <div className="rounded-2xl border border-line bg-paper p-5">
          <h3 className="font-display text-lg font-bold text-chili">{t("ri.complain")}</h3>
          <ul className="mt-1">{complain.length ? complain.map((x) => <Row key={x.theme} s={x} kind="complain" />) : <li className="py-3 text-sm text-mist">{t("ri.noNeg")}</li>}</ul>
        </div>
      </div>

      <div className="mt-4 grid gap-4 md:grid-cols-[1.2fr_1fr]">
        <div className="rounded-2xl border border-line bg-white p-5">
          <p className="text-sm text-mist">{t("ri.likelyInsight")}</p>
          <p className="mt-1 font-display text-xl font-bold leading-snug">{insight}</p>
        </div>
        <div className="rounded-2xl border border-line bg-paper p-5">
          <p className="text-sm text-mist">{t("ri.rootCause")}</p>
          {s.rootCauses.length ? (
            <ul className="mt-2 space-y-2">
              {s.rootCauses.slice(0, 3).map((c) => (
                <li key={c.key}>
                  <div className="flex justify-between text-sm font-semibold"><span>{c.label}</span><span>{pct(c.confidence)}</span></div>
                  <Bar value={c.confidence * 100} tone="ink" />
                </li>
              ))}
            </ul>
          ) : <p className="mt-2 text-sm">{t("ri.noRoot")}</p>}
        </div>
      </div>
    </section>
  );
}
