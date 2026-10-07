"use client";
import { useState } from "react";
import type { DecisionResult, RadarResult } from "@/types";
import { useT } from "@/i18n/client";
import { pct } from "@/lib/util";
import { TierBadge } from "./ui";

type Key = "biggestThreat" | "whyTheyWin" | "advantage" | "weakness" | "nextAction";

export function DecisionPanel({ r }: { r: RadarResult }) {
  const t = useT();
  const [open, setOpen] = useState<Key | null>(null);
  const d = r.decisions;

  if (!d.available || !d.biggestThreat) {
    return (
      <section className="rounded-2xl border border-line bg-paper p-6" aria-labelledby="dp">
        <h2 id="dp" className="font-display text-2xl font-bold">{t("decision.title")}</h2>
        <p className="mt-3 font-semibold text-chili" role="status">{d.unavailableReason ?? t("decision.unavailable")}</p>
        <p className="mt-1 text-sm text-mist">{t("decision.unavailableNote")}</p>
      </section>
    );
  }

  const rows: { key: Key; label: string; dec: DecisionResult; value: string }[] = [
    { key: "biggestThreat", label: t("decision.threat"), dec: d.biggestThreat!, value: d.biggestThreat!.choice },
    { key: "whyTheyWin", label: t("decision.why"), dec: d.whyTheyWin!, value: t.opt(d.whyTheyWin!.choice) },
    { key: "advantage", label: t("decision.advantage"), dec: d.advantage!, value: t.opt(d.advantage!.choice) },
    { key: "weakness", label: t("decision.weakness"), dec: d.weakness!, value: t.opt(d.weakness!.choice) },
  ];
  const na = d.nextAction!;
  const insufficient = na.tier === "INSUFFICIENT" || na.choice === "NO_ACTION";
  const shown = open ? (open === "nextAction" ? na : rows.find((x) => x.key === open)!.dec) : null;

  return (
    <section aria-labelledby="dp">
      <h2 id="dp" className="sr-only">{t("decision.panelAria")}</h2>
      <div className="grid gap-4 lg:grid-cols-[1fr_1.05fr]">
        <div className="divide-y divide-line rounded-2xl border border-line bg-paper">
          {rows.map((x) => (
            <div key={x.key} className="flex items-center justify-between gap-3 p-4 md:p-5">
              <div className="min-w-0">
                <p className="text-sm text-mist">{x.label}</p>
                <p className="truncate font-display text-2xl font-extrabold md:text-3xl">{x.value}</p>
              </div>
              <div className="shrink-0 text-right">
                <p className="font-display text-xl font-bold">{pct(x.dec.confidence)}</p>
                <p className="text-xs text-mist">{t("decision.confidence")}</p>
                <button onClick={() => setOpen(open === x.key ? null : x.key)} aria-expanded={open === x.key}
                  className="mt-1 text-xs font-bold underline underline-offset-2">{t("decision.whyBtn")}</button>
              </div>
            </div>
          ))}
        </div>

        <div className="relative flex flex-col justify-between rounded-2xl bg-ink p-6 text-white md:p-7">
          <div className="absolute inset-x-0 top-0 h-1 rounded-t-2xl bg-saffron" />
          <div>
            <p className="text-sm text-white/70">{t("decision.nextMove")}</p>
            {insufficient ? (
              <>
                <p className="mt-2 font-display text-3xl font-extrabold leading-tight md:text-4xl">{t("decision.insufficient")}</p>
                <p className="mt-3 text-white/70">{na.choice === "NO_ACTION" ? t("decision.noAction") : t("decision.lowConf")}</p>
              </>
            ) : (
              <>
                <p className="mt-2 font-display text-4xl font-extrabold leading-tight md:text-5xl">{t.opt(na.choice)}</p>
                <p className="mt-3 max-w-md text-white/80">{na.conclusion}</p>
              </>
            )}
          </div>
          <div className="mt-6 flex flex-wrap items-end justify-between gap-3">
            {insufficient ? (
              <p className="text-sm text-white/70">{d.priority ? t("priority." + d.priority.score) : ""}</p>
            ) : (
              <div>
                <p className="font-display text-3xl font-bold">{pct(na.confidence)}</p>
                <p className="text-xs text-white/60">{t("decision.confidence")}{d.priority ? t("decision.priority", { s: d.priority.score, label: d.priority.label.toLowerCase() }) : ""}</p>
              </div>
            )}
            <div className="flex items-center gap-3">
              <TierBadge tier={insufficient ? "INSUFFICIENT" : na.tier} strongLabel={t("decision.strongRec")} testLabel={t("decision.worthTesting")} />
              <button onClick={() => setOpen(open === "nextAction" ? null : "nextAction")} aria-expanded={open === "nextAction"}
                className="rounded-lg bg-white px-3 py-2 text-sm font-bold text-ink">{t("decision.whyBtn")}</button>
            </div>
          </div>
        </div>
      </div>

      {shown && (
        <div className="rise mt-4 rounded-2xl border border-ink/20 bg-paper p-5 md:p-6" role="region" aria-label={t("decision.evidenceAria")}>
          <div className="flex flex-wrap items-start justify-between gap-2">
            <div>
              <p className="text-sm text-mist">{t("decision.evidenceFor")}</p>
              <h3 className="font-display text-xl font-bold">{shown.id === "BIGGEST_THREAT" ? shown.choice : t.opt(shown.choice)}</h3>
            </div>
            <div className="flex items-center gap-2"><TierBadge tier={shown.tier} /><button onClick={() => setOpen(null)} className="text-sm font-bold underline">{t("common.close")}</button></div>
          </div>
          <dl className="mt-3 grid gap-x-8 gap-y-2 md:grid-cols-2">
            {shown.evidence.map((e, i) => (
              <div key={i} className="border-b border-line/70 pb-2"><dt className="text-xs text-mist">{e.label}</dt><dd className="text-sm font-semibold">{e.value}</dd></div>
            ))}
          </dl>
          <p className="mt-4 text-sm"><b>{t("decision.conclusion")}</b> {shown.conclusion}</p>
          {shown.distribution.length > 1 && (
            <p className="mt-2 text-xs text-mist">{t("decision.others", { list: shown.distribution.slice(1, 4).map((x) => `${shown.id === "BIGGEST_THREAT" ? x.option : t.opt(x.option)} ${pct(x.probability)}`).join(", ") })}</p>
          )}
          <p className="mt-2 text-xs text-mist">
            {shown.engine === "jev-demo" ? t("decision.engineDemo") : t("decision.engineJev")} {t("decision.factsOnly")}
          </p>
        </div>
      )}
    </section>
  );
}
