import { CONFIG } from "@/config";
import type { DecisionProvider } from "@/providers/DecisionProvider";
import { MockDecisionProvider } from "@/providers/DecisionProvider";
import { JevError, TypeSafeDecisionProvider } from "@/providers/TypeSafeDecisionProvider";
import { ApifyError, ApifyPlacesProvider, DemoPlacesProvider, type PlacesProvider } from "@/providers/ApifyPlacesProvider";
import type { Competitor, CompetitorCandidate, RadarInput, RadarResult, Restaurant, ReviewSummary } from "@/types";
import { makeT, type Locale } from "@/i18n";
import { competitorKeywords } from "@/providers/apify/normalize";
import { confirmCompetitors, scoreCandidates, withThreatScores } from "@/services/CompetitorDetectionService";
import { summarizeReviews } from "@/services/ReviewIntelligenceService";
import { computeDataQuality, computeMarketFeatures } from "@/services/MarketFeatureService";
import { computeRadarScore } from "@/services/RadarScoreService";
import { runJevDecisions, type DecisionContext } from "@/services/JevDecisionService";
import { buildPlan, runBattle } from "@/services/BattleModeService";

export class NotConfiguredError extends Error {}

export function isLive() {
  return ApifyPlacesProvider.isConfigured();
}
export { ApifyError, JevError };

import { STAGES, type Stage } from "@/lib/stages";
export { STAGES, type Stage };

/** Early, real data revealed before the full result (never estimated values). */
export interface RadarPartial {
  demo: boolean;
  target?: Restaurant;
  nearbyCount?: number;
  /** Confirmed competitors before their reviews are read: no threat score yet. */
  competitors?: Pick<Competitor, "restaurant" | "distanceM" | "competitorProbability" | "competitorConfidence">[];
}
export interface RadarProgress { stage: Stage; partial: RadarPartial; }

const slim = (r: Restaurant): Restaurant => ({ ...r, reviews: [] });

/** Single entry point. Demo mode needs no keys. `onProgress` fires when each stage starts, with the data known so far. */
export async function runRadar(input: RadarInput, locale: Locale = "en", opts: { decider?: DecisionProvider; onProgress?: (p: RadarProgress) => void } = {}): Promise<RadarResult> {
  const t = makeT(locale);
  const demo = input.demo || !isLive();
  const places: PlacesProvider = demo ? new DemoPlacesProvider() : new ApifyPlacesProvider();
  const decider: DecisionProvider = opts.decider ?? (demo || !TypeSafeDecisionProvider.isConfigured() ? new MockDecisionProvider() : new TypeSafeDecisionProvider());
  const warnings: string[] = [];
  if (!demo && decider.engine === "jev-demo") warnings.push(t("warn.noJev"));
  const partial: RadarPartial = { demo };
  const emit = (stage: Stage) => { try { opts.onProgress?.({ stage, partial: { ...partial } }); } catch { /* progress is best-effort */ } };

  emit("find");
  const target = await places.findRestaurant({ name: input.name, address: input.address });
  if (!target) throw new NotConfiguredError(t("warn.notFound"));
  partial.target = slim(target);
  emit("nearby");
  const nearbyRaw = (await places.findNearby({ center: target, radiusM: input.radiusM, maxResults: CONFIG.limits.maxNearbyRestaurants, keywords: competitorKeywords(target.primaryFoodType, target.format) }, target.id))
    .slice(0, CONFIG.limits.maxNearbyRestaurants);

  const nearby: CompetitorCandidate[] = scoreCandidates(target, nearbyRaw, input.radiusM);
  partial.nearbyCount = nearby.length;
  emit("competitors");
  let confirmed0: Awaited<ReturnType<typeof confirmCompetitors>>;
  try {
    confirmed0 = await confirmCompetitors(decider, target, nearby);
  } catch (e) {
    if (!(e instanceof JevError)) throw e;
    // Jev unavailable: keep market data. Competitors are the deterministic top candidates, flagged as unconfirmed.
    warnings.push(t("warn.jevCompetitors"));
    confirmed0 = nearby.slice(0, CONFIG.limits.maxCompetitorsAnalyzed).map((c) => ({ ...c, competitorProbability: c.relevance / 100, competitorConfidence: 0, threatScore: 0 }));
  }

  partial.competitors = confirmed0.map((c) => ({ restaurant: slim(c.restaurant), distanceM: c.distanceM, competitorProbability: c.competitorProbability, competitorConfidence: c.competitorConfidence }));
  emit("reviews");

  // Reviews only for confirmed competitors (cost control). Failure degrades gracefully.
  let confirmed = confirmed0;
  try {
    const enriched = await places.enrichWithReviews(confirmed0.map((c) => c.restaurant), CONFIG.limits.maxReviewsPerCompetitor);
    confirmed = confirmed0.map((c, i) => ({ ...c, restaurant: enriched[i] }));
  } catch (e) {
    if (!(e instanceof ApifyError)) throw e;
    warnings.push(t("warn.reviewsFailed"));
  }

  const summaries: Record<string, ReviewSummary> = { [target.id]: summarizeReviews(target, t) };
  for (const c of confirmed) summaries[c.restaurant.id] = summarizeReviews(c.restaurant, t);
  const competitors = withThreatScores(target, confirmed, summaries);

  const market = computeMarketFeatures(target, nearby, competitors, summaries);
  const radarScore = computeRadarScore(t, target, market, nearby.map((n) => n.restaurant), summaries[target.id]);
  const dataQuality = computeDataQuality(t, summaries[target.id].reviewsAnalyzed, competitors, summaries, nearby.length, target.source.retrievedAt);
  if (!target.reviews.length) warnings.push(t("warn.noReviews"));
  if (!competitors.length) warnings.push(t("warn.noCompetitors"));
  if (dataQuality.level === "LOW") warnings.push(t("warn.lowQuality"));

  const ctx: DecisionContext = {
    target, competitors, market, summaries,
    differentiationScore: radarScore.dimensions.find((d) => d.key === "differentiation")!.score,
    dataQuality: dataQuality.level, t,
  };
  emit("decisions");
  // Decisions and battles are independent: run them together.
  const [decisions, battleList] = await Promise.all([
    runJevDecisions(decider, ctx),
    Promise.all(competitors.map((c) => runBattle(t, decider, target, summaries[target.id], c, summaries[c.restaurant.id], dataQuality.level))),
  ]);
  if (!decisions.available && decisions.unavailableReason) warnings.push(decisions.unavailableReason);

  const battles: RadarResult["battles"] = {};
  competitors.forEach((c, i) => { battles[c.restaurant.id] = battleList[i]; });
  const plan = await buildPlan(decider, ctx, decisions).catch(() => undefined);

  return {
    id: demo ? "demo" : target.id, demo, locale, input, target, nearby, competitors, summaries, market, decisions,
    radarScore, battles, plan, dataQuality,
    sources: [target.source], generatedAt: new Date().toISOString(), warnings,
  };
}
