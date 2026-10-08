import { CONFIG } from "@/config";
import type { DecisionProvider } from "@/providers/DecisionProvider";
import { tierFor } from "@/providers/DecisionProvider";
import type {
  BattleDimension, BattleResult, BattleVerdict, Competitor, DataQualityLevel, DecisionResult, Restaurant, ReviewSummary,
} from "@/types";
import { clamp } from "@/lib/util";
import type { T } from "@/i18n";
import { FOOD_THEMES, smoothedPositive } from "./ReviewIntelligenceService";
import { convenienceScore, reputationScore, valueScore } from "./RadarScoreService";
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
  // Unknown price on either side: compare price perception only, never the placeholder level.
  const pricesKnown = me.priceKnown !== false && c.priceKnown !== false;
  const priceMe = pricesKnown ? 100 - (me.priceLevel - 1) * 25 : 50;
  const priceThem = pricesKnown ? 100 - (c.priceLevel - 1) * 25 : 50;
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

