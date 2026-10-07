import { CONFIG, foodSimilarity, formatSimilarity } from "@/config";
import type { DecisionProvider } from "@/providers/DecisionProvider";
import type { Competitor, CompetitorCandidate, Restaurant, ReviewSummary } from "@/types";
import { clamp, haversineM, hoursOverlapRatio, interval, mean } from "@/lib/util";
import { smoothedPositive } from "./ReviewIntelligenceService";
import { STATE_NOTE, placeState } from "./jevQuestions";

const reputationStrength = (r: Restaurant) =>
  clamp((r.rating / 5) * 0.7 + Math.min(1, Math.log10(r.reviewCount + 1) / 3.5) * 0.3);

/** Deterministic Competitor Relevance Score (0-100). Weights live in CONFIG. */
export function scoreCandidates(target: Restaurant, nearby: Restaurant[], radiusM: number): CompetitorCandidate[] {
  const w = CONFIG.relevanceWeights;
  const out: CompetitorCandidate[] = [];
  for (const r of nearby) {
    if (r.id === target.id) continue;
    const distanceM = haversineM(target.latitude, target.longitude, r.latitude, r.longitude);
    if (distanceM > radiusM) continue;
    const hours = target.openingHours && r.openingHours
      ? hoursOverlapRatio(
          interval(target.openingHours.open, target.openingHours.close),
          interval(r.openingHours.open, r.openingHours.close),
        )
      : 0.5;
    const breakdown = {
      foodType: foodSimilarity(target.primaryFoodType, r.primaryFoodType),
      proximity: clamp(1 - distanceM / radiusM),
      price: 1 - Math.abs(target.priceLevel - r.priceLevel) / 3,
      reputation: reputationStrength(r),
      hours,
      format: formatSimilarity(target.format, r.format),
    };
    const relevance = 100 * (
      w.foodType * breakdown.foodType + w.proximity * breakdown.proximity + w.price * breakdown.price +
      w.reputation * breakdown.reputation + w.hours * breakdown.hours + w.format * breakdown.format
    );
    out.push({ restaurant: r, distanceM, relevance, breakdown });
  }
  return out.sort((a, b) => b.relevance - a.relevance);
}

/** Ask the decision engine: is this a meaningful direct competitor? (binary) */
export async function confirmCompetitors(
  provider: DecisionProvider,
  target: Restaurant,
  candidates: CompetitorCandidate[],
): Promise<Competitor[]> {
  const shortlist = candidates.slice(0, CONFIG.prefilterTopN);
  const state = {
    note: STATE_NOTE,
    target: placeState(target),
    candidates: shortlist.map((c) => ({ ...placeState(c.restaurant), distance_m: Math.round(c.distanceM) })),
  };
  const reqs = shortlist.map((c, i) => ({
    id: `c${i}`,
    question: "Is this restaurant a meaningful direct competitor to the target restaurant?",
    instructions: {
      question: `Is \`candidates[${i}]\` a meaningful direct competitor to \`target\`?`,
      focus: "Would customers realistically choose one instead of the other: similar need, substitutable cuisine, competitive distance, compatible price, overlapping occasion?",
    },
    criteria: {
      true: "Serves a similar need with similar or substitutable food, is close enough, has compatible price positioning and an overlapping consumption occasion.",
      false: "Different cuisine or occasion, too far away, fundamentally different positioning, or substitution is unlikely.",
    },
    context: { candidate: c.restaurant.name },
    // mock only (the real Jev ignores this): relevance sets the level, cuisine similarity gates it
    mockProbability: (() => {
      const base = 1 / (1 + Math.exp(-(c.relevance - 52) / 6));
      return c.breakdown.foodType < 0.4 ? Math.min(base, 0.3) : base;
    })(),
  }));
  const res = await provider.binaryBatch(state, reqs);
  const confirmed: Competitor[] = [];
  shortlist.forEach((c, i) => {
    const r = res[`c${i}`];
    if (r && r.probability >= CONFIG.competitorYesThreshold) {
      confirmed.push({ ...c, competitorProbability: r.probability, competitorConfidence: r.confidence, threatScore: 0 });
    }
  });
  return confirmed
    .sort((a, b) => b.competitorProbability - a.competitorProbability || b.relevance - a.relevance)
    .slice(0, CONFIG.limits.maxCompetitorsAnalyzed);
}

const slim = (r: Restaurant) => ({
  name: r.name, foodType: r.primaryFoodType, format: r.format, rating: r.rating,
  reviewCount: r.reviewCount, priceLevel: r.priceLevel, hours: r.openingHours,
});

/** Threat score (0-100) - an input FEATURE for Decision A, not a decision. */
export function withThreatScores(
  target: Restaurant, competitors: Competitor[], summaries: Record<string, ReviewSummary>,
): Competitor[] {
  return competitors.map((c) => {
    const s = summaries[c.restaurant.id];
    const sentiment = s && s.totalMentions >= 10 ? (s.netSentiment + 1) / 2 : 0.5;
    let hoursEdge = 0;
    if (target.openingHours && c.restaurant.openingHours) {
      const t = interval(target.openingHours.open, target.openingHours.close);
      const o = interval(c.restaurant.openingHours.open, c.restaurant.openingHours.close);
      hoursEdge = clamp(((o[1] - o[0]) - (t[1] - t[0])) / 60 / 6);
    }
    const ratingEdge = clamp(0.5 + (c.restaurant.rating - target.rating) / 1.0);
    const score = 100 * (
      0.3 * (c.relevance / 100) + 0.15 * c.breakdown.proximity + 0.15 * ratingEdge +
      0.1 * reputationStrength(c.restaurant) + 0.15 * sentiment + 0.15 * hoursEdge
    );
    return { ...c, threatScore: score };
  }).sort((a, b) => b.threatScore - a.threatScore);
}

export const avgCompetitorPositive = (summaries: ReviewSummary[], themes: Parameters<typeof smoothedPositive>[1]) => {
  const vals = summaries.map((s) => smoothedPositive(s, themes)).filter((x) => x.n >= 5).map((x) => x.value);
  return vals.length ? mean(vals) : null;
};
