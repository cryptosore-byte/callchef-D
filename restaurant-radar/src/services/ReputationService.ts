// Bayesian rating smoothing. A 5.0 with 12 reviews must not outrank a 4.6 with 450 reviews.
//   adjustedRating = v/(v+m) * R + m/(v+m) * C
//   R = raw rating, v = review count, C = local market average, m = CONFIG.reputation.bayesM
import { CONFIG } from "@/config";
import type { Level3, Reputation, Restaurant } from "@/types";
import { mean } from "@/lib/util";

/** Market prior C: average raw rating of rated places (target included). Falls back to 4.2 when nothing is rated. */
export function marketAverage(places: Restaurant[]): number {
  const rated = places.filter((r) => r.reviewCount > 0 && r.rating > 0);
  return rated.length ? mean(rated.map((r) => r.rating)) : 4.2;
}

export function adjustedRating(raw: number, count: number, C: number, m = CONFIG.reputation.bayesM): number {
  if (!count || !raw) return C;
  return (count / (count + m)) * raw + (m / (count + m)) * C;
}

export function reputationConfidence(count: number): Level3 {
  if (count >= CONFIG.reputation.highMinReviews) return "HIGH";
  if (count >= CONFIG.reputation.mediumMinReviews) return "MEDIUM";
  return "LOW";
}

export function reputationOf(r: Restaurant, C: number): Reputation {
  return {
    rawRating: r.rating,
    reviewCount: r.reviewCount,
    adjustedRating: Number(adjustedRating(r.rating, r.reviewCount, C).toFixed(2)),
    reputationConfidence: reputationConfidence(r.reviewCount),
    marketAverage: Number(C.toFixed(2)),
  };
}
