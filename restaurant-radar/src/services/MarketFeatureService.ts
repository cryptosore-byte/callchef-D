import { CONFIG } from "@/config";
import type {
  Competitor, CompetitorCandidate, DataQuality, DataQualityLevel, MarketFeatures, Restaurant, ReviewSummary,
} from "@/types";
import { interval, mean, percentile } from "@/lib/util";
import type { T } from "@/i18n";
import { getStat } from "./ReviewIntelligenceService";

const hoursOpen = (r: Restaurant) => {
  if (!r.openingHours) return null;
  const [o, c] = interval(r.openingHours.open, r.openingHours.close);
  return (c - o) / 60;
};
const closesLate = (r: Restaurant) => {
  if (!r.openingHours) return false;
  const [, c] = interval(r.openingHours.open, r.openingHours.close);
  return c > 1440 || c >= 24 * 60;
};

export function computeMarketFeatures(
  target: Restaurant,
  nearby: CompetitorCandidate[],
  competitors: Competitor[],
  summaries: Record<string, ReviewSummary>,
): MarketFeatures {
  const market = nearby.map((n) => n.restaurant);
  const ratings = [...market.map((r) => r.rating), target.rating];
  const counts = [...market.map((r) => r.reviewCount), target.reviewCount];
  const sameType = market.filter((r) => r.primaryFoodType === target.primaryFoodType);
  const compRestaurants = competitors.map((c) => c.restaurant);
  const compAvgRating = mean(compRestaurants.map((r) => r.rating));
  const compAvgPrice = mean(compRestaurants.map((r) => r.priceLevel));

  const tSummary = summaries[target.id];
  const priceStat = tSummary && (getStat(tSummary, "PRICE") ?? getStat(tSummary, "VALUE_FOR_MONEY"));

  const tHours = hoursOpen(target) ?? 0;
  const bestOther = compRestaurants.reduce((m, r) => Math.max(m, hoursOpen(r) ?? 0), 0);
  const latest = competitors
    .filter((c) => c.restaurant.openingHours)
    .sort((a, b) => interval(b.restaurant.openingHours!.open, b.restaurant.openingHours!.close)[1] - interval(a.restaurant.openingHours!.open, a.restaurant.openingHours!.close)[1])[0];

  return {
    targetRestaurant: target,
    localMarket: {
      restaurantsDetected: market.length,
      avgRating: mean(market.map((r) => r.rating)),
      ratingPercentile: percentile(ratings, target.rating),
      reviewCountPercentile: percentile(counts, target.reviewCount),
      sameFoodTypeCount: sameType.length,
      foodTypeDensity: market.length ? sameType.length / market.length : 0,
      lateNightCount: market.filter(closesLate).length,
    },
    competitors: {
      count: competitors.length,
      avgRating: compAvgRating,
      avgPriceLevel: compAvgPrice,
      ratingGap: target.rating - compAvgRating,
    },
    reviewSignals: summaries,
    priceSignals: {
      targetLevel: target.priceLevel,
      competitorAvgLevel: compAvgPrice,
      priceThemeNegRate: priceStat ? priceStat.negativeRate : null,
    },
    availabilitySignals: {
      targetCloses: target.openingHours?.close ?? "unknown",
      latestCompetitorCloses: latest?.restaurant.openingHours?.close ?? "unknown",
      extraCompetitorHours: Math.max(0, bestOther - tHours),
      targetLateNight: closesLate(target),
    },
  };
}

export function levelForReviews(n: number): DataQualityLevel {
  if (n >= CONFIG.dataQuality.highMinReviews) return "HIGH";
  if (n >= CONFIG.dataQuality.mediumMinReviews) return "MEDIUM";
  return "LOW";
}

export function computeDataQuality(
  t: T, reviewsAnalyzed: number, competitors: Competitor[], summaries: Record<string, ReviewSummary>,
  restaurantsDetected: number, refreshedAt: string,
): DataQuality {
  const level = levelForReviews(reviewsAnalyzed);
  const notes: string[] = [];
  const thin = competitors.filter((c) => (summaries[c.restaurant.id]?.reviewsAnalyzed ?? 0) < CONFIG.dataQuality.mediumMinReviews);
  if (thin.length) notes.push(t("dq.thin", { n: thin.length, min: CONFIG.dataQuality.mediumMinReviews }));
  notes.push(t("dq.sample"));
  return { level, reviewsAnalyzed, competitorsAnalyzed: competitors.length, restaurantsDetected, refreshedAt, notes };
}
