// Experiments: Restaurant Radar recommends TESTS, not permanent changes. Measurement is code; the verdict is
// conservative (small samples are INCONCLUSIVE) and never claims causality.
import type { Restaurant } from "@/types";
import { hash } from "@/lib/store";
import type { Experiment, ExperimentResultLabel, ExperimentType, Measurement, MarketSnapshot, RestaurantRecord } from "./types";

interface Def {
  weeks: number;
  cost: Experiment["costLevel"]; risk: Experiment["riskLevel"]; reversible: boolean;
  /** How the effect is measured: from public data (auto) or by the owner. */
  measure: "auto" | "owner";
  metric: string; unit: string;
  /** Lower is better (complaints) or higher is better (sales, reviews). */
  better: "lower" | "higher";
}

export const EXPERIMENTS: Record<ExperimentType, Def> = {
  EXTEND_WEEKEND_HOURS: { weeks: 4, cost: "LOW", risk: "LOW", reversible: true, measure: "owner", metric: "extraHourRevenue", unit: "EUR", better: "higher" },
  TEST_NEW_PACKAGING: { weeks: 4, cost: "MEDIUM", risk: "LOW", reversible: true, measure: "auto", metric: "deliveryComplaintsPer100", unit: "per100", better: "lower" },
  RUN_REVIEW_GENERATION_TEST: { weeks: 4, cost: "LOW", risk: "LOW", reversible: true, measure: "auto", metric: "newReviewsPerWeek", unit: "perWeek", better: "higher" },
  TEST_VALUE_BUNDLE: { weeks: 4, cost: "LOW", risk: "LOW", reversible: true, measure: "owner", metric: "bundlesSold", unit: "count", better: "higher" },
  IMPROVE_GOOGLE_PROFILE: { weeks: 2, cost: "LOW", risk: "LOW", reversible: true, measure: "auto", metric: "visibilityScore", unit: "score", better: "higher" },
  UPDATE_POSITIONING: { weeks: 4, cost: "LOW", risk: "LOW", reversible: true, measure: "auto", metric: "bestSearchRank", unit: "rank", better: "lower" },
  TEST_INSTAGRAM_CONTENT_PLAN: { weeks: 4, cost: "LOW", risk: "LOW", reversible: true, measure: "auto", metric: "engagementRate", unit: "pct", better: "higher" },
  TEST_MENU_RESTRUCTURE: { weeks: 4, cost: "MEDIUM", risk: "MEDIUM", reversible: true, measure: "owner", metric: "averageTicket", unit: "EUR", better: "higher" },
};

const DELIVERY_THEMES = ["FRIES", "PACKAGING", "DELIVERY_EXPERIENCE", "TEMPERATURE"];
const MIN_REVIEWS_AFTER = 15;   // packaging test: below this, INCONCLUSIVE
const DAY = 86_400_000;

/** Measure a metric from stored public data over [from, to). Returns value null when the sample is too small. */
export function measureAuto(type: ExperimentType, target: Restaurant, snaps: MarketSnapshot[], from: number, to: number): Measurement {
  const d = EXPERIMENTS[type];
  if (type === "TEST_NEW_PACKAGING") {
    const rs = target.reviews.filter((r) => { const t = new Date(r.date).getTime(); return t >= from && t < to; });
    const neg = rs.reduce((s, r) => s + (r.mentions ?? []).filter((m) => m.sentiment === "negative" && DELIVERY_THEMES.includes(m.theme)).length, 0);
    return { metric: d.metric, unit: d.unit, source: "reviews", sample: rs.length, value: rs.length >= MIN_REVIEWS_AFTER ? Math.round((100 * neg) / rs.length) : null };
  }
  const inWin = snaps.filter((s) => { const t = new Date(s.at).getTime(); return t >= from - DAY && t <= to + DAY; });
  if (type === "RUN_REVIEW_GENERATION_TEST") {
    // Review count growth between the first and last snapshot of the window (counts are exact, from Google).
    if (inWin.length < 2) {
      const rs = target.reviews.filter((r) => { const t = new Date(r.date).getTime(); return t >= from && t < to; });
      const weeks = Math.max(1, (to - from) / (7 * DAY));
      return { metric: d.metric, unit: d.unit, source: "reviews", sample: rs.length, value: Number((rs.length / weeks).toFixed(1)) };
    }
    const a = inWin[0], b = inWin[inWin.length - 1];
    const weeks = Math.max(1, (new Date(b.at).getTime() - new Date(a.at).getTime()) / (7 * DAY));
    return { metric: d.metric, unit: d.unit, source: "google", sample: b.target.reviewCount - a.target.reviewCount, value: Number(((b.target.reviewCount - a.target.reviewCount) / weeks).toFixed(1)) };
  }
  const last = inWin[inWin.length - 1];
  if (type === "IMPROVE_GOOGLE_PROFILE") return { metric: d.metric, unit: d.unit, source: "visibility", value: last?.visibility ?? null };
  if (type === "UPDATE_POSITIONING") {
    const ranks = (last?.searchRanks ?? []).map((r) => r.rank).filter((r): r is number => r !== null);
    return { metric: d.metric, unit: d.unit, source: "google", value: ranks.length ? Math.min(...ranks) : null };
  }
  if (type === "TEST_INSTAGRAM_CONTENT_PLAN") return { metric: d.metric, unit: d.unit, source: "instagram", value: last?.instagram?.er !== undefined ? Number((100 * last.instagram.er).toFixed(2)) : null };
  return { metric: d.metric, unit: d.unit, source: "owner", value: null };
}

export function startExperiment(rec: RestaurantRecord, type: ExperimentType, target: Restaurant, nowMs = Date.now()): Experiment {
  const d = EXPERIMENTS[type];
  const start = nowMs, end = nowMs + d.weeks * 7 * DAY;
  // Baseline: same-length window just before the start (public data) or 0 for a new opening window (nothing sold when closed).
  const baseline: Measurement = d.measure === "auto"
    ? measureAuto(type, target, rec.snapshots, start - Math.max(d.weeks * 7, 90) * DAY, start)
    : { metric: d.metric, unit: d.unit, source: "owner", value: type === "EXTEND_WEEKEND_HOURS" || type === "TEST_VALUE_BUNDLE" ? 0 : null };
  const exp: Experiment = {
    id: hash(`${rec.id}|${type}|${start}`), restaurantId: rec.id, type, startDate: new Date(start).toISOString(), endDate: new Date(end).toISOString(),
    baseline, costLevel: d.cost, riskLevel: d.risk, reversible: d.reversible, status: "ACTIVE", ownerEntries: [],
  };
  rec.experiments = rec.experiments.filter((e) => e.status !== "ACTIVE" || e.type !== type);
  rec.experiments.push(exp);
  return exp;
}

/** Conservative verdict from numbers only. Returns INCONCLUSIVE when the evidence cannot support a conclusion. */
export function ruleVerdict(type: ExperimentType, before: Measurement, after: Measurement): { label: ExperimentResultLabel; sufficient: boolean } {
  const d = EXPERIMENTS[type];
  if (after.value === null || before.value === null) return { label: "INCONCLUSIVE", sufficient: false };
  if (type === "TEST_NEW_PACKAGING" && (after.sample ?? 0) < MIN_REVIEWS_AFTER) return { label: "INCONCLUSIVE", sufficient: false };
  const a = before.value, b = after.value;
  const delta = d.better === "higher" ? b - a : a - b;           // > 0 = improvement
  const rel = Math.abs(a) > 0 ? delta / Math.abs(a) : delta > 0 ? 1 : 0;
  // A clear effect needs a relative change of 30% or more; smaller moves are "no clear effect".
  if (rel >= 0.3) return { label: "PROMISING", sufficient: true };
  if (rel <= -0.3) return { label: "NEGATIVE", sufficient: true };
  return { label: "NO_CLEAR_EFFECT", sufficient: true };
}

/** Update every active experiment: current measure, midpoint, completion. Returns the events to log. */
export function updateExperiments(rec: RestaurantRecord, target: Restaurant, nowMs = Date.now()): { code: string; params: Record<string, string | number>; kind: "EXPERIMENT_MIDPOINT" | "EXPERIMENT_COMPLETED" }[] {
  const events: ReturnType<typeof updateExperiments> = [];
  for (const e of rec.experiments.filter((x) => x.status === "ACTIVE")) {
    const d = EXPERIMENTS[e.type];
    const start = new Date(e.startDate).getTime(), end = new Date(e.endDate).getTime();
    e.current = d.measure === "auto"
      ? measureAuto(e.type, target, rec.snapshots, start, Math.min(nowMs, end))
      : { metric: d.metric, unit: d.unit, source: "owner", value: e.ownerEntries.length ? e.ownerEntries.reduce((s, x) => s + x.value, 0) : null };
    if (!e.midpointLogged && nowMs >= start + (end - start) / 2) { e.midpointLogged = true; events.push({ kind: "EXPERIMENT_MIDPOINT", code: "tl.midpoint", params: { type: e.type } }); }
    if (nowMs >= end) {
      const v = ruleVerdict(e.type, e.baseline, e.current);
      e.status = v.sufficient ? "COMPLETED" : "INCONCLUSIVE";
      e.result = { label: v.label, before: e.baseline, after: e.current, decidedBy: "rule" };
      events.push({ kind: "EXPERIMENT_COMPLETED", code: "tl.completed", params: { type: e.type, label: v.label } });
    }
  }
  return events;
}

export const activeExperiment = (rec?: RestaurantRecord) => rec?.experiments.find((e) => e.status === "ACTIVE");
export const lastFinished = (rec?: RestaurantRecord) => [...(rec?.experiments ?? [])].reverse().find((e) => e.status === "COMPLETED" || e.status === "INCONCLUSIVE");
