// Evidence registry, Opportunity Finder and Discovery Insight engine. Deterministic code only.
// Every evidence item is an observed, normalized fact with an id. Decisions may only cite these ids.
import type { Competitor, Level3, Reputation, Restaurant, ReviewSummary, Theme } from "@/types";
import type { CompetitorCard, CompetitorRoles } from "./CompetitorInsightService";
import type { DigitalHealth } from "./DigitalHealthRunner";
import { interval } from "@/lib/util";
import { FOOD_THEMES, getStat, smoothedPositive } from "./ReviewIntelligenceService";

export interface Evidence {
  id: string;                                  // "E1", "E2"...
  kind: string;                                // localized as `evi.<kind>`
  params: Record<string, string | number>;
  strength: Level3;
  /** Decision options this fact supports (an option with no supporting evidence cannot be recommended). */
  supports: string[];
  /** Canonical English statement sent to Jev as structured state. */
  fact: string;
}

export type OpportunityCategory =
  | "PRODUCT" | "DELIVERY_EXPERIENCE" | "PACKAGING" | "AVAILABILITY" | "REPUTATION" | "REVIEWS" | "LOCAL_VISIBILITY"
  | "SOCIAL" | "AI_DISCOVERABILITY" | "VALUE" | "MENU" | "POSITIONING" | "OPERATIONS";
export type Impact = "HIGH" | "MEDIUM_HIGH" | "MEDIUM" | "LOW_MEDIUM" | "LOW";

export interface Opportunity {
  category: OpportunityCategory;
  evidenceIds: string[];
  impact: Impact;
  cost: "LOW" | "MEDIUM" | "HIGH";
  confidence: Level3;
  reversible: boolean;
  weeksToTest: number;
  /** Experiment option (Jev decision 5) this opportunity maps to, if any. */
  experiment?: string;
  /** Localized as `measure.<experiment>`. */
  score: number; // 0..1, used for ordering and by the demo mock only
}

export interface Discovery { code: string; params: Record<string, string | number>; evidenceIds: string[]; }

const GROUPS: { key: string; themes: Theme[] }[] = [
  { key: "FOOD", themes: FOOD_THEMES }, { key: "PORTION", themes: ["PORTION"] }, { key: "SERVICE", themes: ["SERVICE"] },
  { key: "WAITING_TIME", themes: ["WAITING_TIME"] }, { key: "FRIES", themes: ["FRIES"] }, { key: "PACKAGING", themes: ["PACKAGING"] },
  { key: "DELIVERY_EXPERIENCE", themes: ["DELIVERY_EXPERIENCE"] }, { key: "ORDER_ACCURACY", themes: ["ORDER_ACCURACY", "MISSING_ITEMS"] },
  { key: "VALUE_FOR_MONEY", themes: ["VALUE_FOR_MONEY", "PRICE"] },
];
// Which decision options a strength / weakness of each group supports.
// Support keys are namespaced by decision: FOCUS (10 hours), INVEST (500 euros), LEARN, KEEP (do not touch),
// TEST (best experiment), OWN (if we owned it: do), NOT (if we owned it: do not).
const STRENGTH_SUPPORTS: Record<string, string[]> = {
  FOOD: ["KEEP:PRODUCT", "NOT:CHANGE_RECIPE"], PORTION: ["KEEP:PORTIONS", "NOT:REDUCE_PORTIONS"], SERVICE: ["KEEP:SERVICE"],
  VALUE_FOR_MONEY: ["KEEP:PRICING", "NOT:CUT_PRICES", "NOT:RUN_DISCOUNTS"], PACKAGING: ["KEEP:PACKAGING"], DELIVERY_EXPERIENCE: ["KEEP:PACKAGING"],
};
const WEAKNESS_SUPPORTS: Record<string, string[]> = {
  FOOD: ["FOCUS:CUSTOMER_EXPERIENCE", "INVEST:PRODUCT"], SERVICE: ["FOCUS:CUSTOMER_EXPERIENCE", "OWN:IMPROVE_SERVICE"], WAITING_TIME: ["FOCUS:CUSTOMER_EXPERIENCE", "OWN:FIX_WAITING_TIME"],
  FRIES: ["FOCUS:DELIVERY_EXPERIENCE", "INVEST:PACKAGING", "TEST:TEST_NEW_PACKAGING"], PACKAGING: ["FOCUS:DELIVERY_EXPERIENCE", "INVEST:PACKAGING", "TEST:TEST_NEW_PACKAGING"],
  DELIVERY_EXPERIENCE: ["FOCUS:DELIVERY_EXPERIENCE", "INVEST:PACKAGING", "TEST:TEST_NEW_PACKAGING"], ORDER_ACCURACY: ["FOCUS:DELIVERY_EXPERIENCE"],
  VALUE_FOR_MONEY: ["FOCUS:MENU", "TEST:TEST_VALUE_BUNDLE", "INVEST:MENU_OPTIMIZATION"],
};

const weekendCloseMin = (r: Restaurant) => {
  const days = (r.weeklyHours ?? []).filter((d) => d.day === 4 || d.day === 5);
  const src = days.length ? days : r.openingHours ? [r.openingHours] : [];
  return src.length ? Math.max(...src.map((h) => interval(h.open, h.close)[1])) : null;
};
const closeLabel = (r: Restaurant) => {
  const days = (r.weeklyHours ?? []).filter((d) => d.day === 4 || d.day === 5);
  const src = days.length ? days : r.openingHours ? [r.openingHours] : [];
  return src.sort((a, b) => interval(b.open, b.close)[1] - interval(a.open, a.close)[1])[0]?.close ?? "";
};

/** Up to 3 established, comparable places worth learning from. */
export const benchmarkCandidates = (competitors: Competitor[]) =>
  competitors.filter((c) => c.benchmarkLevel !== "WEAK").sort((a, b) => b.benchmarkQuality - a.benchmarkQuality).slice(0, 3);

export interface EvidenceInput {
  target: Restaurant; targetRep: Reputation; competitors: Competitor[]; summaries: Record<string, ReviewSummary>;
  cards: Record<string, CompetitorCard>; roles: CompetitorRoles; digital?: DigitalHealth; nearbyRestaurants: Restaurant[];
}

export function buildEvidence(x: EvidenceInput): Evidence[] {
  const out: Evidence[] = [];
  const add = (kind: string, strength: Level3, supports: string[], params: Evidence["params"], fact: string) =>
    out.push({ id: `E${out.length + 1}`, kind, strength, supports, params, fact });
  const me = x.summaries[x.target.id];

  // 1-2. Review strengths and weaknesses (only with a real sample)
  for (const g of GROUPS) {
    const sp = smoothedPositive(me, g.themes);
    let pos = 0, neg = 0;
    for (const th of g.themes) { const st = me && getStat(me, th); if (st) { pos += st.positive; neg += st.negative; } }
    const n = sp.n;
    if (n >= 10 && pos / n >= 0.75) add("strength", n >= 25 ? "HIGH" : "MEDIUM", STRENGTH_SUPPORTS[g.key] ?? [], { theme: g.key, pos, n }, `${pos} of ${n} available ${g.key.toLowerCase()} mentions are positive.`);
    if (n >= 8 && neg / n >= 0.35) add("weakness", n >= 20 ? "HIGH" : "MEDIUM", WEAKNESS_SUPPORTS[g.key] ?? [], { theme: g.key, neg, n }, `${neg} of ${n} available ${g.key.toLowerCase()} mentions are negative.`);
  }
  // 3. Worsening trends
  for (const st of me?.stats ?? []) {
    if (st.recentTrend !== "worsening" || !st.recency) continue;
    const group = GROUPS.find((g) => g.themes.includes(st.theme))?.key ?? st.theme;
    add("trendWorse", "MEDIUM", WEAKNESS_SUPPORTS[group] ?? ["FOCUS:CUSTOMER_EXPERIENCE"], { theme: group, a: st.recency.recentPer100, b: st.recency.previousPer100 },
      `${st.theme} complaints rose from ${st.recency.previousPer100} to ${st.recency.recentPer100} per 100 reviews in the last 90 days.`);
  }
  // 4. Root-cause hypothesis about delivery holding / packaging
  const rc = me?.rootCauses.find((r) => (r.key === "DELIVERY_HOLDING" || r.key === "PACKAGING") && r.confidence >= 0.5);
  if (rc) add("holding", rc.confidence >= 0.7 ? "HIGH" : "MEDIUM", ["FOCUS:DELIVERY_EXPERIENCE", "INVEST:PACKAGING", "TEST:TEST_NEW_PACKAGING", "NOT:CHANGE_RECIPE"], { p: Math.round(rc.confidence * 100) },
    "Complaints point to food losing heat or texture after it leaves the kitchen (hypothesis from fries, packaging and delivery mentions).");

  // 5. Competitors open later on weekends
  const mine = weekendCloseMin(x.target);
  const direct = x.competitors.filter((c) => c.threatLevel !== "LOW");
  if (mine !== null && direct.length) {
    const later = direct.filter((c) => { const m = weekendCloseMin(c.restaurant); return m !== null && m - mine >= 45; });
    if (later.length >= 2) add("laterCompetitors", later.length >= 3 ? "HIGH" : "MEDIUM", ["FOCUS:OPENING_HOURS", "TEST:EXTEND_WEEKEND_HOURS"],
      { n: later.length, total: direct.length, you: closeLabel(x.target) }, `${later.length} of ${direct.length} direct competitors close later than the target on Friday/Saturday (target closes at ${closeLabel(x.target)}).`);
  }
  if (mine !== null && direct.length >= 2) {
    const earlier = direct.filter((c) => { const m = weekendCloseMin(c.restaurant); return m !== null && mine - m >= 45; });
    if (earlier.length >= Math.max(2, Math.ceil(direct.length / 2))) add("youOpenLater", "MEDIUM", ["KEEP:OPENING_HOURS"], { n: earlier.length, total: direct.length, you: closeLabel(x.target) },
      `The target closes later than ${earlier.length} of ${direct.length} direct competitors on Friday/Saturday.`);
  }
  // 6. Reputation and review volume vs the best benchmark
  const bench = x.competitors.find((c) => c.restaurant.id === x.roles.bestBenchmarkId);
  if (bench) {
    const gap = bench.reputation.adjustedRating - x.targetRep.adjustedRating;
    if (gap >= 0.1) add("benchmarkReputation", bench.reputation.reputationConfidence === "HIGH" ? "HIGH" : "MEDIUM", ["FOCUS:GOOGLE_REPUTATION", "FOCUS:REVIEW_GENERATION", "INVEST:REVIEW_GENERATION", "TEST:RUN_REVIEW_GENERATION_TEST"],
      { name: bench.restaurant.name, a: bench.reputation.adjustedRating, b: x.targetRep.adjustedRating }, `Benchmark ${bench.restaurant.name} has an adjusted rating of ${bench.reputation.adjustedRating} vs ${x.targetRep.adjustedRating} for the target.`);
    if (bench.restaurant.reviewCount >= 2 * Math.max(1, x.target.reviewCount)) add("benchmarkVolume", "MEDIUM", ["FOCUS:REVIEW_GENERATION", "INVEST:REVIEW_GENERATION", "TEST:RUN_REVIEW_GENERATION_TEST"],
      { name: bench.restaurant.name, a: bench.restaurant.reviewCount, b: x.target.reviewCount }, `Benchmark ${bench.restaurant.name} has ${bench.restaurant.reviewCount} Google reviews vs ${x.target.reviewCount} for the target.`);
  }
  // 7. Highest raw rating nearby rests on few reviews (statistically weak)
  const emerging = x.competitors.find((c) => x.roles.emergingThreatIds.includes(c.restaurant.id));
  if (emerging) add("emergingThreat", "HIGH", [], { name: emerging.restaurant.name, r: emerging.restaurant.rating, n: emerging.restaurant.reviewCount, m: Math.round(emerging.distanceM) },
    `${emerging.restaurant.name} (${Math.round(emerging.distanceM)} m) shows ${emerging.restaurant.rating} stars from only ${emerging.restaurant.reviewCount} reviews.`);

  // Benchmark edges, per candidate (LEARN:<option>@<restaurantId>)
  const LEARN_OF: Record<string, (p: Record<string, string | number>) => string | null> = {
    betterReputation: () => "REPUTATION", moreReviews: () => "REPUTATION", openLaterWeekend: () => "OPENING_HOURS", openLater: () => "OPENING_HOURS",
    morePhotos: () => "VISIBILITY", betterTheme: (p) => (p.theme === "VALUE_FOR_MONEY" ? "VALUE" : p.theme === "DELIVERY_EXPERIENCE" ? "DELIVERY_REPUTATION" : null),
  };
  for (const c of benchmarkCandidates(x.competitors)) {
    for (const r of x.cards[c.restaurant.id]?.theyDoBetter ?? []) {
      const opt = LEARN_OF[r.code]?.(r.params ?? {});
      if (opt) add("edge", "MEDIUM", [`LEARN:${opt}@${c.restaurant.id}`, `LEARN:@${c.restaurant.id}`], { name: c.restaurant.name, code: r.code, ...(r.params ?? {}) }, `${c.restaurant.name} does better than the target: ${r.code} ${JSON.stringify(r.params ?? {})}.`);
    }
  }

  const d = x.digital;
  if (d) {
    // 8. Delivery reputation gap
    if (d.reputation.insight?.code === "rep.deliveryGap") add("deliveryGap", "MEDIUM", ["FOCUS:DELIVERY_EXPERIENCE", "INVEST:PACKAGING", "TEST:TEST_NEW_PACKAGING", "NOT:CHANGE_RECIPE"],
      { g: d.reputation.insight.params!.g, d: d.reputation.insight.params!.d }, `Google rating ${d.reputation.insight.params!.g} vs delivery platforms average ${d.reputation.insight.params!.d}.`);
    // 9. Google profile gaps and local search gaps
    const gaps = d.visibility.checks.filter((c) => c.status === "MISSING" && ["vis.photos", "vis.description", "vis.menu", "vis.secondaryCategories", "vis.primaryCategory", "vis.website", "vis.hours"].includes(c.key));
    if (gaps.length) add("profileGap", gaps.length >= 2 ? "HIGH" : "MEDIUM", ["FOCUS:LOCAL_VISIBILITY", "INVEST:GOOGLE_VISIBILITY", "TEST:IMPROVE_GOOGLE_PROFILE", ...(gaps.some((g) => g.key === "vis.photos") ? ["INVEST:PHOTOGRAPHY"] : [])],
      { items: gaps.map((g) => g.key).join(",") }, `Google listing elements missing: ${gaps.map((g) => g.key.replace("vis.", "")).join(", ")}.`);
    const ins = d.visibility.insight;
    if (ins && (ins.code === "vis.gapQuery" || ins.code === "vis.gapRank")) add("searchGap", "MEDIUM", ["FOCUS:LOCAL_VISIBILITY", "FOCUS:POSITIONING", "INVEST:GOOGLE_VISIBILITY", "TEST:UPDATE_POSITIONING", "TEST:IMPROVE_GOOGLE_PROFILE"],
      ins.params ?? {}, `Local search: visible for "${ins.params?.good}" but ${ins.code === "vis.gapQuery" ? `not in the top ${ins.params?.n}` : `only #${ins.params?.r2}`} for "${ins.params?.bad}".`);
    // 10. AI readiness
    const ai = d.ai.insight?.code;
    if (ai && ["ai.noSite", "ai.identityButPositioning", "ai.noSchema", "ai.noMenu"].includes(ai)) add("aiGap", "MEDIUM", ["FOCUS:POSITIONING", "INVEST:WEBSITE", "TEST:UPDATE_POSITIONING"], { code: ai }, `Website readiness issue: ${ai.replace("ai.", "")}.`);
    // 11. Social
    const so = d.social.insight;
    if (so && (so.code === "social.biggerButLessEngaged" || so.code === "social.dormant")) add("socialGap", "MEDIUM", ["FOCUS:INSTAGRAM", "INVEST:INSTAGRAM_CONTENT", "TEST:TEST_INSTAGRAM_CONTENT_PLAN"], so.params ?? {},
      so.code === "social.dormant" ? `Last Instagram post is ${so.params?.d} days old.` : `Target has ${so.params?.a} Instagram followers vs ${so.params?.b} for ${so.params?.name}, whose engagement is ${so.params?.x}x higher relative to audience.`);
    if (so?.code === "social.moreEngaged") add("socialStrength", "MEDIUM", ["KEEP:SOCIAL", "NOT:POST_MORE_ON_INSTAGRAM"], so.params ?? {}, `Target Instagram engagement ${so.params?.a}% vs ${so.params?.b}% for ${so.params?.name}.`);
    // 12. A praised strength that the online presence does not mention
    const strong = out.find((e) => e.kind === "strength" && (e.params.theme === "PORTION" || e.params.theme === "FOOD"));
    const words: Record<string, RegExp> = { PORTION: /portion|copieu|généreu|genereu|generous/i, FOOD: /fait maison|homemade|qualit|frais|fresh/i };
    if (strong && x.target.description) {
      if (!words[strong.params.theme as string].test(x.target.description)) add("strengthNotCommunicated", "MEDIUM", ["FOCUS:POSITIONING", "TEST:UPDATE_POSITIONING"], { theme: strong.params.theme },
        `Customers praise ${String(strong.params.theme).toLowerCase()}, but the Google description does not mention it.`);
    }
  }
  return out;
}

// ---- Opportunity Finder --------------------------------------------------------------------

const OPP: Record<OpportunityCategory, { impact: Impact; cost: Opportunity["cost"]; reversible: boolean; weeks: number; experiment?: string; kinds: (e: Evidence) => boolean }> = {
  AVAILABILITY: { impact: "MEDIUM_HIGH", cost: "LOW", reversible: true, weeks: 4, experiment: "EXTEND_WEEKEND_HOURS", kinds: (e) => e.kind === "laterCompetitors" },
  PACKAGING: { impact: "MEDIUM", cost: "MEDIUM", reversible: true, weeks: 4, experiment: "TEST_NEW_PACKAGING", kinds: (e) => e.kind === "holding" || (e.kind === "weakness" && ["PACKAGING", "FRIES"].includes(String(e.params.theme))) },
  DELIVERY_EXPERIENCE: { impact: "MEDIUM", cost: "LOW", reversible: true, weeks: 4, experiment: "TEST_NEW_PACKAGING", kinds: (e) => e.kind === "deliveryGap" || (e.kind === "weakness" && ["DELIVERY_EXPERIENCE", "ORDER_ACCURACY"].includes(String(e.params.theme))) },
  REVIEWS: { impact: "MEDIUM", cost: "LOW", reversible: true, weeks: 4, experiment: "RUN_REVIEW_GENERATION_TEST", kinds: (e) => e.kind === "benchmarkVolume" },
  REPUTATION: { impact: "MEDIUM", cost: "LOW", reversible: true, weeks: 6, experiment: "RUN_REVIEW_GENERATION_TEST", kinds: (e) => e.kind === "benchmarkReputation" },
  LOCAL_VISIBILITY: { impact: "MEDIUM", cost: "LOW", reversible: true, weeks: 2, experiment: "IMPROVE_GOOGLE_PROFILE", kinds: (e) => e.kind === "profileGap" || e.kind === "searchGap" },
  AI_DISCOVERABILITY: { impact: "LOW_MEDIUM", cost: "LOW", reversible: true, weeks: 4, experiment: "UPDATE_POSITIONING", kinds: (e) => e.kind === "aiGap" },
  POSITIONING: { impact: "MEDIUM", cost: "LOW", reversible: true, weeks: 4, experiment: "UPDATE_POSITIONING", kinds: (e) => e.kind === "strengthNotCommunicated" },
  SOCIAL: { impact: "LOW_MEDIUM", cost: "LOW", reversible: true, weeks: 4, experiment: "TEST_INSTAGRAM_CONTENT_PLAN", kinds: (e) => e.kind === "socialGap" },
  VALUE: { impact: "MEDIUM", cost: "LOW", reversible: true, weeks: 4, experiment: "TEST_VALUE_BUNDLE", kinds: (e) => e.kind === "weakness" && e.params.theme === "VALUE_FOR_MONEY" },
  OPERATIONS: { impact: "MEDIUM", cost: "MEDIUM", reversible: true, weeks: 4, kinds: (e) => (e.kind === "weakness" || e.kind === "trendWorse") && ["WAITING_TIME", "SERVICE"].includes(String(e.params.theme)) },
  PRODUCT: { impact: "HIGH", cost: "MEDIUM", reversible: false, weeks: 6, kinds: (e) => e.kind === "weakness" && e.params.theme === "FOOD" },
  MENU: { impact: "MEDIUM", cost: "MEDIUM", reversible: true, weeks: 4, kinds: () => false }, // no menu data collected: never proposed
};
const IMPACT_W: Record<Impact, number> = { HIGH: 1, MEDIUM_HIGH: 0.85, MEDIUM: 0.7, LOW_MEDIUM: 0.5, LOW: 0.3 };
const LEVEL_W: Record<Level3, number> = { HIGH: 1, MEDIUM: 0.75, LOW: 0.4 };
const COST_W = { LOW: 1, MEDIUM: 0.8, HIGH: 0.55 };

export function findOpportunities(evidence: Evidence[]): Opportunity[] {
  const out: Opportunity[] = [];
  for (const [category, o] of Object.entries(OPP) as [OpportunityCategory, typeof OPP[OpportunityCategory]][]) {
    const ev = evidence.filter(o.kinds);
    if (!ev.length) continue;
    const confidence: Level3 = ev.some((e) => e.strength === "HIGH") && ev.length >= 2 ? "HIGH" : ev.some((e) => e.strength !== "LOW") ? "MEDIUM" : "LOW";
    const score = IMPACT_W[o.impact] * LEVEL_W[confidence] * COST_W[o.cost] * (o.reversible ? 1 : 0.8);
    out.push({ category, evidenceIds: ev.map((e) => e.id), impact: o.impact, cost: o.cost, confidence, reversible: o.reversible, weeksToTest: o.weeks, experiment: o.experiment, score: Number(score.toFixed(3)) });
  }
  return out.sort((a, b) => b.score - a.score);
}

// ---- Discovery Insight: ONE surprising, evidence-backed observation ---------------------------

const SURPRISE: Record<string, number> = {
  deliveryGap: 0.9, emergingThreat: 0.85, socialGap: 0.8, laterCompetitors: 0.75, strengthNotCommunicated: 0.7, searchGap: 0.65, trendWorse: 0.6,
};

export function discoveryInsight(evidence: Evidence[]): Discovery | null {
  const cands = evidence.filter((e) => SURPRISE[e.kind] !== undefined && e.strength !== "LOW");
  if (!cands.length) return null;
  const best = cands.sort((a, b) => SURPRISE[b.kind] - SURPRISE[a.kind])[0];
  // "Strong product but competitors open later" pairs two facts.
  if (best.kind === "laterCompetitors") {
    const food = evidence.find((e) => e.kind === "strength" && e.params.theme === "FOOD");
    if (food) return { code: "disc.strongProductLaterCompetitors", params: { ...best.params, pos: food.params.pos, m: food.params.n }, evidenceIds: [food.id, best.id] };
  }
  return { code: "disc." + best.kind + (best.kind === "socialGap" && best.params.x === undefined ? "Dormant" : ""), params: best.params, evidenceIds: [best.id] };
}
