import type { FoodType, RestaurantFormat, DataQualityLevel } from "@/types";

const num = (v: string | undefined, d: number) => (v && !isNaN(Number(v)) ? Number(v) : d);

export const CONFIG = {
  radiusOptionsM: [500, 1000, 2000, 3000],

  // Competitor Relevance Score V2 weights (sum = 1). Edit here only.
  relevanceWeights: {
    foodType: 0.30, occasion: 0.15, proximity: 0.15, price: 0.10,
    reviewVolume: 0.10, hours: 0.10, format: 0.10,
  },

  // Food type detection: confidence thresholds for HIGH / MEDIUM (below = LOW, shown as uncertain)
  foodType: { high: 0.75, medium: 0.5 },

  // Bayesian rating smoothing: adjusted = v/(v+m)*R + m/(v+m)*C
  // R raw rating, v review count, C local market average, m = reviews needed before a rating "counts" as much as the market prior.
  reputation: {
    bayesM: 50,
    // reputationConfidence by review count
    highMinReviews: 200, mediumMinReviews: 50,
  },

  // Threat potential = likelihood of capturing the same customers (0-100). Review volume is NOT an input.
  threatWeights: { foodType: 0.35, proximity: 0.2, occasion: 0.15, hours: 0.1, price: 0.1, momentum: 0.1 },
  threatLevels: { high: 70, medium: 50 },
  // Benchmark quality = how reliably we can learn from this place (0-100). Review volume IS central.
  benchmarkWeights: { similarity: 0.4, volume: 0.4, reputation: 0.2 },
  benchmarkLevels: { strong: 70, strongMinReviews: 100, strongMinSimilarity: 0.6, medium: 50, mediumMinReviews: 30, mediumMinSimilarity: 0.45 },
  benchmarkVolumeRef: 500, // review count treated as "fully established"
  prefilterTopN: 8, // candidates sent to Jev for the yes/no decision

  // Cost control (env-overridable)
  limits: {
    maxNearbyRestaurants: num(process.env.MAX_NEARBY_RESTAURANTS, 30),
    maxReviewsTarget: num(process.env.MAX_REVIEWS_TARGET, 200),
    maxReviewsPerCompetitor: num(process.env.MAX_REVIEWS_PER_COMPETITOR, 50),
    maxCompetitorsAnalyzed: num(process.env.MAX_COMPETITORS_ANALYZED, 5),
    scanCacheHours: num(process.env.SCAN_CACHE_HOURS, 24),
  },

  // Data quality, by reviews analyzed on the TARGET restaurant
  dataQuality: { mediumMinReviews: 11, highMinReviews: 51 },
  dataQualityConfidenceFactor: { HIGH: 1, MEDIUM: 0.88, LOW: 0.65 } as Record<DataQualityLevel, number>,

  // Confidence policy
  confidence: { strong: 0.8, test: 0.6 },

  competitorYesThreshold: 0.5,

  // Battle: score gap under this = "too close to call"
  battleTieMargin: 8,

  radarScoreWeights: {
    position: 0.25, reputation: 0.25, value: 0.2, convenience: 0.15, differentiation: 0.15,
  },
};

// Food-type similarity, symmetric, 0..1. Missing pair = 0.1
const FOOD_PAIRS: [FoodType, FoodType, number][] = [
  ["burger", "fried_chicken", 0.6], ["burger", "tacos", 0.5], ["burger", "kebab", 0.5],
  ["burger", "pizza", 0.3], ["burger", "asian_street", 0.3], ["pizza", "kebab", 0.4],
  ["pizza", "tacos", 0.4], ["fried_chicken", "tacos", 0.5], ["fried_chicken", "kebab", 0.5],
  ["kebab", "tacos", 0.6], ["coffee", "bakery", 0.5], ["bakery", "dessert", 0.5],
  ["coffee", "dessert", 0.4], ["sushi", "asian_street", 0.5],
];
export function foodSimilarity(a: FoodType, b: FoodType): number {
  if (a === b) return 1;
  const hit = FOOD_PAIRS.find(([x, y]) => (x === a && y === b) || (x === b && y === a));
  return hit ? hit[2] : 0.1;
}

const FORMAT_PAIRS: [RestaurantFormat, RestaurantFormat, number][] = [
  ["fast_food", "casual_dining", 0.6], ["casual_dining", "premium", 0.5],
  ["bakery", "coffee", 0.6], ["coffee", "dessert", 0.5], ["bakery", "fast_food", 0.4],
];
export function formatSimilarity(a: RestaurantFormat, b: RestaurantFormat): number {
  if (a === b) return 1;
  const hit = FORMAT_PAIRS.find(([x, y]) => (x === a && y === b) || (x === b && y === a));
  return hit ? hit[2] : 0.1;
}

// Documented Radar Score formulas (shown in the UI)
export const RADAR_FORMULAS = {
  position: "50% rating percentile in the local market + 30% review-count percentile + 20% rating edge over confirmed competitors.",
  reputation: "60% (rating / 5) + 40% share of positive theme mentions, smoothed with a neutral prior of 5 mentions.",
  value: "Smoothed positive share across VALUE_FOR_MONEY, PRICE and PORTION mentions (neutral prior of 5). Flagged low-evidence under 8 mentions.",
  convenience: "40% opening-hours coverage (hours open / 16, late-night bonus) + 60% smoothed positive share across WAITING_TIME, DELIVERY_EXPERIENCE, PACKAGING and ORDER_ACCURACY.",
  differentiation: "60% category uniqueness against same-food-type restaurants nearby + 40% rating edge over those same-type restaurants.",
  total: "Weighted average: Position 25%, Reputation 25%, Value 20%, Convenience 15%, Differentiation 15%.",
};
