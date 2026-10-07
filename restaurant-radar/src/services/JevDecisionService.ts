import { CONFIG } from "@/config";
import { tierFor, type DecisionProvider } from "@/providers/DecisionProvider";
import type {
  Competitor, DataQualityLevel, DecisionResult, DecisionSet, EvidenceItem, MarketFeatures,
  PrioritySignal, Restaurant, ReviewSummary, Theme,
} from "@/types";
import { clamp, mean, pct } from "@/lib/util";
import type { T } from "@/i18n";
import {
  getStat, negativePressure, smoothedPositive,
} from "./ReviewIntelligenceService";
import { avgCompetitorPositive } from "./CompetitorDetectionService";
import { convenienceScore } from "./RadarScoreService";
import { ACTION_CRITERIA, ADVANTAGE_CRITERIA, STATE_NOTE, WEAKNESS_CRITERIA, WIN_CRITERIA, competitorState, placeState } from "./jevQuestions";

export const FOOD_THEMES: Theme[] = ["BURGER", "FOOD_QUALITY", "CHICKEN", "PIZZA", "TEXTURE"];
const DELIVERY_THEMES: Theme[] = ["DELIVERY_EXPERIENCE", "PACKAGING", "ORDER_ACCURACY"];

export const ADVANTAGE_OPTIONS = ["PRODUCT_QUALITY", "TASTE", "PORTIONS", "PRICE", "VALUE", "REPUTATION", "CONVENIENCE", "MENU", "DIFFERENTIATION", "SERVICE", "NO_CLEAR_ADVANTAGE"];
export const WEAKNESS_OPTIONS = ["FOOD", "FRIES", "PACKAGING", "PRICE", "VALUE", "REVIEWS", "OPENING_HOURS", "WAITING_TIME", "SERVICE", "ORDER_ACCURACY", "PORTIONS", "MENU", "DIFFERENTIATION", "NO_CLEAR_WEAKNESS"];
export const WIN_OPTIONS = ["PRICE", "PRODUCT", "REPUTATION", "CONVENIENCE", "VALUE", "PROMOTION", "DIFFERENTIATION", "MENU", "OPENING_HOURS", "NO_CLEAR_ADVANTAGE"];
export const ACTION_OPTIONS = ["TEST_NEW_PACKAGING", "IMPROVE_FRIES_HOLDING", "EXTEND_OPENING_HOURS", "CREATE_VALUE_BUNDLE", "ADJUST_PRICING", "IMPROVE_REVIEW_STRATEGY", "OPTIMIZE_MENU", "IMPROVE_PHOTOGRAPHY", "IMPROVE_SERVICE", "IMPROVE_ORDER_ACCURACY", "IMPROVE_KITCHEN_SPEED", "STRENGTHEN_DIFFERENTIATION", "TEST_PROMOTION", "NO_ACTION"];

const WEAKNESS_THEMES: Record<string, Theme[]> = {
  FOOD: ["FOOD_QUALITY", "TASTE", "TEXTURE", "BURGER", "CHICKEN", "PIZZA", "TEMPERATURE"],
  FRIES: ["FRIES"], PACKAGING: ["PACKAGING"], PRICE: ["PRICE"], VALUE: ["VALUE_FOR_MONEY"],
  WAITING_TIME: ["WAITING_TIME"], SERVICE: ["SERVICE"], ORDER_ACCURACY: ["ORDER_ACCURACY", "MISSING_ITEMS"],
  PORTIONS: ["PORTION"],
};

export interface DecisionContext {
  target: Restaurant;
  competitors: Competitor[];
  market: MarketFeatures;
  summaries: Record<string, ReviewSummary>;
  differentiationScore: number;
  dataQuality: DataQualityLevel;
  t: T;
  /** Hours the biggest threat stays open beyond the target (set after Decision A). */
  threatExtraHours?: number;
}

const mySummary = (c: DecisionContext) => c.summaries[c.target.id];
const compSummaries = (c: DecisionContext) => c.competitors.map((x) => c.summaries[x.restaurant.id]).filter(Boolean);

function line(t: T, s: ReviewSummary | undefined, theme: Theme): string | null {
  const st = s && getStat(s, theme);
  if (!st) return null;
  return t("line.mentions", { n: st.mentions, theme: t.theme(theme).toLowerCase(), pos: pct(st.positiveRate), neg: pct(st.negativeRate) });
}

function wrap(
  id: string, question: string, raw: { choice: string; confidence: number; distribution: { option: string; probability: number }[] },
  engine: DecisionResult["engine"], dq: DataQualityLevel, evidence: EvidenceItem[], conclusion: string,
): DecisionResult {
  const confidence = raw.confidence * CONFIG.dataQualityConfidenceFactor[dq];
  return { id, question, choice: raw.choice, rawConfidence: raw.confidence, confidence, distribution: raw.distribution, tier: tierFor(confidence), evidence, conclusion, engine };
}

// ---- feature scores (inputs to the decision engine) -------------------------

export function weaknessScores(c: DecisionContext): Record<string, number> {
  const s = mySummary(c);
  const out: Record<string, number> = {};
  for (const [k, themes] of Object.entries(WEAKNESS_THEMES)) out[k] = negativePressure(s, themes).value;
  out.REVIEWS = clamp(-c.market.competitors.ratingGap / 0.5) * 0.8;
  out.OPENING_HOURS = clamp(c.market.availabilitySignals.extraCompetitorHours / 6) * 0.7;
  out.MENU = 0.1;
  out.DIFFERENTIATION = (1 - c.differentiationScore / 100) * 0.5;
  out.NO_CLEAR_WEAKNESS = 0.25;
  return out;
}

export function actionScores(c: DecisionContext, why?: string, shouldAct = true): Record<string, number> {
  const s = mySummary(c);
  const rc = (k: string) => s?.rootCauses.find((r) => r.key === k)?.confidence ?? 0;
  const w = weaknessScores(c);
  const out: Record<string, number> = {
    TEST_NEW_PACKAGING: 0.5 * Math.max(rc("DELIVERY_HOLDING"), rc("PACKAGING")) + 0.5 * w.PACKAGING,
    IMPROVE_FRIES_HOLDING: 0.55 * w.FRIES + 0.15 * rc("DELIVERY_HOLDING"),
    EXTEND_OPENING_HOURS: clamp((c.threatExtraHours ?? c.market.availabilitySignals.extraCompetitorHours) / 6) * 0.6 + (why === "OPENING_HOURS" ? 0.1 : 0),
    CREATE_VALUE_BUNDLE: w.VALUE * 0.8,
    ADJUST_PRICING: w.PRICE * 0.6,
    IMPROVE_REVIEW_STRATEGY: w.REVIEWS * 0.9,
    OPTIMIZE_MENU: 0.12,
    IMPROVE_PHOTOGRAPHY: 0.08,
    IMPROVE_SERVICE: w.SERVICE * 0.9,
    IMPROVE_ORDER_ACCURACY: w.ORDER_ACCURACY * 0.9,
    IMPROVE_KITCHEN_SPEED: w.WAITING_TIME * 0.9,
    STRENGTHEN_DIFFERENTIATION: w.DIFFERENTIATION * 0.9,
    TEST_PROMOTION: 0.15,
    NO_ACTION: shouldAct ? 0.2 : 0.95,
  };
  return out;
}

// ---- main -------------------------------------------------------------------

export async function runJevDecisions(provider: DecisionProvider, c0: DecisionContext): Promise<DecisionSet> {
  try {
    let c = c0;
    const dq = c.dataQuality;
    const tr = c.t;
    const me = mySummary(c);
    const threats = [...c.competitors].sort((a, b) => b.threatScore - a.threatScore);
    if (!threats.length) return { available: true, unavailableReason: tr("warn.noCompetitors") };
    const t = c.target;
    const comps = compSummaries(c);
    // One factual state shared by every question (the model judges against facts, not opinions).
    const jstate = {
      note: STATE_NOTE,
      target: placeState(t, me, { root_cause_hypotheses: (me?.rootCauses ?? []).map((r) => ({ cause: r.label, confidence: Number(r.confidence.toFixed(2)) })) }),
      competitors: threats.map((x) => competitorState(x, c.summaries[x.restaurant.id])),
      market: { restaurants_nearby: c.market.localMarket.restaurantsDetected, avg_rating: Number(c.market.localMarket.avgRating.toFixed(2)), late_night_restaurants: c.market.localMarket.lateNightCount },
    };

    // ---------------- A. Biggest threat
    const maxT = Math.max(...threats.map((x) => x.threatScore));
    const scoresA = Object.fromEntries(threats.map((x) => [x.restaurant.name, Math.pow(x.threatScore / (maxT || 1), 4) * (x.threatScore / 100) * 1.3]));
    const rawA = await provider.choose({
      id: "BIGGEST_THREAT",
      question: "Which competitor currently represents the strongest competitive threat to the target restaurant?",
      options: threats.map((x) => x.restaurant.name),
      context: { target: t.name, competitors: threats.map((x) => ({ name: x.restaurant.name, threat: Math.round(x.threatScore), relevance: Math.round(x.relevance), distanceM: Math.round(x.distanceM), rating: x.restaurant.rating })) },
      state: jstate,
      criteria: Object.fromEntries(threats.map((x, i) => [x.restaurant.name, `The competitor described in \`competitors[${i}]\`.`])),
      mockScores: scoresA,
    });
    const top = threats.find((x) => x.restaurant.name === rawA.choice)!;
    const topS = c.summaries[top.restaurant.id];
    const vs = (a: string, b: string) => tr("ev.vs", { a, b });
    const biggestThreat = wrap("BIGGEST_THREAT", "Which competitor currently represents the strongest competitive threat?", rawA, provider.engine, dq, [
      { label: tr("ev.distance"), value: tr("ev.fromYou", { m: Math.round(top.distanceM) }) },
      { label: tr("ev.foodSim"), value: pct(top.breakdown.foodType) },
      { label: tr("ev.rating"), value: tr("ev.ratingFull", { a: top.restaurant.rating, n: top.restaurant.reviewCount, b: t.rating, m: t.reviewCount }) },
      { label: tr("ev.price"), value: vs("€".repeat(top.restaurant.priceLevel), "€".repeat(t.priceLevel)) },
      { label: tr("ev.closes"), value: vs(top.restaurant.openingHours?.close ?? "n/a", t.openingHours?.close ?? "n/a") },
      { label: tr("ev.threatScore"), value: tr("ev.threatVal", { s: Math.round(top.threatScore), r: Math.round(top.relevance) }) },
    ], tr("c.threat", { name: top.restaurant.name }));

    // ---------------- B. Why are they winning
    const myConv = convenienceScore(t, me);
    const theirConv = convenienceScore(top.restaurant, topS);
    const foodMe = smoothedPositive(me, FOOD_THEMES).value;
    const foodThem = smoothedPositive(topS, FOOD_THEMES);
    const valMe = smoothedPositive(me, ["VALUE_FOR_MONEY"]).value;
    const valThem = smoothedPositive(topS, ["VALUE_FOR_MONEY"]);
    const delMeS = smoothedPositive(me, DELIVERY_THEMES);
    const delMe = delMeS.value;
    const delThem = smoothedPositive(topS, DELIVERY_THEMES);
    const hrs = (r: Restaurant) => { const [o, cl] = r.openingHours ? [r.openingHours.open, r.openingHours.close] : ["0:00", "0:00"]; const m = (x: string) => Number(x.split(":")[0]) * 60 + Number(x.split(":")[1] || 0); let e = m(cl); if (e <= m(o)) e += 1440; return (e - m(o)) / 60; };
    const extraH = Math.max(0, hrs(top.restaurant) - hrs(t));
    c = { ...c, threatExtraHours: extraH };
    const catNew = top.restaurant.categories.filter((x) => !t.categories.map((y) => y.toLowerCase()).includes(x.toLowerCase())).length / Math.max(1, top.restaurant.categories.length);
    const scoresB: Record<string, number> = {
      PRICE: clamp((t.priceLevel - top.restaurant.priceLevel) / 2),
      PRODUCT: foodThem.n >= 5 ? clamp((foodThem.value - foodMe) * 3) : 0.05,
      REPUTATION: 0.6 * clamp((top.restaurant.rating - t.rating) / 0.6) + 0.4 * clamp(Math.log10(top.restaurant.reviewCount / t.reviewCount) / 0.5),
      CONVENIENCE: delThem.n >= 5 ? clamp((delThem.value - delMe) * 3) * 0.85 : 0.05,
      VALUE: valThem.n >= 5 ? clamp((valThem.value - valMe) * 3) * 0.8 : 0.05,
      PROMOTION: 0.1,
      DIFFERENTIATION: top.restaurant.primaryFoodType === t.primaryFoodType ? 0.05 : catNew * 0.5,
      MENU: 0.1,
      OPENING_HOURS: clamp(extraH / 6) * 0.9,
      NO_CLEAR_ADVANTAGE: 0.25,
    };
    const rawB = await provider.choose({
      id: "WHY_THEY_WIN",
      question: `What is the primary reason customers may currently choose \`competitors[${threats.findIndex((x) => x === top)}]\` instead of \`target\`?`,
      options: WIN_OPTIONS,
      context: { competitor: top.restaurant.name, myConvenience: Math.round(myConv), theirConvenience: Math.round(theirConv), extraOpenHours: extraH },
      state: jstate, criteria: WIN_CRITERIA,
      mockScores: scoresB,
    });
    const whyTheyWin = wrap("WHY_THEY_WIN", "What is the primary reason customers may currently choose this competitor instead?", rawB, provider.engine, dq, [
      { label: tr("ev.closingTime"), value: tr("ev.closingVal", { name: top.restaurant.name, a: top.restaurant.openingHours?.close ?? "n/a", b: t.openingHours?.close ?? "n/a" }) },
      { label: tr("ev.delivery"), value: tr("ev.deliveryVal", { name: top.restaurant.name, a: pct(delThem.value), b: pct(delMe), n1: delThem.n, n2: delMeS.n }) },
      { label: tr("ev.rating"), value: vs(String(top.restaurant.rating), String(t.rating)) },
      { label: tr("ev.price"), value: vs("€".repeat(top.restaurant.priceLevel), "€".repeat(t.priceLevel)) },
    ], rawB.choice === "NO_CLEAR_ADVANTAGE" ? tr("c.why.none") : tr("c.why.some", { what: tr.opt(rawB.choice) }));

    // ---------------- C. Our biggest advantage
    const compAvg = (themes: Theme[]) => avgCompetitorPositive(comps, themes) ?? 0.6;
    const adv = (themes: Theme[], mult = 1) => {
      const m = smoothedPositive(me, themes);
      if (m.n < 5) return 0.05;
      return mult * (0.5 * clamp((m.value - compAvg(themes)) * 3) + 0.5 * clamp((m.value - 0.6) / 0.35));
    };
    const compConvAvg = mean(c.competitors.map((x) => convenienceScore(x.restaurant, c.summaries[x.restaurant.id])));
    const scoresC: Record<string, number> = {
      PRODUCT_QUALITY: adv(FOOD_THEMES),
      TASTE: adv(["TASTE"], 0.7),
      PORTIONS: adv(["PORTION"], 0.8),
      PRICE: t.priceLevel < c.market.competitors.avgPriceLevel ? adv(["PRICE"]) : 0.05,
      VALUE: adv(["VALUE_FOR_MONEY"], 0.8),
      REPUTATION: 0.6 * clamp((t.rating - c.market.competitors.avgRating) / 0.4) + 0.4 * clamp(c.market.localMarket.reviewCountPercentile - 0.3),
      CONVENIENCE: clamp((myConv - compConvAvg) / 30) * 0.6,
      MENU: 0.1,
      DIFFERENTIATION: clamp((c.differentiationScore - 60) / 40) * 0.7,
      SERVICE: adv(["SERVICE"], 0.9),
      NO_CLEAR_ADVANTAGE: 0.3,
    };
    const rawC = await provider.choose({
      id: "OUR_ADVANTAGE", question: "What is the restaurant's biggest competitive advantage?",
      options: ADVANTAGE_OPTIONS, context: { target: t.name }, state: jstate, criteria: ADVANTAGE_CRITERIA, mockScores: scoresC,
    });
    const advThemes: Record<string, Theme[]> = { PRODUCT_QUALITY: FOOD_THEMES, TASTE: ["TASTE"], PORTIONS: ["PORTION"], VALUE: ["VALUE_FOR_MONEY"], SERVICE: ["SERVICE"], PRICE: ["PRICE"] };
    const advEv: EvidenceItem[] = (advThemes[rawC.choice] ?? []).map((th) => line(tr, me, th)).filter((x): x is string => !!x).map((v, i) => ({ label: i === 0 ? tr("ev.yourReviews") : tr("ev.also"), value: v }));
    if (advThemes[rawC.choice]) advEv.push({ label: tr("ev.compAvg"), value: tr("ev.compAvgVal", { p: pct(compAvg(advThemes[rawC.choice])) }) });
    advEv.push({ label: tr("ev.rating"), value: tr("ev.vsCompAvg", { a: t.rating, b: c.market.competitors.avgRating.toFixed(1) }) });
    const advantage = wrap("OUR_ADVANTAGE", "What is the restaurant's biggest competitive advantage?", rawC, provider.engine, dq, advEv,
      rawC.choice === "NO_CLEAR_ADVANTAGE" ? tr("c.adv.none") : tr("c.adv.some", { what: tr.opt(rawC.choice) }));

    // ---------------- D. Biggest weakness
    const scoresD = weaknessScores(c);
    const rawD = await provider.choose({
      id: "BIGGEST_WEAKNESS", question: "What is the restaurant's biggest weakness?",
      options: WEAKNESS_OPTIONS, context: { target: t.name }, state: jstate, criteria: WEAKNESS_CRITERIA, mockScores: scoresD,
    });
    const wEv: EvidenceItem[] = [];
    for (const th of WEAKNESS_THEMES[rawD.choice] ?? []) {
      const st = me && getStat(me, th);
      if (!st) continue;
      wEv.push({ label: tr.theme(th), value: tr("ev.negOf", { neg: st.negative, n: st.mentions, p: pct(st.negativeRate) }) });
      if (st.signals.length) wEv.push({ label: tr("ev.signals"), value: st.signals.map((x) => `${tr.sig(x.word)} (${x.count})`).join(", ") });
    }
    if (rawD.choice === "OPENING_HOURS") wEv.push({ label: tr("ev.hours"), value: tr("ev.youCloseAt", { a: t.openingHours?.close ?? "n/a", name: top.restaurant.name, b: top.restaurant.openingHours?.close ?? "n/a" }) });
    if (rawD.choice === "REVIEWS") wEv.push({ label: tr("ev.ratingGap"), value: tr("ev.vsCompAvg", { a: t.rating, b: c.market.competitors.avgRating.toFixed(1) }) });
    const runnerUp = rawD.distribution[1];
    if (runnerUp) wEv.push({ label: tr("ev.runnerUp"), value: tr("ev.runnerUpVal", { opt: tr.opt(runnerUp.option), p: pct(runnerUp.probability) }) });
    const biggestWeakness = wrap("BIGGEST_WEAKNESS", "What is the restaurant's biggest weakness?", rawD, provider.engine, dq, wEv,
      rawD.choice === "NO_CLEAR_WEAKNESS" ? tr("c.weak.none") : tr("c.weak.some", { what: tr.opt(rawD.choice) }));

    // ---------------- E. Should we act?
    const wTop = Math.max(...Object.entries(scoresD).filter(([k]) => k !== "NO_CLEAR_WEAKNESS").map(([, v]) => v));
    const rcBest = me?.rootCauses[0]?.confidence ?? 0;
    const sample = Math.min(1, (me?.reviewsAnalyzed ?? 0) / 100);
    const pYes = clamp(0.2 + 0.55 * wTop + 0.2 * sample + 0.15 * rcBest, 0, 0.95);
    const bin = await provider.binary({
      id: "SHOULD_ACT", question: "Is there enough evidence to recommend a concrete business intervention?",
      context: { reviewsAnalyzed: me?.reviewsAnalyzed ?? 0, topWeaknessScore: wTop, rootCauseConfidence: rcBest }, mockProbability: pYes,
      state: jstate,
      instructions: { question: "Is there enough evidence in `target` (review sample size, theme mentions, root-cause hypotheses) to recommend one concrete business intervention for the next 30 days?" },
      criteria: { true: "Specific, repeated and recent evidence points to one actionable problem or opportunity.", false: "Evidence is thin, mixed or mostly positive, so a change would be a guess." },
    });
    const yes = bin.probability >= 0.5;
    const rawE = { choice: yes ? "YES" : "NO", confidence: bin.confidence, distribution: [{ option: "YES", probability: bin.probability }, { option: "NO", probability: 1 - bin.probability }].sort((a, b) => b.probability - a.probability) };
    const shouldAct = wrap("SHOULD_ACT", "Is there enough evidence to recommend a concrete business intervention?", rawE, provider.engine, dq, [
      { label: tr("ev.sample"), value: tr("ev.sampleVal", { n: me?.reviewsAnalyzed ?? 0, m: me?.totalMentions ?? 0 }) },
      { label: tr("ev.weakSignal"), value: `${Math.round(wTop * 100)} / 100` },
      { label: tr("ev.rootBest"), value: me?.rootCauses[0] ? tr("ev.rootBestVal", { label: me.rootCauses[0].label, p: pct(me.rootCauses[0].confidence) }) : tr("ev.none") },
    ], yes ? tr("c.act.yes") : tr("c.act.no"));

    // ---------------- F. Next best action
    const scoresF = actionScores(c, rawB.choice, yes);
    const rawF = await provider.choose({
      id: "NEXT_BEST_ACTION", question: "What SINGLE action should this restaurant prioritize over the next 30 days?",
      options: ACTION_OPTIONS, context: { weakness: rawD.choice, why: rawB.choice, shouldAct: yes }, state: jstate, criteria: ACTION_CRITERIA, mockScores: scoresF,
    });
    const fries = me && getStat(me, "FRIES");
    const pack = me && getStat(me, "PACKAGING");
    const burger = me && getStat(me, "BURGER");
    const price = me && (getStat(me, "PRICE") ?? getStat(me, "VALUE_FOR_MONEY"));
    const fEv: EvidenceItem[] = [];
    const rcTop = me?.rootCauses[0];
    if (["TEST_NEW_PACKAGING", "IMPROVE_FRIES_HOLDING"].includes(rawF.choice)) {
      if (fries) fEv.push({ label: tr.theme("FRIES"), value: tr("ev.friesVal", { neg: fries.negative, n: fries.mentions }) });
      for (const sg of (fries?.signals ?? []).slice(0, 3)) fEv.push({ label: tr("ev.mentionsOf", { w: tr.sig(sg.word) }), value: String(sg.count) });
      if (pack) fEv.push({ label: tr.theme("PACKAGING"), value: tr("ev.packVal", { neg: pack.negative, n: pack.mentions }) });
      if (burger) fEv.push({ label: tr.theme("BURGER"), value: tr("ev.burgerVal", { p: pct(burger.positiveRate) }) });
    } else if (rawF.choice === "EXTEND_OPENING_HOURS") {
      fEv.push({ label: tr("ev.hours"), value: tr("ev.hoursLonger", { name: top.restaurant.name, h: extraH.toFixed(1) }) });
      fEv.push({ label: tr("ev.lateNearby"), value: String(c.market.localMarket.lateNightCount) });
    }
    if (price) fEv.push({ label: tr("ev.priceSent"), value: tr("ev.priceSentVal", { p: pct(price.positiveRate), q: pct(price.negativeRate), m: price.mentions }) });
    if (rcTop) fEv.push({ label: tr("ev.rootLikely"), value: tr("ev.rootLikelyVal", { label: rcTop.label, p: pct(rcTop.confidence) }) });
    const concl = ["TEST_NEW_PACKAGING", "IMPROVE_FRIES_HOLDING", "EXTEND_OPENING_HOURS", "NO_ACTION"].includes(rawF.choice)
      ? tr("c.act." + rawF.choice) : tr("c.act.default", { what: tr.opt(rawF.choice) });
    const nextAction = wrap("NEXT_BEST_ACTION", "What SINGLE action should this restaurant prioritize over the next 30 days?", rawF, provider.engine, dq, fEv, concl);

    // ---------------- G. Priority
    const p = (scoresF[rawF.choice] ?? 0) * nextAction.confidence;
    let score: PrioritySignal["score"] = rawF.choice === "NO_ACTION" ? 0 : p >= 0.6 ? 5 : p >= 0.48 ? 4 : p >= 0.36 ? 3 : p >= 0.24 ? 2 : 1;
    if (nextAction.tier === "INSUFFICIENT" && score > 2) score = 2;
    return {
      available: true, biggestThreat, whyTheyWin, advantage, weakness: biggestWeakness, shouldAct, nextAction,
      priority: { score, label: tr("priority." + score) },
    };
  } catch (e) {
    return { available: false, unavailableReason: c0.t("decision.unavailable") };
  }
}
