import type {
  Restaurant, Review, ReviewSummary, RootCause, Theme, ThemeMention, ThemeStat,
} from "@/types";
import type { T } from "@/i18n";

/**
 * Deterministic fallback classifier, used when no LLM is configured (Phase 4 adds the LLM path).
 * Works clause by clause so "burger top mais frites froides" yields one positive and one negative mention.
 * Rough by design: French and English keywords only. A trailing * means "prefix match".
 */
const KEYWORDS: { theme: Theme; words: string[]; product?: string }[] = [
  { theme: "FRIES", words: ["fries", "frite*"], product: "fries" },
  { theme: "BURGER", words: ["burger*"], product: "burger" },
  { theme: "PACKAGING", words: ["packaging", "box", "bag", "emballage*", "sachet*", "barquette*"] },
  { theme: "WAITING_TIME", words: ["wait*", "slow", "attente", "attendu", "retard", "lent*", "long"] },
  { theme: "DELIVERY_EXPERIENCE", words: ["deliver*", "livr*", "livreur*", "rider"] },
  { theme: "SERVICE", words: ["staff", "service", "waiter", "serveu*", "personnel", "accueil", "équipe", "equipe"] },
  { theme: "VALUE_FOR_MONEY", words: ["value", "worth", "rapport qualité", "rapport qualite"] },
  { theme: "PRICE", words: ["price*", "expensive", "cheap", "prix", "cher", "chère", "tarif*"] },
  { theme: "PORTION", words: ["portion*", "copieu*", "généreu*", "genereu*", "generous"] },
  { theme: "ORDER_ACCURACY", words: ["wrong", "missing", "erreur", "manquant*", "oublié*", "oublie*"] },
];
const NEG = ["cold", "soggy", "slow", "bad", "terrible", "wrong", "missing", "late", "expensive", "dry", "froid*", "mou", "molle*", "ramolli*", "tiède", "tiede", "nul*", "mauvais*", "déçu*", "decu*", "lent*", "long", "retard", "cher", "chère", "sec", "gras", "décevant*", "pas terrible", "manquant*", "erreur", "oublié*", "oublie*", "trop petit*"];
const POS = ["great", "good", "delicious", "tasty", "amazing", "excellent*", "perfect", "friendly", "fast", "bon", "bonne*", "super", "top", "délicieu*", "delicieu*", "parfait*", "rapide*", "génial*", "genial*", "généreu*", "genereu*", "copieu*", "croustillant*", "fondant*", "frais", "fraîche*", "gentil*", "aimable*", "sympa"];
// map French signal words onto the canonical English reasons the rest of the app understands
const CANON: Record<string, string> = {
  froid: "cold", froide: "cold", froides: "cold", froids: "cold", mou: "soft", molle: "soft", molles: "soft", ramolli: "soggy", ramollies: "soggy", ramollis: "soggy",
  "tiède": "lukewarm", tiede: "lukewarm", lent: "slow", lente: "slow", long: "slow", retard: "late", cher: "expensive", "chère": "expensive", sec: "dry", gras: "greasy",
  "délicieux": "delicious", delicieux: "delicious", "délicieuse": "delicious", rapide: "fast", rapides: "fast", "généreux": "generous", genereux: "generous", "généreuse": "generous", copieux: "generous", copieuse: "generous",
  gentil: "friendly", gentille: "friendly", aimable: "friendly", sympa: "friendly", croustillantes: "crispy", croustillant: "crispy",
};

const esc = (w: string) => w.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
const matcher = (w: string) => new RegExp(`(?<![\\p{L}])${esc(w.replace(/\*$/, ""))}${w.endsWith("*") ? "" : "(?![\\p{L}])"}`, "iu");
const KW = KEYWORDS.map((k) => ({ ...k, res: k.words.map(matcher) }));
const NEG_RE = NEG.map((w) => ({ w: w.replace(/\*$/, ""), re: matcher(w) }));
const POS_RE = POS.map((w) => ({ w: w.replace(/\*$/, ""), re: matcher(w) }));
const SPLIT = /[.!?;\n]+|\s(?:mais|but|par contre|however|sauf|et pourtant)\s/iu;

export function keywordClassify(review: Review): ThemeMention[] {
  const out: ThemeMention[] = [];
  for (const clause of review.text.split(SPLIT)) {
    if (!clause.trim()) continue;
    const neg = NEG_RE.filter((x) => x.re.test(clause));
    const pos = POS_RE.filter((x) => x.re.test(clause));
    for (const k of KW) {
      if (!k.res.some((re) => re.test(clause))) continue;
      const sentiment = neg.length > pos.length ? "negative" : pos.length > neg.length ? "positive" : "neutral";
      const word = (sentiment === "negative" ? neg[0] : pos[0])?.w;
      out.push({
        theme: k.theme, sentiment,
        severity: sentiment === "negative" && review.rating <= 2 ? "high" : sentiment === "negative" ? "medium" : "low",
        product: k.product, reason: word ? CANON[word] ?? word : undefined,
      });
    }
  }
  return out;
}

export function ensureMentions(reviews: Review[]): Review[] {
  return reviews.map((r) => (r.mentions ? r : { ...r, mentions: keywordClassify(r) }));
}

const RECENT_DAYS = 90;
const MIN_WINDOW_REVIEWS = 15; // reviews needed in EACH window to compare periods

/**
 * Recency V3: negative mentions per 100 analyzed reviews, last 90 days vs the previous comparable 90 days.
 * Normalizing by reviews (not by mentions) keeps a busy month from looking worse just because it has more reviews.
 */
function recencyFor(reviews: Review[], theme: Theme, nowMs: number): { trend: ThemeStat["recentTrend"]; recency: ThemeStat["recency"] } {
  const age = (r: Review) => (nowMs - new Date(r.date).getTime()) / 86400000;
  const recent = reviews.filter((r) => age(r) <= RECENT_DAYS);
  const previous = reviews.filter((r) => age(r) > RECENT_DAYS && age(r) <= 2 * RECENT_DAYS);
  if (recent.length < MIN_WINDOW_REVIEWS || previous.length < MIN_WINDOW_REVIEWS) return { trend: "unknown", recency: null };
  const negCount = (rs: Review[]) => rs.reduce((s, r) => s + (r.mentions ?? []).filter((m) => m.theme === theme && m.sentiment === "negative").length, 0);
  const na = negCount(recent), nb = negCount(previous);
  const a = (100 * na) / recent.length, b = (100 * nb) / previous.length;
  // A change must be relative (x1.5), absolute (+/- 4 per 100 reviews) AND rest on at least 5 negative mentions.
  const trend = a >= b * 1.5 && a - b >= 4 && na >= 5 ? "worsening" : b >= a * 1.5 && b - a >= 4 && nb >= 5 ? "improving" : "stable";
  return { trend, recency: { recentPer100: Math.round(a), previousPer100: Math.round(b), recentReviews: recent.length, previousReviews: previous.length } };
}

export function summarizeReviews(restaurant: Restaurant, t: T, nowMs = Date.now()): ReviewSummary {
  const reviews = ensureMentions(restaurant.reviews);
  const byTheme = new Map<Theme, ThemeMention[]>();
  for (const r of reviews) for (const m of r.mentions ?? []) {
    byTheme.set(m.theme, [...(byTheme.get(m.theme) ?? []), m]);
  }
  const stats: ThemeStat[] = [...byTheme.entries()].map(([theme, ms]) => {
    const positive = ms.filter((m) => m.sentiment === "positive").length;
    const negative = ms.filter((m) => m.sentiment === "negative").length;
    const neutral = ms.length - positive - negative;
    const sig = new Map<string, number>();
    for (const m of ms) if (m.reason) sig.set(m.reason, (sig.get(m.reason) ?? 0) + 1);
    return {
      theme, mentions: ms.length, positive, neutral, negative,
      positiveRate: positive / ms.length, negativeRate: negative / ms.length,
      highSeverity: ms.filter((m) => m.severity === "high").length,
      signals: [...sig.entries()].map(([word, count]) => ({ word, count })).sort((a, b) => b.count - a.count).slice(0, 4),
      ...(({ trend, recency }) => ({ recentTrend: trend, recency }))(recencyFor(reviews, theme, nowMs)),
    };
  }).sort((a, b) => b.mentions - a.mentions);

  const totalMentions = stats.reduce((s, t) => s + t.mentions, 0);
  const positiveMentions = stats.reduce((s, t) => s + t.positive, 0);
  const negativeMentions = stats.reduce((s, t) => s + t.negative, 0);

  const summary: ReviewSummary = {
    restaurantId: restaurant.id,
    reviewsAnalyzed: reviews.length,
    totalMentions, positiveMentions, negativeMentions,
    netSentiment: totalMentions ? (positiveMentions - negativeMentions) / totalMentions : 0,
    stats, rootCauses: [],
  };
  summary.rootCauses = detectRootCauses(summary, t);
  return summary;
}

export const getStat = (s: ReviewSummary, theme: Theme) => s.stats.find((x) => x.theme === theme);
export const FOOD_THEMES: Theme[] = ["BURGER", "FOOD_QUALITY", "CHICKEN", "PIZZA", "TEXTURE"];

// ---- Root-cause hypotheses (never certainty) --------------------------------
export function detectRootCauses(s: ReviewSummary, t: T): RootCause[] {
  const out: RootCause[] = [];
  const f = getStat(s, "FRIES");
  const p = getStat(s, "PACKAGING");
  const d = getStat(s, "DELIVERY_EXPERIENCE");
  const w = getStat(s, "WAITING_TIME");
  const sv = getStat(s, "SERVICE");
  const pr = getStat(s, "PRICE");
  const v = getStat(s, "VALUE_FOR_MONEY");
  const po = getStat(s, "PORTION");
  const oa = getStat(s, "ORDER_ACCURACY");
  const heat = ["cold", "soggy", "soft", "lukewarm", "steamed"];
  const heatCount = (f?.signals ?? []).filter((x) => heat.includes(x.word)).reduce((a, b) => a + b.count, 0);
  const solid = (st?: { mentions: number; negativeRate: number }, minRate = 0.35, minN = 8) =>
    !!st && st.mentions >= minN && st.negativeRate >= minRate;
  const ofNeg = (st: { negative: number; mentions: number; theme: Theme }) =>
    t("rc.ev.ofNeg", { what: t.theme(st.theme).toLowerCase(), neg: st.negative, n: st.mentions });
  const add = (key: RootCause["key"], confidence: number, evidence: string[]) =>
    out.push({ key, label: t("rc." + key), confidence, evidence });

  if (solid(f, 0.5) && heatCount >= 5 && (solid(p) || solid(d))) {
    add("DELIVERY_HOLDING",
      Math.min(0.88, 0.3 + 0.3 * f!.negativeRate + 0.2 * (p?.negativeRate ?? 0) + 0.1 * (d?.negativeRate ?? 0) + 0.1 * Math.min(1, heatCount / 25)),
      [t("rc.ev.friesNeg", { n: f!.negative }), t("rc.ev.heat", { n: heatCount }), ...(p ? [t("rc.ev.packNeg", { n: p.negative })] : [])]);
  }
  if (solid(p, 0.4)) add("PACKAGING", Math.min(0.8, 0.25 + 0.55 * p!.negativeRate), [ofNeg(p!)]);
  if (solid(w)) add("KITCHEN_SPEED", Math.min(0.7, 0.2 + 0.5 * w!.negativeRate), [ofNeg(w!)]);
  if (solid(sv, 0.35)) add("SERVICE", Math.min(0.7, 0.2 + 0.5 * sv!.negativeRate), [ofNeg(sv!)]);
  if (solid(pr, 0.4) || solid(v, 0.4)) {
    const st = solid(pr, 0.4) ? pr! : v!;
    add("PRICE_POSITIONING", Math.min(0.7, 0.2 + 0.5 * st.negativeRate), [ofNeg(st)]);
  }
  if (solid(po, 0.4)) add("PORTION_SIZE", Math.min(0.7, 0.2 + 0.5 * po!.negativeRate), [ofNeg(po!)]);
  if (solid(oa, 0.4, 5)) add("ORDER_ACCURACY", Math.min(0.7, 0.2 + 0.5 * oa!.negativeRate), [ofNeg(oa!)]);
  for (const th of ["BURGER", "TASTE", "FOOD_QUALITY"] as Theme[]) {
    const st = getStat(s, th);
    if (solid(st, 0.3)) add("PRODUCT_RECIPE", Math.min(0.7, 0.2 + 0.5 * st!.negativeRate), [ofNeg(st!)]);
  }
  return out.sort((a, b) => b.confidence - a.confidence);
}

/** Smoothed positive share across themes; prior = neutral 50% worth `prior` mentions. */
export function smoothedPositive(s: ReviewSummary | undefined, themes: Theme[], prior = 5): { value: number; n: number } {
  let pos = 0, n = 0;
  for (const t of themes) { const st = s && getStat(s, t); if (st) { pos += st.positive; n += st.mentions; } }
  return { value: (pos + prior * 0.5) / (n + prior), n };
}

/** Prevalence-weighted negative pressure 0..1 across themes. */
export function negativePressure(s: ReviewSummary | undefined, themes: Theme[]): { value: number; n: number; neg: number } {
  let neg = 0, n = 0;
  for (const t of themes) { const st = s && getStat(s, t); if (st) { neg += st.negative; n += st.mentions; } }
  if (!s || n === 0) return { value: 0, n: 0, neg: 0 };
  const weight = Math.min(1, n / Math.max(8, 0.12 * s.reviewsAnalyzed));
  return { value: (neg / n) * weight, n, neg };
}
