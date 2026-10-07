import { CONFIG } from "@/config";
import type { DecisionProvider } from "@/providers/DecisionProvider";
import { tierFor } from "@/providers/DecisionProvider";
import type {
  BattleDimension, BattlePlan, BattleResult, BattleVerdict, Competitor, DataQualityLevel, DecisionResult,
  DecisionSet, Restaurant, ReviewSummary, Theme,
} from "@/types";
import { clamp, pct } from "@/lib/util";
import type { T } from "@/i18n";
import { getStat, negativePressure, smoothedPositive } from "./ReviewIntelligenceService";
import { convenienceScore, reputationScore, valueScore } from "./RadarScoreService";
import { FOOD_THEMES, actionScores, type DecisionContext } from "./JevDecisionService";
import { STATE_NOTE, competitorState, placeState } from "./jevQuestions";

const verdict = (you: number, them: number): BattleVerdict =>
  Math.abs(you - them) < CONFIG.battleTieMargin ? "TOO_CLOSE" : you > them ? "YOU_WIN" : "COMPETITOR_WINS";

const menuScore = (r: Restaurant) => Math.min(100, 30 + r.categories.length * 15);
const overlap = (a: string[], b: string[]) => {
  const B = new Set(b.map((x) => x.toLowerCase()));
  return a.filter((x) => B.has(x.toLowerCase())).length / (a.length || 1);
};

function dims(t: T, me: Restaurant, meS: ReviewSummary | undefined, c: Restaurant, cS: ReviewSummary | undefined): BattleDimension[] {
  const thin = (cS?.reviewsAnalyzed ?? 0) < CONFIG.dataQuality.mediumMinReviews;
  const lowNote = thin ? " " + t("bn.lowData") : "";
  const priceMe = 100 - (me.priceLevel - 1) * 25;
  const priceThem = 100 - (c.priceLevel - 1) * 25;
  const pm = smoothedPositive(meS, ["PRICE"]).value * 100;
  const pt = smoothedPositive(cS, ["PRICE"]).value * 100;
  const out: BattleDimension[] = [];
  const add = (key: string, label: string, you: number, them: number, note: string) =>
    out.push({ key, label, you: Math.round(you), them: Math.round(them), verdict: verdict(you, them), note });

  add("reputation", t("battle.reputation"), reputationScore(me, meS), reputationScore(c, cS), t("bn.reputation", { a: me.rating, b: c.rating }) + lowNote);
  add("product", t("battle.product"), 100 * smoothedPositive(meS, FOOD_THEMES).value, 100 * smoothedPositive(cS, FOOD_THEMES).value, t("bn.product") + lowNote);
  add("price", t("battle.price"), 0.5 * priceMe + 0.5 * pm, 0.5 * priceThem + 0.5 * pt, t("bn.price", { a: "€".repeat(me.priceLevel), b: "€".repeat(c.priceLevel) }));
  add("value", t("battle.value"), valueScore(meS).score, valueScore(cS).score, t("bn.value") + lowNote);
  add("convenience", t("battle.convenience"), convenienceScore(me, meS), convenienceScore(c, cS), t("bn.convenience", { a: `${me.openingHours?.open}-${me.openingHours?.close}`, b: `${c.openingHours?.open}-${c.openingHours?.close}` }) + lowNote);
  add("menu", t("battle.menu"), menuScore(me), menuScore(c), t("bn.menu"));
  add("differentiation", t("battle.differentiation"), 100 * (1 - overlap(me.categories, c.categories)), 100 * (1 - overlap(c.categories, me.categories)), t("bn.differentiation"));
  return out;
}

export async function runBattle(
  t: T, provider: DecisionProvider, me: Restaurant, meS: ReviewSummary | undefined,
  comp: Competitor, cS: ReviewSummary | undefined, dq: DataQualityLevel,
): Promise<BattleResult> {
  const d = dims(t, me, meS, comp.restaurant, cS);
  const counts: Record<BattleVerdict, number> = { YOU_WIN: 0, COMPETITOR_WINS: 0, TOO_CLOSE: 0 };
  d.forEach((x) => counts[x.verdict]++);

  const wins = d.filter((x) => x.verdict === "YOU_WIN").sort((a, b) => (b.you - b.them) - (a.you - a.them));
  const options = d.map((x) => x.key);
  const mockScores = Object.fromEntries(d.map((x) => [x.key, x.verdict === "COMPETITOR_WINS" ? 0.3 + clamp((x.them - x.you) / 40) * 0.6 : x.verdict === "TOO_CLOSE" ? 0.2 : 0.02]));
  let battleground: DecisionResult | undefined;
  try {
    const raw = await provider.choose({
      id: "BATTLEGROUND", question: "Which dimension should the restaurant attack to win customers from this competitor?",
      options, context: { competitor: comp.restaurant.name },
      state: { note: STATE_NOTE, target: placeState(me, meS), competitor: competitorState(comp, cS), scores_0_100: d.map((x) => ({ dimension: x.key, target: x.you, competitor: x.them, verdict: x.verdict })) },
      criteria: Object.fromEntries(d.map((x) => [x.key, `Attack on ${x.key}: the competitor leads or is level in \`scores_0_100\` and the gap can realistically be closed.`])),
      mockScores,
    });
    const confidence = raw.confidence * CONFIG.dataQualityConfidenceFactor[dq];
    const g = d.find((x) => x.key === raw.choice)!;
    battleground = {
      id: "BATTLEGROUND", question: "Where should you attack?", choice: g.label, rawConfidence: raw.confidence, confidence,
      distribution: raw.distribution.map((x) => ({ option: d.find((y) => y.key === x.option)?.label ?? x.option, probability: x.probability })),
      tier: tierFor(confidence),
      evidence: d.map((x) => ({ label: x.label, value: t("bn.ev", { a: x.you, b: x.them, v: t("verdict." + x.verdict) }) })),
      conclusion: t("bn.gap", { what: g.label }), engine: provider.engine,
    };
  } catch { /* decision layer unavailable: fall back to plain facts below */ }

  const keep = wins.slice(0, 2).map((x) => x.label.toLowerCase());
  const lose = d.filter((x) => x.verdict === "COMPETITOR_WINS");
  let howToWin: string;
  const gl = battleground?.choice.toLowerCase() ?? "";
  if (!lose.length && !battleground) howToWin = t("how.ahead");
  else if (!battleground) howToWin = t("how.unavailable");
  else if (battleground.tier === "INSUFFICIENT") howToWin = t("how.insufficient");
  else if (keep.length) howToWin = t("how.keep", { keep: keep.join(t("how.or")), what: gl });
  else howToWin = t("how.level", { n: counts.TOO_CLOSE, total: d.length, what: gl });

  return { competitorId: comp.restaurant.id, competitorName: comp.restaurant.name, dimensions: d, verdictCounts: counts, battleground, howToWin };
}

// ---- 30-day plan: DEFEND / FIX / ATTACK / IGNORE ----------------------------
export async function buildPlan(
  provider: DecisionProvider, ctx: DecisionContext, decisions: DecisionSet,
): Promise<BattlePlan | undefined> {
  if (!decisions.available || !decisions.nextAction || !decisions.advantage || !decisions.biggestThreat) return undefined;
  const me = ctx.summaries[ctx.target.id];
  const threat = ctx.competitors.find((c) => c.restaurant.name === decisions.biggestThreat!.choice)!;
  const threatS = ctx.summaries[threat.restaurant.id];

  // DEFEND
  const advTheme: Record<string, Theme[]> = { PRODUCT_QUALITY: FOOD_THEMES, TASTE: ["TASTE"], PORTIONS: ["PORTION"], VALUE: ["VALUE_FOR_MONEY"], SERVICE: ["SERVICE"], PRICE: ["PRICE"] };
  const th = advTheme[decisions.advantage.choice] ?? [];
  const stats = th.map((t) => me && getStat(me, t)).filter(Boolean) as NonNullable<ReturnType<typeof getStat>>[];
  const mentions = stats.reduce((s, x) => s + x.mentions, 0);
  const pos = stats.reduce((s, x) => s + x.positive, 0);
  const tr = ctx.t;
  const defend = decisions.advantage.choice === "NO_CLEAR_ADVANTAGE"
    ? { title: tr("plan.defend.none"), detail: tr("plan.defend.noneD") }
    : { title: tr.opt(decisions.advantage.choice), detail: mentions ? tr("plan.defend.d", { p: pct(pos / mentions), n: mentions }) : tr("plan.defend.fallback") };

  // FIX
  const na = decisions.nextAction;
  const fix = na.choice === "NO_ACTION" || na.tier === "INSUFFICIENT"
    ? { title: tr("plan.fix.none"), detail: tr("plan.fix.noneD") }
    : { title: tr.opt(na.choice), detail: na.conclusion };

  // ATTACK: where does the biggest threat show weakness?
  const attackOpts: Record<string, Theme[]> = { WAITING_TIME: ["WAITING_TIME"], SERVICE: ["SERVICE"], PRICE: ["PRICE"], VALUE: ["VALUE_FOR_MONEY"], PACKAGING: ["PACKAGING", "DELIVERY_EXPERIENCE"], FOOD: ["FOOD_QUALITY", "TASTE", "BURGER", "CHICKEN"] };
  const aScores = Object.fromEntries(Object.entries(attackOpts).map(([k, v]) => [k, negativePressure(threatS, v).value]));
  const aRaw = await provider.choose({ id: "ATTACK_ANGLE", question: "Where is this competitor most exposed?", options: Object.keys(attackOpts), context: { competitor: threat.restaurant.name },
    state: { note: STATE_NOTE, competitor: competitorState(threat, threatS) },
    criteria: Object.fromEntries(Object.keys(attackOpts).map((k) => [k, `The competitor shows a high share of negative mentions about ${k.toLowerCase().replace(/_/g, " ")} in \`competitor.themes\`.`])),
    mockScores: aScores });
  const aThemes = attackOpts[aRaw.choice];
  const aStats = aThemes.map((t) => threatS && getStat(threatS, t)).filter(Boolean) as NonNullable<ReturnType<typeof getStat>>[];
  const aM = aStats.reduce((s, x) => s + x.mentions, 0);
  const aN = aStats.reduce((s, x) => s + x.negative, 0);
  const attack = aScores[aRaw.choice] >= 0.2 && aM >= 8
    ? { title: tr("plan.attack.t", { name: threat.restaurant.name, what: tr.opt(aRaw.choice).toLowerCase() }), detail: tr("plan.attack.d", { p: pct(aN / aM), n: aM, what: tr.opt(aRaw.choice).toLowerCase(), name: threat.restaurant.name }) }
    : { title: tr("plan.attack.none"), detail: tr("plan.attack.noneD", { name: threat.restaurant.name }) };

  // IGNORE: the least-supported candidate action
  const cand = ["IMPROVE_PHOTOGRAPHY", "OPTIMIZE_MENU", "TEST_PROMOTION", "ADJUST_PRICING", "IMPROVE_SERVICE"].filter((a) => a !== na.choice);
  const sc = actionScores(ctx, decisions.whyTheyWin?.choice, true);
  const iRaw = await provider.choose({ id: "IGNORE", question: "Which improvement should the restaurant NOT spend time on right now?", options: cand, context: {},
    state: { note: STATE_NOTE, target: placeState(ctx.target, me) },
    criteria: Object.fromEntries(cand.map((a) => [a, `${a.toLowerCase().replace(/_/g, " ")} is NOT supported by any evidence in \`target\`, so effort spent here is wasted for the next 30 days.`])),
    mockScores: Object.fromEntries(cand.map((a) => [a, 1 - (sc[a] ?? 0)])) });
  const ignore = { title: tr.opt(iRaw.choice), detail: tr("plan.ignore.d") };

  return { defend, fix, attack, ignore };
}
