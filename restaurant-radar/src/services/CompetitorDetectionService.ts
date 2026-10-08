import { CONFIG, foodSimilarity, formatSimilarity } from "@/config";
import type { DecisionProvider } from "@/providers/DecisionProvider";
import type { BenchmarkLevel, Competitor, CompetitorCandidate, Level3, Reason, RelevanceBreakdown, Reputation, Restaurant, ReviewSummary } from "@/types";
import { cuisineSimilarity, occasionSimilarity } from "./FoodTypeDetectionService";
import { marketAverage, reputationOf } from "./ReputationService";
import { clamp, haversineM, hoursOverlapRatio, interval, mean } from "@/lib/util";
import { smoothedPositive } from "./ReviewIntelligenceService";
import { STATE_NOTE, placeState } from "./jevQuestions";

const logCount = (n: number) => Math.log10(Math.max(0, n) + 1);
/** 1 = same order of magnitude of reviews, 0 = two orders apart. */
export const volumeComparability = (a: number, b: number) => clamp(1 - Math.abs(logCount(a) - logCount(b)) / 2);
const priceKnown = (r: Restaurant) => r.priceKnown !== false;

function threatOf(target: Restaurant, b: Omit<RelevanceBreakdown, "reviewVolume" | "format">, rep: Reputation, targetRep: Reputation, distanceM: number, r: Restaurant) {
  const w = CONFIG.threatWeights;
  // Momentum: adjusted (not raw) rating edge, so 12 reviews at 5.0 do not count as a proven lead.
  const momentum = clamp(0.5 + (rep.adjustedRating - targetRep.adjustedRating) / 0.6);
  const score = 100 * (w.foodType * b.foodType + w.proximity * b.proximity + w.occasion * b.occasion + w.hours * b.hours + w.price * b.price + w.momentum * momentum);
  const reasons: Reason[] = [];
  reasons.push({ code: "distance", params: { m: Math.round(distanceM) } });
  if (b.foodType >= 0.85) reasons.push({ code: b.foodType === 1 ? "sameCuisine" : "sameFamily" });
  else if (b.foodType >= 0.45) reasons.push({ code: "relatedCuisine" });
  if (b.occasion >= 0.5 && r.foodProfile && target.foodProfile) reasons.push({ code: "sameOccasion" });
  if (b.hours >= 0.8) reasons.push({ code: "sameHours" });
  if (b.priceKnown && b.price >= 0.99) reasons.push({ code: "samePrice" });
  const level: Level3 = score >= CONFIG.threatLevels.high ? "HIGH" : score >= CONFIG.threatLevels.medium ? "MEDIUM" : "LOW";
  return { score, level, reasons };
}

function benchmarkOf(b: RelevanceBreakdown, rep: Reputation) {
  const w = CONFIG.benchmarkWeights;
  const L = CONFIG.benchmarkLevels;
  const similarity = (b.foodType + b.occasion + b.format) / 3;
  const volume = clamp(logCount(rep.reviewCount) / logCount(CONFIG.benchmarkVolumeRef));
  const reputation = clamp(0.5 + (rep.adjustedRating - rep.marketAverage) / 1.0);
  const score = 100 * (w.similarity * similarity + w.volume * volume + w.reputation * reputation);
  const level: BenchmarkLevel = score >= L.strong && rep.reviewCount >= L.strongMinReviews && similarity >= L.strongMinSimilarity ? "STRONG"
    : score >= L.medium && rep.reviewCount >= L.mediumMinReviews && similarity >= L.mediumMinSimilarity ? "MEDIUM" : "WEAK";
  const reasons: Reason[] = [];
  if (rep.reviewCount < L.mediumMinReviews) reasons.push({ code: "fewReviews", params: { n: rep.reviewCount } });
  else reasons.push({ code: "manyReviews", params: { n: rep.reviewCount } });
  reasons.push({ code: similarity >= 0.7 ? "similarConcept" : similarity >= 0.45 ? "partlySimilarConcept" : "differentConcept" });
  if (rep.adjustedRating - rep.marketAverage >= 0.15 && rep.reputationConfidence !== "LOW") reasons.push({ code: "strongReputation", params: { r: rep.adjustedRating.toFixed(2) } });
  return { score, level, reasons };
}

/** Deterministic Competitor Relevance Score V2 (0-100), plus threat potential and benchmark quality. Weights live in CONFIG. */
export function scoreCandidates(target: Restaurant, nearby: Restaurant[], radiusM: number): CompetitorCandidate[] {
  const w = CONFIG.relevanceWeights;
  const C = marketAverage([target, ...nearby]);
  const targetRep = reputationOf(target, C);
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
    const bothPrices = priceKnown(target) && priceKnown(r);
    const foodType = target.foodProfile && r.foodProfile && target.foodProfile.level !== "LOW" && r.foodProfile.level !== "LOW"
      ? cuisineSimilarity(target.foodProfile.primary, r.foodProfile.primary)
      : foodSimilarity(target.primaryFoodType, r.primaryFoodType);
    const breakdown: RelevanceBreakdown = {
      foodType,
      occasion: occasionSimilarity(target.foodProfile, r.foodProfile),
      proximity: clamp(1 - distanceM / radiusM),
      price: bothPrices ? 1 - Math.abs(target.priceLevel - r.priceLevel) / 3 : 0.5,
      reviewVolume: volumeComparability(target.reviewCount, r.reviewCount),
      hours,
      format: formatSimilarity(target.format, r.format),
      priceKnown: bothPrices,
    };
    const relevance = 100 * (
      w.foodType * breakdown.foodType + w.occasion * breakdown.occasion + w.proximity * breakdown.proximity +
      w.price * breakdown.price + w.reviewVolume * breakdown.reviewVolume + w.hours * breakdown.hours + w.format * breakdown.format
    );
    const reputation = reputationOf(r, C);
    const threat = threatOf(target, breakdown, reputation, targetRep, distanceM, r);
    const bench = benchmarkOf(breakdown, reputation);
    out.push({
      restaurant: r, distanceM, relevance, breakdown, reputation,
      threatPotential: threat.score, threatLevel: threat.level, threatReasons: threat.reasons,
      benchmarkQuality: bench.score, benchmarkLevel: bench.level, benchmarkReasons: bench.reasons,
    });
  }
  return out.sort((a, b) => b.relevance - a.relevance);
}

/** Reputation of the target itself, on the same market prior as its competitors. */
export function targetReputation(target: Restaurant, nearby: Restaurant[]): Reputation {
  return reputationOf(target, marketAverage([target, ...nearby]));
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
      confirmed.push({ ...c, competitorProbability: r.probability, competitorConfidence: r.confidence, threatScore: c.threatPotential });
    } else {
      c.rejectionReasons = [{ code: "decisionNo", params: { p: Math.round((r?.probability ?? 0) * 100) } }];
    }
  });
  candidates.slice(CONFIG.prefilterTopN).forEach((c) => { c.rejectionReasons = [{ code: "lowRelevance", params: { s: Math.round(c.relevance) } }]; });
  return confirmed
    .sort((a, b) => b.competitorProbability - a.competitorProbability || b.relevance - a.relevance)
    .slice(0, CONFIG.limits.maxCompetitorsAnalyzed);
}

/**
 * Threat score (0-100) after reviews are read: threat potential, nudged by the competitor's own review sentiment
 * when the sample is large enough. Input FEATURE for decisions, not a decision.
 */
export function withThreatScores(
  _target: Restaurant, competitors: Competitor[], summaries: Record<string, ReviewSummary>,
): Competitor[] {
  return competitors.map((c) => {
    const s = summaries[c.restaurant.id];
    const sentiment = s && s.totalMentions >= 10 ? (s.netSentiment + 1) / 2 : 0.5;
    const threatScore = clamp(c.threatPotential / 100 * 0.9 + 0.1 * sentiment) * 100;
    return { ...c, threatScore };
  }).sort((a, b) => b.threatScore - a.threatScore);
}

export const avgCompetitorPositive = (summaries: ReviewSummary[], themes: Parameters<typeof smoothedPositive>[1]) => {
  const vals = summaries.map((s) => smoothedPositive(s, themes)).filter((x) => x.n >= 5).map((x) => x.value);
  return vals.length ? mean(vals) : null;
};
