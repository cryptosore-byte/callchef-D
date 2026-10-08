import { CONFIG } from "@/config";
import type { T } from "@/i18n";
import type { MarketFeatures, Restaurant, RadarScore, ReviewSummary, Theme } from "@/types";
import { clamp, interval, mean } from "@/lib/util";
import { smoothedPositive } from "./ReviewIntelligenceService";

export const VALUE_THEMES: Theme[] = ["VALUE_FOR_MONEY", "PRICE", "PORTION"];
export const CONVENIENCE_THEMES: Theme[] = ["WAITING_TIME", "DELIVERY_EXPERIENCE", "PACKAGING", "ORDER_ACCURACY"];

export function hoursCoverage(r: Restaurant): number {
  if (!r.openingHours) return 0.5;
  const [o, c] = interval(r.openingHours.open, r.openingHours.close);
  const late = c >= 1440 + 30 ? 0.15 : 0;
  return clamp((c - o) / 60 / 16 + late);
}

export function reputationScore(r: Restaurant, s?: ReviewSummary): number {
  const pos = s && s.totalMentions ? (s.positiveMentions + 2.5) / (s.totalMentions + 5) : 0.5;
  return 100 * (0.6 * (r.rating / 5) + 0.4 * pos);
}
export function valueScore(s?: ReviewSummary) {
  const v = smoothedPositive(s, VALUE_THEMES);
  return { score: 100 * v.value, n: v.n };
}
export function convenienceScore(r: Restaurant, s?: ReviewSummary): number {
  const v = smoothedPositive(s, CONVENIENCE_THEMES);
  return 100 * (0.4 * hoursCoverage(r) + 0.6 * v.value);
}

const jaccard = (a: string[], b: string[]) => {
  const A = new Set(a.map((x) => x.toLowerCase())); const B = new Set(b.map((x) => x.toLowerCase()));
  const inter = [...A].filter((x) => B.has(x)).length;
  return inter / (A.size + B.size - inter || 1);
};

export function computeRadarScore(
  t: T, target: Restaurant, market: MarketFeatures, nearbyRestaurants: Restaurant[], summary?: ReviewSummary,
): RadarScore {
  const w = CONFIG.radarScoreWeights;

  const position = 100 * (
    0.5 * market.localMarket.ratingPercentile + 0.3 * market.localMarket.reviewCountPercentile +
    0.2 * clamp(0.5 + market.competitors.ratingGap / 1.0)
  );
  const reputation = reputationScore(target, summary);
  const val = valueScore(summary);
  const convenience = convenienceScore(target, summary);

  const sameType = nearbyRestaurants.filter((r) => r.primaryFoodType === target.primaryFoodType);
  const uniqueness = sameType.length ? 1 - mean(sameType.map((r) => jaccard(target.categories, r.categories))) : 1;
  const edge = sameType.length ? clamp(0.5 + (target.rating - mean(sameType.map((r) => r.rating))) / 1.0) : 0.7;
  const differentiation = 100 * (0.6 * uniqueness + 0.4 * edge);

  const dims = [
    { key: "position", label: t("dim.position"), score: position, formula: t("formula.position") },
    { key: "reputation", label: t("dim.reputation"), score: reputation, formula: t("formula.reputation") },
    { key: "value", label: t("dim.value"), score: val.score, formula: t("formula.value"), lowEvidence: val.n < 8 },
    { key: "convenience", label: t("dim.convenience"), score: convenience, formula: t("formula.convenience") },
    { key: "differentiation", label: t("dim.differentiation"), score: differentiation, formula: t("formula.differentiation") },
  ].map((d) => ({ ...d, score: Math.round(d.score) }));

  const total = Math.round(
    w.position * position + w.reputation * reputation + w.value * val.score +
    w.convenience * convenience + w.differentiation * differentiation,
  );
  return { total, dimensions: dims };
}
