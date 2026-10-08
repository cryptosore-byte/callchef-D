// Question rubrics for Jev. Each option says what it means AND what it is not, so options stay distinguishable.
// Facts live in `state`; rubrics here are generic and reusable.
import type { Competitor, Restaurant, ReviewSummary } from "@/types";

export const WIN_CRITERIA: Record<string, string> = {
  PRICE: "Customers pick the competitor mainly because it is cheaper. Not for: better food or longer hours.",
  PRODUCT: "The competitor's food is better received (compare food-theme sentiment in `competitor.themes` vs `target.themes`). Not for: price or convenience.",
  REPUTATION: "The competitor has a clearly higher rating and many more reviews. Not for: sentiment on a specific theme.",
  CONVENIENCE: "The competitor is easier to order from: better delivery, packaging, order accuracy or waiting-time sentiment. Not for: opening hours.",
  VALUE: "The competitor gives better value for money or portions in customer sentiment. Not for: raw price level.",
  PROMOTION: "The competitor wins through promotions or deals. Choose only if the state mentions promotions.",
  DIFFERENTIATION: "The competitor offers something distinctive the target lacks (different categories or concept).",
  MENU: "The competitor has a broader or more attractive menu. Choose only if the state describes menus.",
  OPENING_HOURS: "The competitor is open when the target is closed (later closing or longer hours). Not for: delivery quality.",
  NO_CLEAR_ADVANTAGE: "No single factor clearly explains why customers would choose the competitor, or the evidence is thin.",
};

export const ADVANTAGE_CRITERIA: Record<string, string> = {
  PRODUCT_QUALITY: "Food-theme mentions (burger, food quality, texture) are clearly more positive than competitors'.",
  TASTE: "Taste mentions are clearly more positive than competitors'.",
  PORTIONS: "Portion mentions are clearly more positive than competitors'.",
  PRICE: "The target is cheaper than competitors and customers react well to prices.",
  VALUE: "Value-for-money mentions are clearly more positive than competitors'.",
  REPUTATION: "The target's rating and review volume clearly beat the competitors'.",
  CONVENIENCE: "Hours, delivery, packaging and waiting-time signals are clearly better than competitors'.",
  MENU: "The target has a clearly broader or better menu. Choose only if the state describes menus.",
  DIFFERENTIATION: "The target is distinct from nearby same-cuisine restaurants.",
  SERVICE: "Service mentions are clearly more positive than competitors'.",
  NO_CLEAR_ADVANTAGE: "No area stands out against competitors, or evidence is too thin to tell.",
};

export const WEAKNESS_CRITERIA: Record<string, string> = {
  FOOD: "Food-quality, taste, texture or main-dish themes show a high share of negative mentions.",
  FRIES: "Fries mentions are frequently negative (cold, soggy, soft).",
  PACKAGING: "Packaging mentions are frequently negative (leaks, crushed, steam).",
  PRICE: "Price mentions are frequently negative.",
  VALUE: "Value-for-money mentions are frequently negative.",
  REVIEWS: "The overall rating is clearly below competitors'.",
  OPENING_HOURS: "Competitors are open much later or longer than the target.",
  WAITING_TIME: "Waiting-time mentions are frequently negative.",
  SERVICE: "Service mentions are frequently negative.",
  ORDER_ACCURACY: "Wrong or missing items are frequently mentioned.",
  PORTIONS: "Portion mentions are frequently negative.",
  MENU: "The menu is a problem. Choose only if the state describes menus.",
  DIFFERENTIATION: "The target is hard to tell apart from nearby same-cuisine restaurants.",
  NO_CLEAR_WEAKNESS: "No area shows a meaningful share of negative mentions, or evidence is too thin.",
};

export const ACTION_CRITERIA: Record<string, string> = {
  TEST_NEW_PACKAGING: "Complaints point to food losing heat/texture or leaking in transit, and the core product is rated well.",
  IMPROVE_FRIES_HOLDING: "Fries complaints exist but packaging and delivery are not implicated.",
  EXTEND_OPENING_HOURS: "The main threat captures customers because the target closes earlier.",
  CREATE_VALUE_BUNDLE: "Value or price sentiment is weak and a bundle could address it.",
  ADJUST_PRICING: "Price sentiment is clearly negative and the target is more expensive than competitors.",
  IMPROVE_REVIEW_STRATEGY: "The rating or review volume is the main gap versus competitors.",
  OPTIMIZE_MENU: "Menu structure is the problem. Choose only if the state describes menus.",
  IMPROVE_PHOTOGRAPHY: "Listing photos are the problem. Choose only if the state describes photos.",
  IMPROVE_SERVICE: "Service mentions are frequently negative.",
  IMPROVE_ORDER_ACCURACY: "Wrong or missing items are frequently mentioned.",
  IMPROVE_KITCHEN_SPEED: "Waiting-time mentions are frequently negative.",
  STRENGTHEN_DIFFERENTIATION: "The target is hard to tell apart from competitors.",
  TEST_PROMOTION: "A promotion would address a specific weakness. Choose only with supporting evidence.",
  NO_ACTION: "No concrete, evidence-backed intervention is justified.",
};

// ---- state builders (facts only, no opinions) -------------------------------
const themes = (s?: ReviewSummary) =>
  (s?.stats ?? []).filter((x) => x.mentions >= 3).slice(0, 12).map((x) => ({
    theme: x.theme, mentions: x.mentions, positive_pct: Math.round(x.positiveRate * 100), negative_pct: Math.round(x.negativeRate * 100),
    common_signals: x.signals.map((g) => g.word).slice(0, 3), recent_trend: x.recentTrend,
  }));

export const placeState = (r: Restaurant, s?: ReviewSummary, extra: Record<string, unknown> = {}) => ({
  name: r.name,
  // detected cuisine; null when detection confidence is LOW (unknown, not "other")
  cuisine: r.foodProfile ? (r.foodProfile.level === "LOW" ? null : r.foodProfile.primary) : r.primaryFoodType,
  cuisine_confidence: r.foodProfile?.level ?? null,
  positioning: r.foodProfile?.modifiers.map((m) => m.key) ?? [],
  format: r.format, rating: r.rating, review_count: r.reviewCount,
  price_level_1_to_4: r.priceKnown === false ? null : r.priceLevel,
  opens_at: r.openingHours?.open ?? null, closes_at: r.openingHours?.close ?? null,
  reviews_analyzed: s?.reviewsAnalyzed ?? 0, themes: themes(s), ...extra,
});

export function competitorState(c: Competitor, s?: ReviewSummary) {
  return placeState(c.restaurant, s, {
    distance_m: Math.round(c.distanceM), relevance_0_100: Math.round(c.relevance), threat_score_0_100: Math.round(c.threatScore),
    adjusted_rating: c.reputation.adjustedRating, reputation_confidence: c.reputation.reputationConfidence,
    threat_level: c.threatLevel, benchmark_quality: c.benchmarkLevel,
  });
}

export const STATE_NOTE = "All percentages are shares of the available public-review sample, not of all customers. Missing data means unknown, not zero.";
