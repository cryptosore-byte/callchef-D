// Jev V3: business decisions over normalized, numbered evidence.
// Rules: Jev only sees structured facts; it only chooses among options that at least one fact supports
// (plus an explicit "no action" option); every answer carries the ids of the facts that support it.
// When nothing is supported, no question is asked and "no supported action" is returned: never a forced answer.
import { CONFIG } from "@/config";
import { tierFor, type ChoiceRequest, type DecisionProvider } from "@/providers/DecisionProvider";
import type { Competitor, ConfidenceTier, DataQualityLevel, Restaurant, ReviewSummary } from "@/types";
import { benchmarkCandidates, type Evidence, type Opportunity } from "./EvidenceService";
import { STATE_NOTE, placeState } from "./jevQuestions";
import type { CompetitorRoles } from "./CompetitorInsightService";

export type DecisionId = "FOCUS_10H" | "INVEST_500" | "LEARN_FROM" | "WHAT_TO_LEARN" | "DONT_TOUCH" | "BEST_TEST" | "OWNER_DO" | "OWNER_NOT"
  | "THIS_WEEK" | "WATCH" | "EXPERIMENT_RESULT" | "SCENARIO" | "MENU_ACTION";

export interface BusinessDecision {
  id: DecisionId;
  choice: string;
  /** 0..1 after data-quality adjustment. Shown only in debug; the owner sees `tier`. */
  confidence: number;
  rawConfidence: number;
  distribution: { option: string; probability: number }[];
  tier: ConfidenceTier;
  supportingEvidenceIds: string[];
  engine: "jev" | "jev-demo" | "rule";
  /** LEARN_FROM: chosen restaurant id. */
  restaurantId?: string;
}

export interface DecisionSetV3 {
  available: boolean;
  unavailableReason?: string;
  focus10h?: BusinessDecision;
  invest500?: BusinessDecision;       // absent when evidence is not sufficient: never forced
  learnFrom?: BusinessDecision;
  whatToLearn?: BusinessDecision;
  dontTouch?: BusinessDecision;
  bestTest?: BusinessDecision;
  owner?: { action: BusinessDecision; notDo: BusinessDecision; why: string[] };
  // ---- V4: owner actions ----
  thisWeek?: BusinessDecision;
  /** Chosen competitor (restaurantId) or signal ("SIGNAL_<THEME>"). */
  watch?: BusinessDecision;
  experimentResult?: BusinessDecision;
  /** One verdict per "what if" scenario: TEST / NOT_PRIORITY / INSUFFICIENT_EVIDENCE. */
  scenarios?: Record<string, BusinessDecision>;
  menuAction?: BusinessDecision;
  /** Debug: exact state and questions sent to the decision engine. */
  debug?: { state: unknown; questions: { id: string; options: string[] }[] };
}

const FOCUS = ["CUSTOMER_EXPERIENCE", "DELIVERY_EXPERIENCE", "GOOGLE_REPUTATION", "LOCAL_VISIBILITY", "INSTAGRAM", "MENU", "OPENING_HOURS", "POSITIONING", "REVIEW_GENERATION"];
const INVEST = ["PACKAGING", "PRODUCT", "PHOTOGRAPHY", "GOOGLE_VISIBILITY", "WEBSITE", "INSTAGRAM_CONTENT", "PROMOTION", "REVIEW_GENERATION", "MENU_OPTIMIZATION"];
const LEARN = ["REPUTATION", "OPENING_HOURS", "SOCIAL", "MENU", "POSITIONING", "VALUE", "VISIBILITY", "DELIVERY_REPUTATION"];
const KEEP = ["PRODUCT", "PORTIONS", "PRICING", "OPENING_HOURS", "SOCIAL", "MENU", "SERVICE", "PACKAGING"];
const TESTS = ["EXTEND_WEEKEND_HOURS", "TEST_NEW_PACKAGING", "TEST_VALUE_BUNDLE", "IMPROVE_GOOGLE_PROFILE", "RUN_REVIEW_GENERATION_TEST", "TEST_MENU_RESTRUCTURE", "TEST_INSTAGRAM_CONTENT_PLAN", "UPDATE_POSITIONING"];
const OWN_EXTRA = ["FIX_WAITING_TIME", "IMPROVE_SERVICE"];
const NOT = ["CHANGE_RECIPE", "CUT_PRICES", "REDUCE_PORTIONS", "RUN_DISCOUNTS", "POST_MORE_ON_INSTAGRAM"];

export const NONE: Record<string, string> = {
  FOCUS_10H: "NO_ACTION", INVEST_500: "NO_INVESTMENT", LEARN_FROM: "NO_BENCHMARK", WHAT_TO_LEARN: "NO_CLEAR_LESSON",
  DONT_TOUCH: "NO_CLEAR_AREA", BEST_TEST: "NO_SUPPORTED_TEST", OWNER_DO: "NO_SUPPORTED_ACTION", OWNER_NOT: "NO_CLEAR_DISTRACTION",
  THIS_WEEK: "NO_ACTION", WATCH: "NOTHING_SPECIFIC", EXPERIMENT_RESULT: "INCONCLUSIVE", SCENARIO: "INSUFFICIENT_EVIDENCE", MENU_ACTION: "NO_MENU_ACTION",
};

// Option meanings (criteria). Facts are referenced by id; meanings stay generic and reusable.
const MEANING: Record<string, string> = {
  CUSTOMER_EXPERIENCE: "Work on the in-restaurant experience (service, waiting time, food consistency).",
  DELIVERY_EXPERIENCE: "Work on what happens after the order leaves the kitchen (holding, packaging, delivery accuracy).",
  GOOGLE_REPUTATION: "Work on the Google rating relative to comparable competitors.",
  LOCAL_VISIBILITY: "Complete and improve the Google listing and local search presence.",
  INSTAGRAM: "Work on Instagram content and engagement.",
  MENU: "Rework the menu or the offer structure.",
  OPENING_HOURS: "Change opening hours to cover times when direct competitors capture customers.",
  POSITIONING: "Make the restaurant's distinctive positioning explicit online.",
  REVIEW_GENERATION: "Ask satisfied customers for reviews to build review volume.",
  PACKAGING: "Spend on packaging that keeps food hot and intact.", PRODUCT: "Spend on the core product.",
  PHOTOGRAPHY: "Spend on professional photos for the listing.", GOOGLE_VISIBILITY: "Spend on completing and improving the Google listing.",
  WEBSITE: "Spend on a clear website with structured data and a text menu.", INSTAGRAM_CONTENT: "Spend on Instagram content production.",
  PROMOTION: "Spend on a promotion.", MENU_OPTIMIZATION: "Spend on menu redesign.",
  REPUTATION: "How they built their Google reputation and review volume.", SOCIAL: "Their social media approach.",
  VALUE: "How they deliver perceived value for money.", VISIBILITY: "How they present their listing (photos, completeness).",
  DELIVERY_REPUTATION: "How they keep delivery customers satisfied.",
  PORTIONS: "Portion sizes.", PRICING: "Current prices.", SERVICE: "Service.",
  EXTEND_WEEKEND_HOURS: "Stay open one hour later on Friday and Saturday for 4 weekends.",
  TEST_NEW_PACKAGING: "Test vented / insulated packaging for delivery orders for 4 weeks.",
  TEST_VALUE_BUNDLE: "Test a fixed-price bundle for 4 weeks.",
  IMPROVE_GOOGLE_PROFILE: "Complete the Google listing (photos, description, categories, menu link).",
  RUN_REVIEW_GENERATION_TEST: "Ask every satisfied customer for a Google review for 4 weeks.",
  TEST_MENU_RESTRUCTURE: "Test a restructured menu.", TEST_INSTAGRAM_CONTENT_PLAN: "Test a 4-week content plan (regular reels).",
  UPDATE_POSITIONING: "Rewrite the Google description and website text to state the cuisine and what customers praise.",
  FIX_WAITING_TIME: "Reduce waiting time at peak hours.", IMPROVE_SERVICE: "Retrain the team on service.",
  CHANGE_RECIPE: "Changing the core recipe.", CUT_PRICES: "Cutting prices.", REDUCE_PORTIONS: "Reducing portions.",
  RUN_DISCOUNTS: "Running discounts.", POST_MORE_ON_INSTAGRAM: "Simply posting more on Instagram.",
  NO_ACTION: "No area has enough supporting evidence.", NO_INVESTMENT: "Do not spend: no investment is clearly supported.",
  NO_BENCHMARK: "No comparable, established restaurant to learn from.", NO_CLEAR_LESSON: "Nothing specific to learn from this restaurant.",
  NO_CLEAR_AREA: "No area is clearly performing well.", NO_SUPPORTED_TEST: "No experiment is supported by the evidence.",
  NO_SUPPORTED_ACTION: "No single priority is supported by the evidence.", NO_CLEAR_DISTRACTION: "No common distraction is contradicted by the evidence.",
  CONTINUE_EXPERIMENT: "Keep the running experiment going and change nothing else, so its result stays readable.",
  NOTHING_SPECIFIC: "Nothing specific needs watching this week.",
  PROMISING: "The measured change is clearly in the hoped direction, but causality is not proven.",
  NO_CLEAR_EFFECT: "The measured change is too small to tell.", NEGATIVE: "The measured change goes in the wrong direction.",
  INCONCLUSIVE: "The measurement is too thin or too noisy to conclude.",
  TEST: "Worth testing now: supported, cheap and reversible.", NOT_PRIORITY: "Supported but less useful than another test right now.",
  INSUFFICIENT_EVIDENCE: "Not enough evidence to justify it.",
  SIMPLIFY_MENU: "Test a shorter menu.", PROMOTE_HERO_PRODUCT: "Put one signature product forward.", NO_MENU_ACTION: "No menu change is supported.",
};

const STRENGTH_W = { HIGH: 1, MEDIUM: 0.7, LOW: 0.35 } as const;

export interface DecisionInputV3 {
  target: Restaurant; summary?: ReviewSummary; competitors: Competitor[]; roles: CompetitorRoles;
  evidence: Evidence[]; opportunities: Opportunity[]; dataQuality: DataQualityLevel;
  /** V4 context: scenarios to label and whether a finished experiment needs a verdict. */
  scenarios?: { experiment: string; evidenceIds: string[] }[];
  /** Rule verdict for the last finished experiment; when not sufficient, no question is asked. */
  experimentRule?: { label: string; sufficient: boolean };
  /** Small normalized summary shared with Jev (never raw reviews). */
  summaryState?: Record<string, unknown>;
}

/** Evidence ids supporting `ns:option` (optionally scoped to a restaurant: `LEARN:VALUE@id`). */
const supportFor = (evidence: Evidence[], key: string) => evidence.filter((e) => e.supports.includes(key)).map((e) => e.id);

interface Q { id: DecisionId; question: string; options: string[]; ns: string; scope?: string; labels?: Record<string, string>; }

export async function runBusinessDecisions(provider: DecisionProvider, x: DecisionInputV3): Promise<DecisionSetV3> {
  const ev = x.evidence;
  const evById = new Map(ev.map((e) => [e.id, e]));
  const supported = (ns: string, opts: string[], scope = "") => opts.filter((o) => supportFor(ev, `${ns}:${o}${scope}`).length > 0);
  const benchmarks = benchmarkCandidates(x.competitors);
  const qs: Q[] = [
    { id: "FOCUS_10H", ns: "FOCUS", options: supported("FOCUS", FOCUS), question: "Given the facts, where would the next 10 hours of the owner's attention most likely create the highest value?" },
    { id: "DONT_TOUCH", ns: "KEEP", options: supported("KEEP", KEEP), question: "Which area is currently performing strongly and should NOT be changed in the next 30 days?" },
    { id: "BEST_TEST", ns: "TEST", options: supported("TEST", TESTS), question: "Which single experiment best combines potential impact, evidence strength, low cost, reversibility and speed of learning for the next 30 days?" },
    { id: "OWNER_DO", ns: "OWN", options: [...supported("TEST", TESTS), ...supported("OWN", OWN_EXTRA)], question: "If you owned this restaurant for the next 30 days, what ONE priority would you choose?" },
    { id: "OWNER_NOT", ns: "NOT", options: supported("NOT", NOT), question: "Which commonly considered change does the evidence argue AGAINST doing in the next 30 days?" },
  ];
  // 500 euros: only asked when a supported investment rests on at least MEDIUM-confidence opportunities.
  const investOpts = supported("INVEST", INVEST);
  if (investOpts.length && x.opportunities.some((o) => o.confidence !== "LOW" && o.cost !== "HIGH")) {
    qs.push({ id: "INVEST_500", ns: "INVEST", options: investOpts, question: "Where should the next 500 euros go? Do not recommend spending merely to produce an answer." });
  }
  // Who to learn from: established benchmarks only; what to learn is asked speculatively for each candidate.
  const byName: Record<string, string> = {};
  if (benchmarks.length) {
    for (const b of benchmarks) byName[b.restaurant.name] = b.restaurant.id;
    qs.push({ id: "LEARN_FROM", ns: "LEARN", options: benchmarks.map((b) => b.restaurant.name), question: "Which established, comparable restaurant is the most useful to learn from (not necessarily the biggest threat)?" });
  }

  // ---- V4: owner actions
  const WEEK_OPTS = [...supported("TEST", TESTS), ...supported("OWN", OWN_EXTRA), ...supported("WEEK", ["CONTINUE_EXPERIMENT"])];
  qs.push({ id: "THIS_WEEK", ns: "WEEK", options: [...new Set(WEEK_OPTS)], question: "What is the ONE thing the owner should do this week? If an experiment is running, prefer protecting its measurement over starting something new." });
  const watchIds = [...new Set(ev.flatMap((e) => e.supports).filter((k) => k.startsWith("WATCH:@")).map((k) => k.slice(7)))];
  const watchSignals = [...new Set(ev.flatMap((e) => e.supports).filter((k) => k.startsWith("WATCH:SIGNAL_")).map((k) => k.slice(6)))];
  const watchNames: Record<string, string> = {};
  for (const id of watchIds) { const c = x.competitors.find((cc) => cc.restaurant.id === id); if (c) watchNames[c.restaurant.name] = id; }
  qs.push({ id: "WATCH", ns: "WATCH", options: [...Object.keys(watchNames), ...watchSignals], question: "Which ONE competitor or signal should the owner keep an eye on this week?" });
  if (x.experimentRule?.sufficient) qs.push({ id: "EXPERIMENT_RESULT", ns: "RESULT", options: ["PROMISING", "NO_CLEAR_EFFECT", "NEGATIVE"], question: "Given the measured before/after values in `facts`, how should the previous experiment be read? Do not claim causality; use only the measurements given." });
  const menuOpts = supported("MENU", ["TEST_VALUE_BUNDLE", "SIMPLIFY_MENU", "PROMOTE_HERO_PRODUCT"]);
  if (menuOpts.length) qs.push({ id: "MENU_ACTION", ns: "MENU", options: menuOpts, question: "Which menu action, if any, is best supported by the menu facts?" });

  const state = {
    summary: x.summaryState ?? {},
    note: STATE_NOTE + " Each fact has an id; only these facts may be used.",
    target: placeState(x.target, x.summary),
    facts: ev.map((e) => ({ id: e.id, fact: e.fact, strength: e.strength })),
    opportunities: x.opportunities.map((o) => ({ category: o.category, experiment: o.experiment ?? null, evidence_ids: o.evidenceIds, impact: o.impact, cost: o.cost, confidence: o.confidence, reversible: o.reversible, weeks_to_test: o.weeksToTest })),
    competitors: x.competitors.map((c) => ({
      name: c.restaurant.name, distance_m: Math.round(c.distanceM), rating: c.restaurant.rating, review_count: c.restaurant.reviewCount,
      adjusted_rating: c.reputation.adjustedRating, threat_level: c.threatLevel, benchmark_quality: c.benchmarkLevel,
      role: c.restaurant.id === x.roles.topThreatId ? "main_threat" : c.restaurant.id === x.roles.bestBenchmarkId ? "best_benchmark" : x.roles.emergingThreatIds.includes(c.restaurant.id) ? "emerging_threat" : "competitor",
    })),
  };

  // Evidence ids supporting option `o` of question `qid` (the single rule used for criteria, mock and answers).
  const scenarioIds = Object.fromEntries((x.scenarios ?? []).map((sc) => [`SCENARIO:${sc.experiment}`, sc.evidenceIds]));
  const idsFor = (qid: string, ns: string, o: string, scope = ""): string[] => {
    if (qid === "OWNER_DO") return [...supportFor(ev, `TEST:${o}`), ...supportFor(ev, `OWN:${o}`)];
    if (qid === "THIS_WEEK") return [...supportFor(ev, `TEST:${o}`), ...supportFor(ev, `OWN:${o}`), ...supportFor(ev, `WEEK:${o}`)];
    if (qid === "LEARN_FROM") return supportFor(ev, `LEARN:@${byName[o]}`);
    if (qid === "WATCH") return supportFor(ev, watchNames[o] ? `WATCH:@${watchNames[o]}` : `WATCH:${o}`);
    if (qid === "EXPERIMENT_RESULT") return supportFor(ev, `RESULT:${o}`);
    if (qid.startsWith("SCENARIO:")) return o === NONE.SCENARIO ? [] : scenarioIds[qid] ?? [];
    return supportFor(ev, `${ns}:${o}${scope}`);
  };
  const meaningFor = (qid: string, o: string) =>
    qid === "LEARN_FROM" || (qid === "WATCH" && watchNames[o]) ? `The restaurant "${o}" in \`competitors\`.`
      : qid === "WATCH" ? `The customer signal about ${o.replace("SIGNAL_", "").toLowerCase().replace(/_/g, " ")} in reviews.`
      : MEANING[o] ?? o;
  const criteria = (qid: string, ns: string, opts: string[], none: string, scope = "") => {
    const c: Record<string, string> = {};
    for (const o of opts) { const ids = idsFor(qid, ns, o, scope); c[o] = `${meaningFor(qid, o)}${ids.length ? ` Supported by facts ${ids.join(", ")} in \`facts\`.` : ""}`; }
    c[none] = MEANING[none];
    return c;
  };
  // Demo mock only: plausible scores from evidence strength and opportunity value. Never sent to Jev.
  const mockFor = (qid: string, ns: string, opts: string[], none: string, scope = ""): Record<string, number> => {
    const out: Record<string, number> = { [none]: x.dataQuality === "LOW" ? 0.6 : 0.2 };
    opts.forEach((o, i) => {
      const ids = idsFor(qid, ns, o, scope);
      const maxS = Math.max(0, ...ids.map((id) => STRENGTH_W[evById.get(id)!.strength]));
      const opp = x.opportunities.find((p) => p.experiment === o)?.score ?? 0;
      let v = 0.2 + 0.45 * maxS + 0.1 * Math.min(3, ids.length) + 0.3 * opp;
      if (o === "CONTINUE_EXPERIMENT") v = 1;
      if (qid === "EXPERIMENT_RESULT") v = o === x.experimentRule?.label ? 0.8 : 0.2;
      if (qid === "LEARN_FROM") v = (benchmarks.find((b) => b.restaurant.name === o)?.benchmarkQuality ?? 0) / 100 + 0.1 * ids.length;
      if (qid.startsWith("SCENARIO:")) v = o === "TEST" ? (i === 0 && qid === `SCENARIO:${x.scenarios?.[0]?.experiment}` ? 0.75 : 0.35) : 0.55;
      out[o] = Math.min(1, v);
    });
    return out;
  };

  // Scenario verdicts ("what if...?"): one small question per scenario.
  for (const sc of x.scenarios ?? []) qs.push({ id: `SCENARIO:${sc.experiment}` as DecisionId, ns: "SCENARIO", options: sc.evidenceIds.length ? ["TEST", "NOT_PRIORITY"] : [], question: `What if the owner tried "${sc.experiment}"? Is it worth testing now, not a priority, or not supported?` });

  // Build requests; questions with no supported option are answered by rule (no forced answer).
  const reqs: ChoiceRequest[] = [];
  const ruled: Record<string, BusinessDecision> = {};
  for (const q of qs) {
    const none = NONE[q.id.startsWith("SCENARIO:") ? "SCENARIO" : q.id];
    if (!q.options.length) {
      ruled[q.id] = { id: q.id.startsWith("SCENARIO:") ? "SCENARIO" : q.id, choice: none, confidence: 1, rawConfidence: 1, distribution: [{ option: none, probability: 1 }], tier: "INSUFFICIENT", supportingEvidenceIds: [], engine: "rule" };
      continue;
    }
    reqs.push({ id: q.id, question: q.question, options: [...q.options, none], context: {}, state, criteria: criteria(q.id, q.ns, q.options, none), mockScores: mockFor(q.id, q.ns, q.options, none) });
  }
  // Speculative fan-out: what to learn from EACH benchmark candidate (consumed only for the chosen one).
  for (const b of benchmarks) {
    const scope = `@${b.restaurant.id}`;
    const opts = supported("LEARN", LEARN, scope);
    if (!opts.length) continue;
    reqs.push({
      id: `WHAT_TO_LEARN:${b.restaurant.id}`, question: `Assume the owner studies "${b.restaurant.name}" in \`competitors\`. What is the most useful thing to learn from it?`,
      options: [...opts, NONE.WHAT_TO_LEARN], context: {}, state, criteria: criteria("WHAT_TO_LEARN", "LEARN", opts, NONE.WHAT_TO_LEARN, scope),
      mockScores: mockFor("WHAT_TO_LEARN", "LEARN", opts, NONE.WHAT_TO_LEARN, scope),
    });
  }

  const factor = CONFIG.dataQualityConfidenceFactor[x.dataQuality];
  let answers: Record<string, { choice: string; confidence: number; distribution: { option: string; probability: number }[] }> = {};
  try {
    answers = await provider.chooseBatch(state, reqs);
  } catch {
    return { available: false, debug: { state, questions: reqs.map((r) => ({ id: r.id, options: r.options })) } };
  }

  const wrap = (id: DecisionId, key: string, ns: string, scope = ""): BusinessDecision => {
    if (ruled[key]) return ruled[key];
    const a = answers[key];
    const supportingEvidenceIds = idsFor(key, ns, a.choice, scope);
    const confidence = a.confidence * factor;
    const isNone = Object.values(NONE).includes(a.choice);
    return {
      id, choice: a.choice, confidence, rawConfidence: a.confidence, distribution: a.distribution,
      // A real recommendation needs supporting facts; "none" answers are informative but never "strong".
      tier: isNone ? "INSUFFICIENT" : supportingEvidenceIds.length ? tierFor(confidence) : "INSUFFICIENT",
      supportingEvidenceIds, engine: provider.engine,
      ...(key === "LEARN_FROM" ? { restaurantId: byName[a.choice] } : key === "WATCH" && watchNames[a.choice] ? { restaurantId: watchNames[a.choice] } : {}),
    };
  };

  const out: DecisionSetV3 = { available: true, debug: { state, questions: reqs.map((r) => ({ id: r.id, options: r.options })) } };
  out.focus10h = wrap("FOCUS_10H", "FOCUS_10H", "FOCUS");
  out.dontTouch = wrap("DONT_TOUCH", "DONT_TOUCH", "KEEP");
  out.bestTest = wrap("BEST_TEST", "BEST_TEST", "TEST");
  if (qs.some((q) => q.id === "INVEST_500")) out.invest500 = wrap("INVEST_500", "INVEST_500", "INVEST");
  if (benchmarks.length) {
    out.learnFrom = wrap("LEARN_FROM", "LEARN_FROM", "LEARN_FROM");
    const id = out.learnFrom.restaurantId;
    if (id && answers[`WHAT_TO_LEARN:${id}`]) out.whatToLearn = wrap("WHAT_TO_LEARN", `WHAT_TO_LEARN:${id}`, "LEARN", `@${id}`);
  }
  const action = wrap("OWNER_DO", "OWNER_DO", "OWNER");
  const notDo = wrap("OWNER_NOT", "OWNER_NOT", "NOT");
  // Three factual bullets: what supports the action first, then what supports not doing the distraction.
  const byStrength = (ids: string[]) => [...ids].sort((a, b) => STRENGTH_W[evById.get(b)!.strength] - STRENGTH_W[evById.get(a)!.strength]);
  const a2 = byStrength(action.supportingEvidenceIds).slice(0, 2);
  const n1 = byStrength(notDo.supportingEvidenceIds).filter((id) => !a2.includes(id)).slice(0, 1);
  const why = [...a2, ...n1, ...byStrength(action.supportingEvidenceIds).filter((id) => !a2.includes(id) && !n1.includes(id))].slice(0, 3);
  out.owner = { action, notDo, why };
  // ---- V4
  out.thisWeek = wrap("THIS_WEEK", "THIS_WEEK", "WEEK");
  out.watch = wrap("WATCH", "WATCH", "WATCH");
  if (x.experimentRule) {
    out.experimentResult = x.experimentRule.sufficient
      ? wrap("EXPERIMENT_RESULT", "EXPERIMENT_RESULT", "RESULT")
      : { id: "EXPERIMENT_RESULT", choice: "INCONCLUSIVE", confidence: 1, rawConfidence: 1, distribution: [{ option: "INCONCLUSIVE", probability: 1 }], tier: "INSUFFICIENT", supportingEvidenceIds: supportFor(ev, "RESULT:INCONCLUSIVE"), engine: "rule" };
  }
  if (x.scenarios?.length) out.scenarios = Object.fromEntries(x.scenarios.map((sc) => [sc.experiment, wrap("SCENARIO", `SCENARIO:${sc.experiment}`, "SCENARIO")]));
  if (qs.some((q) => q.id === "MENU_ACTION")) out.menuAction = wrap("MENU_ACTION", "MENU_ACTION", "MENU");
  return out;
}
