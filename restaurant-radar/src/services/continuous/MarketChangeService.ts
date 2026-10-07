// "What changed?" Compares two snapshots and keeps only business-relevant changes (significance thresholds).
// Never generic news: "431 -> 432 reviews" is not a change; "+37 reviews, about 3x your growth" is.
import type { Theme } from "@/types";
import type { MarketSnapshot, PlaceSnap } from "./types";

export type ChangeType =
  | "NEW_COMPETITOR" | "COMPETITOR_CLOSED" | "COMPETITOR_RATING_UP" | "COMPETITOR_RATING_DOWN" | "COMPETITOR_REVIEW_GROWTH"
  | "TARGET_RATING_CHANGE" | "TARGET_REVIEW_GROWTH" | "OPENING_HOURS_CHANGE" | "SOCIAL_ACCELERATION" | "SOCIAL_DECLINE"
  | "NEW_REVIEW_PROBLEM" | "REVIEW_PROBLEM_WORSENING" | "REVIEW_PROBLEM_IMPROVING" | "DELIVERY_RATING_CHANGE" | "VISIBILITY_CHANGE";

export interface MarketChange {
  type: ChangeType;
  /** 0..1: how much this matters to the owner. Only the top 3 are shown. */
  importance: number;
  /** Localized as `chg.<type>` (title) and `chg.<type>.d` (detail). */
  params: Record<string, string | number>;
  /** Competitor concerned, when any (used by the "what to watch" decision). */
  placeId?: string;
  /** "good" | "bad" | "watch" for the owner, used for wording and colour. */
  tone: "good" | "bad" | "watch";
}

const T = {
  ratingCompetitor: 0.2, ratingTarget: 0.1, minReviewsForRating: 50,
  competitorGrowthMin: 15, growthRatio: 2, targetGrowthMin: 5,
  newProblemMin100: 5, problemDelta100: 5, problemRatio: 1.5,
  delivery: 0.2, visibility: 10, socialFollowersPct: 0.05, socialErRatio: 1.4, newCompetitorMaxM: 1500,
};
const PROBLEM_THEMES: Theme[] = ["WAITING_TIME", "FRIES", "PACKAGING", "DELIVERY_EXPERIENCE", "SERVICE", "ORDER_ACCURACY", "TEMPERATURE", "PRICE", "VALUE_FOR_MONEY", "BURGER", "FOOD_QUALITY"];
const days = (a: string, b: string) => Math.max(1, Math.round((new Date(b).getTime() - new Date(a).getTime()) / 86400000));

export function detectChanges(prev: MarketSnapshot, cur: MarketSnapshot): MarketChange[] {
  const out: MarketChange[] = [];
  const period = days(prev.at, cur.at);
  const add = (c: MarketChange) => out.push({ ...c, importance: Math.min(1, Math.max(0, c.importance)) });
  const prevComp = new Map(prev.competitors.map((c) => [c.id, c]));
  const prevNearby = new Map([...prev.nearby, ...prev.competitors].map((c) => [c.id, c]));
  const tGrowth = cur.target.reviewCount - prev.target.reviewCount;

  // New competitor: a confirmed competitor we had never seen nearby.
  for (const c of cur.competitors) if (!prevNearby.has(c.id) && (c.distanceM ?? 0) <= T.newCompetitorMaxM) {
    add({ type: "NEW_COMPETITOR", importance: 0.95, tone: "watch", placeId: c.id, params: { name: c.name, m: c.distanceM ?? 0, cuisine: c.cuisine ?? "", close: c.weekendClose ?? "" } });
  }
  for (const c of cur.competitors) {
    const p = prevComp.get(c.id);
    if (!p) continue;
    if (c.closed && !p.closed) add({ type: "COMPETITOR_CLOSED", importance: 0.9, tone: "good", placeId: c.id, params: { name: c.name } });
    const dr = c.rating - p.rating;
    if (c.reviewCount >= T.minReviewsForRating && Math.abs(dr) >= T.ratingCompetitor - 1e-9) add({ type: dr > 0 ? "COMPETITOR_RATING_UP" : "COMPETITOR_RATING_DOWN", importance: dr > 0 ? 0.7 : 0.5, tone: dr > 0 ? "watch" : "good", placeId: c.id, params: { name: c.name, a: p.rating, b: c.rating } });
    const g = c.reviewCount - p.reviewCount;
    if (g >= T.competitorGrowthMin && g >= T.growthRatio * Math.max(1, tGrowth)) {
      add({ type: "COMPETITOR_REVIEW_GROWTH", importance: 0.75 + Math.min(0.15, g / 400), tone: "watch", placeId: c.id, params: { name: c.name, n: g, x: tGrowth > 0 ? Math.round(g / tGrowth) : 0, you: tGrowth, d: period } });
    }
    if (p.weekendClose && c.weekendClose && p.weekendClose !== c.weekendClose) add({ type: "OPENING_HOURS_CHANGE", importance: 0.6, tone: "watch", placeId: c.id, params: { name: c.name, a: p.weekendClose, b: c.weekendClose } });
  }
  // The restaurant itself
  const dt = cur.target.rating - prev.target.rating;
  if (Math.abs(dt) >= T.ratingTarget - 1e-9) add({ type: "TARGET_RATING_CHANGE", importance: 0.8, tone: dt > 0 ? "good" : "bad", params: { a: prev.target.rating, b: cur.target.rating } });
  if (tGrowth >= T.targetGrowthMin) add({ type: "TARGET_REVIEW_GROWTH", importance: 0.45, tone: "good", params: { n: tGrowth, r: cur.target.rating, d: period } });
  if (prev.target.weekendClose && cur.target.weekendClose && prev.target.weekendClose !== cur.target.weekendClose) add({ type: "OPENING_HOURS_CHANGE", importance: 0.5, tone: "watch", params: { name: cur.target.name, a: prev.target.weekendClose, b: cur.target.weekendClose } });

  // Review problems (per 100 recent reviews, so volume changes do not fake a trend)
  for (const th of PROBLEM_THEMES) {
    const a = prev.themes[th]?.neg100 ?? 0, b = cur.themes[th]?.neg100;
    if (b === undefined) continue;
    if (a === 0 && b >= T.newProblemMin100) add({ type: "NEW_REVIEW_PROBLEM", importance: 0.8, tone: "bad", params: { theme: th, b } });
    else if (b - a >= T.problemDelta100 && b >= a * T.problemRatio) add({ type: "REVIEW_PROBLEM_WORSENING", importance: 0.85, tone: "bad", params: { theme: th, a, b } });
    else if (a - b >= T.problemDelta100 && a >= b * T.problemRatio) add({ type: "REVIEW_PROBLEM_IMPROVING", importance: 0.6, tone: "good", params: { theme: th, a, b } });
  }
  if (typeof prev.deliveryAvg === "number" && typeof cur.deliveryAvg === "number" && Math.abs(cur.deliveryAvg - prev.deliveryAvg) >= T.delivery) {
    add({ type: "DELIVERY_RATING_CHANGE", importance: 0.65, tone: cur.deliveryAvg > prev.deliveryAvg ? "good" : "bad", params: { a: prev.deliveryAvg.toFixed(1), b: cur.deliveryAvg.toFixed(1) } });
  }
  if (typeof prev.visibility === "number" && typeof cur.visibility === "number" && Math.abs(cur.visibility - prev.visibility) >= T.visibility) {
    add({ type: "VISIBILITY_CHANGE", importance: 0.4, tone: cur.visibility > prev.visibility ? "good" : "bad", params: { a: prev.visibility, b: cur.visibility } });
  }
  if (prev.instagram && cur.instagram) {
    const fp = (cur.instagram.followers - prev.instagram.followers) / Math.max(1, prev.instagram.followers);
    const er = prev.instagram.er && cur.instagram.er ? cur.instagram.er / prev.instagram.er : 1;
    if (fp >= T.socialFollowersPct || er >= T.socialErRatio) add({ type: "SOCIAL_ACCELERATION", importance: 0.35, tone: "good", params: { n: cur.instagram.followers - prev.instagram.followers } });
    else if (fp <= -T.socialFollowersPct || er <= 1 / T.socialErRatio) add({ type: "SOCIAL_DECLINE", importance: 0.35, tone: "bad", params: { n: cur.instagram.followers - prev.instagram.followers } });
  }
  return out.sort((a, b) => b.importance - a.importance);
}

/** At most 3 changes, never two about the same competitor. */
export function topChanges(changes: MarketChange[], max = 3): MarketChange[] {
  const out: MarketChange[] = [];
  for (const c of changes) {
    if (c.placeId && out.some((o) => o.placeId === c.placeId)) continue;
    out.push(c);
    if (out.length >= max) break;
  }
  return out;
}

/** "What it means for you": one sentence code chosen from the most important change. */
export function interpretation(top: MarketChange[], hasActiveExperiment: boolean): string {
  if (!top.length) return hasActiveExperiment ? "meaning.quietKeepTesting" : "meaning.quiet";
  const first = top[0];
  if (hasActiveExperiment && first.tone !== "bad") return "meaning.keepTesting";
  const MAP: Partial<Record<ChangeType, string>> = {
    NEW_COMPETITOR: "meaning.newCompetitor", COMPETITOR_REVIEW_GROWTH: "meaning.competitorMomentum", COMPETITOR_RATING_UP: "meaning.competitorMomentum",
    REVIEW_PROBLEM_WORSENING: "meaning.problem", NEW_REVIEW_PROBLEM: "meaning.problem", TARGET_RATING_CHANGE: first.tone === "good" ? "meaning.good" : "meaning.problem",
    DELIVERY_RATING_CHANGE: first.tone === "good" ? "meaning.good" : "meaning.problem",
  };
  return MAP[first.type] ?? (first.tone === "good" ? "meaning.good" : "meaning.watch");
}
