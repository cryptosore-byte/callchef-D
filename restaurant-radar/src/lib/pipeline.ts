import { CONFIG } from "@/config";
import type { DecisionProvider } from "@/providers/DecisionProvider";
import { MockDecisionProvider } from "@/providers/DecisionProvider";
import { JevError, TypeSafeDecisionProvider } from "@/providers/TypeSafeDecisionProvider";
import { ApifyError, ApifyPlacesProvider, BudgetSkipError, DemoPlacesProvider, type PlacesProvider } from "@/providers/ApifyPlacesProvider";
import type { Competitor, CompetitorCandidate, RadarInput, RadarResult, Restaurant, ReviewSummary } from "@/types";
import { makeT, type Locale } from "@/i18n";
import { competitorKeywords } from "@/providers/apify/normalize";
import { confirmCompetitors, scoreCandidates, targetReputation, withThreatScores } from "@/services/CompetitorDetectionService";
import { buildCompetitorCards } from "@/services/CompetitorInsightService";
import { summarizeReviews } from "@/services/ReviewIntelligenceService";
import { computeDataQuality, computeMarketFeatures } from "@/services/MarketFeatureService";
import { computeRadarScore } from "@/services/RadarScoreService";
import { runBattle } from "@/services/BattleModeService";
import { buildEvidence, discoveryInsight, findOpportunities } from "@/services/EvidenceService";
import { runBusinessDecisions } from "@/services/BusinessDecisionService";
import { buildPlanV3 } from "@/services/PlanService";
import { searchQueries, withFoodProfile } from "@/services/FoodTypeDetectionService";
import { runDigitalHealth, sourcesFor, type DigitalSources } from "@/services/DigitalHealthRunner";
import { ProviderBudget } from "@/services/ProviderBudgetService";
import type { ContinuousInput } from "@/services/EvidenceService";
import { menuInsights, type Menu } from "@/services/continuous/MenuIntelligenceService";
import { scenarios } from "@/services/continuous/ScenarioService";
import { expectationGap, findAdvantage } from "@/services/continuous/AdvantageService";
import { buildSummaryState } from "@/services/continuous/SummaryState";
import { CachedDecisionProvider } from "@/providers/CachedDecisionProvider";

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
  competitors?: Pick<Competitor, "restaurant" | "distanceM" | "competitorProbability" | "competitorConfidence" | "reputation" | "threatLevel" | "benchmarkLevel">[];
}
export interface RadarProgress { stage: Stage; partial: RadarPartial; }

const slim = (r: Restaurant): Restaurant => ({ ...r, reviews: [] });

export interface RunOptions {
  decider?: DecisionProvider;
  onProgress?: (p: RadarProgress) => void;
  digitalSources?: DigitalSources;
  budget?: ProviderBudget;
  /** Orchestrator: serve stored + refreshed places instead of a full provider scan. */
  places?: PlacesProvider;
  /** Orchestrator hook, called once the analysis is done and before evidence/decisions (snapshots, changes, experiments). */
  continuous?: (a: AnalysisContext) => { input: ContinuousInput; experimentRule?: { label: string; sufficient: boolean }; menuTarget?: Menu; menuCompetitors?: Menu[] };
}

export interface AnalysisContext {
  target: Restaurant; competitors: Competitor[]; nearby: CompetitorCandidate[]; summary?: ReviewSummary;
  digital?: import("@/services/DigitalHealthRunner").DigitalHealth; budget: ProviderBudget;
}

/** Single entry point. Demo mode needs no keys. `onProgress` fires when each stage starts, with the data known so far. */
export async function runRadar(input: RadarInput, locale: Locale = "en", opts: RunOptions = {}): Promise<RadarResult> {
  const t = makeT(locale);
  const demo = input.demo || !isLive();
  const budget = opts.budget ?? new ProviderBudget("DEEP_SCAN");
  const places: PlacesProvider = opts.places ?? (demo ? new DemoPlacesProvider() : new ApifyPlacesProvider(undefined, undefined, budget));
  // Tests inject a raw decider to observe every request; the app always goes through the decision cache.
  const decider: DecisionProvider = opts.decider ?? new CachedDecisionProvider(demo || !TypeSafeDecisionProvider.isConfigured() ? new MockDecisionProvider() : new TypeSafeDecisionProvider(), budget);
  const warnings: string[] = [];
  if (!demo && decider.engine === "jev-demo") warnings.push(t("warn.noJev"));
  const partial: RadarPartial = { demo };
  const emit = (stage: Stage) => { try { opts.onProgress?.({ stage, partial: { ...partial } }); } catch { /* progress is best-effort */ } };

  emit("find");
  const found = await places.findRestaurant({ name: input.name, address: input.address });
  if (!found) throw new NotConfiguredError(t("warn.notFound"));
  const target = withFoodProfile(found);
  partial.target = slim(target);
  emit("nearby");
  const nearbyRes = await places.findNearby({ center: target, radiusM: input.radiusM, maxResults: CONFIG.limits.maxNearbyRestaurants, keywords: competitorKeywords(target.primaryFoodType, target.format, searchQueries(target.foodProfile)) }, target.id);
  const nearbyRaw = nearbyRes.places.slice(0, CONFIG.limits.maxNearbyRestaurants).map(withFoodProfile);
  // Ranks are only meaningful when the provider exposes them for the places it returned.
  if (nearbyRes.targetRanks.length || nearbyRaw.some((r) => r.searchRanks?.length)) target.searchRanks = nearbyRes.targetRanks;

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
    confirmed0 = nearby.slice(0, CONFIG.limits.maxCompetitorsAnalyzed).map((c) => ({ ...c, competitorProbability: c.relevance / 100, competitorConfidence: 0, threatScore: c.threatPotential }));
  }

  partial.competitors = confirmed0.map((c) => ({ restaurant: slim(c.restaurant), distanceM: c.distanceM, competitorProbability: c.competitorProbability, competitorConfidence: c.competitorConfidence, reputation: c.reputation, threatLevel: c.threatLevel, benchmarkLevel: c.benchmarkLevel }));
  emit("reviews");

  // Review depth is focused: the top strong benchmarks get a real sample, other competitors only market context.
  // Reviews only for confirmed competitors (cost control). Failure degrades gracefully.
  let confirmed = confirmed0;
  const D = CONFIG.reviewDepth;
  const strongIds = new Set(confirmed0.filter((c) => c.benchmarkLevel !== "WEAK").sort((a, b) => b.benchmarkQuality - a.benchmarkQuality).slice(0, D.strongBenchmarkCount).map((c) => c.restaurant.id));
  try {
    const tiers = [
      { rs: confirmed0.filter((c) => strongIds.has(c.restaurant.id)).map((c) => c.restaurant), n: D.strongBenchmark },
      { rs: confirmed0.filter((c) => !strongIds.has(c.restaurant.id)).map((c) => c.restaurant), n: D.secondaryCompetitor },
    ];
    const enriched = new Map<string, Restaurant>();
    for (const tier of tiers) for (const r of await places.enrichWithReviews(tier.rs, tier.n)) enriched.set(r.id, r);
    confirmed = confirmed0.map((c) => ({ ...c, restaurant: enriched.get(c.restaurant.id) ?? c.restaurant }));
  } catch (e) {
    if (!(e instanceof ApifyError) && !(e instanceof BudgetSkipError)) throw e;
    warnings.push(t("warn.reviewsFailed"));
  }

  const summaries: Record<string, ReviewSummary> = { [target.id]: summarizeReviews(target, t) };
  for (const c of confirmed) summaries[c.restaurant.id] = summarizeReviews(c.restaurant, t);
  const competitors = withThreatScores(target, confirmed, summaries);

  const targetRep = targetReputation(target, nearbyRaw);
  const { cards: competitorCards, roles } = buildCompetitorCards(target, targetRep, competitors, summaries);
  const market = computeMarketFeatures(target, nearby, competitors, summaries);
  const radarScore = computeRadarScore(t, target, market, nearby.map((n) => n.restaurant), summaries[target.id]);
  const dataQuality = computeDataQuality(t, summaries[target.id].reviewsAnalyzed, competitors, summaries, nearby.length, target.source.retrievedAt);
  if (!target.reviews.length) warnings.push(t("warn.noReviews"));
  if (!competitors.length) warnings.push(t("warn.noCompetitors"));
  if (dataQuality.level === "LOW") warnings.push(t("warn.lowQuality"));

  emit("decisions");
  const position = radarScore.dimensions.find((d) => d.key === "position")!.score;
  // Battles run alongside the evidence chain (digital sources -> evidence -> Jev decisions).
  const battlesP = Promise.all(competitors.map((c) => runBattle(t, decider, target, summaries[target.id], c, summaries[c.restaurant.id], dataQuality.level)));
  const digital = await runDigitalHealth(target, targetRep, competitors, position, opts.digitalSources ?? sourcesFor(demo, budget));
  const k = opts.continuous?.({ target, competitors, nearby, summary: summaries[target.id], digital, budget });
  const menu = menuInsights(k?.menuTarget, k?.menuCompetitors ?? []);
  const evidence = buildEvidence({ target, targetRep, competitors, summaries, cards: competitorCards, roles, digital, nearbyRestaurants: nearbyRaw, continuous: k ? { ...k.input, menu } : undefined });
  const opportunities = findOpportunities(evidence);
  const discovery = discoveryInsight(evidence);
  const whatIf = scenarios(opportunities);
  const summaryState = buildSummaryState(target, competitors, market, summaries[target.id], digital, k?.input.active);
  const decisions = await runBusinessDecisions(decider, {
    target, summary: summaries[target.id], competitors, roles, evidence, opportunities, dataQuality: dataQuality.level,
    scenarios: whatIf, experimentRule: k?.experimentRule, summaryState,
  });
  const advantage = findAdvantage(target, evidence, digital);
  const brand = [target.description ?? "", digital?.siteText ?? "", digital?.social.profile?.bio ?? ""].filter(Boolean);
  const gap = expectationGap(target, summaries[target.id], brand);
  if (!decisions.available) { decisions.unavailableReason = t("decision.unavailable"); warnings.push(decisions.unavailableReason); }
  const plan = buildPlanV3(decisions, evidence, opportunities, competitorCards, roles);
  const battleList = await battlesP;

  const battles: RadarResult["battles"] = {};
  competitors.forEach((c, i) => { battles[c.restaurant.id] = battleList[i]; });

  return {
    id: demo ? "demo" : target.id, demo, locale, input, target, nearby, competitors, summaries, market, decisions,
    radarScore, battles, plan, dataQuality,
    sources: [target.source], generatedAt: new Date().toISOString(), warnings,
    targetReputation: targetRep, competitorCards, roles, digital, evidence, opportunities, discovery,
    cost: budget.report(),
    scenarios: whatIf, advantage, expectationGap: gap, menuInsights: menu, summaryState,
  };
}
