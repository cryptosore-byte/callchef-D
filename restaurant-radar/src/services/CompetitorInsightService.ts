// Human competitor cards: why it matters, what they do better, what you do better, one verdict.
// Every line is a structured Reason computed from observed data (localized in the UI). No data = no line.
import type { Competitor, Reason, Reputation, Restaurant, ReviewSummary, Theme } from "@/types";
import { interval } from "@/lib/util";
import { smoothedPositive } from "./ReviewIntelligenceService";
import { FOOD_THEMES } from "./JevDecisionService";

export type Verdict = "emergingThreat" | "keyBenchmark" | "directRival" | "learnFrom" | "watch" | "minor";
export type ReputationNote = "highRawLowConfidence" | "strongEstablished" | "established" | "moderate" | "lowConfidence";

export interface CompetitorCard {
  id: string;
  reputationNote: ReputationNote;
  whyItMatters: Reason[];
  theyDoBetter: Reason[];
  youDoBetter: Reason[];
  verdict: Verdict;
  verdictParams: Record<string, string | number>;
}

export interface CompetitorRoles {
  topThreatId?: string;
  bestBenchmarkId?: string;
  emergingThreatIds: string[];
}

const MIN_THEME_N = 8;      // mentions needed on BOTH sides to compare a theme
const THEME_GAP = 0.15;     // 15 points of positive share
const RATING_GAP = 0.1;     // adjusted stars
const LATE_MIN = 30;        // minutes

const COMPARED: { key: string; themes: Theme[] }[] = [
  { key: "FOOD", themes: FOOD_THEMES }, { key: "PORTION", themes: ["PORTION"] }, { key: "SERVICE", themes: ["SERVICE"] },
  { key: "WAITING_TIME", themes: ["WAITING_TIME"] }, { key: "DELIVERY_EXPERIENCE", themes: ["DELIVERY_EXPERIENCE", "PACKAGING"] },
  { key: "VALUE_FOR_MONEY", themes: ["VALUE_FOR_MONEY", "PRICE"] },
];

export function reputationNote(rep: Reputation): ReputationNote {
  if (rep.reputationConfidence === "LOW") return rep.rawRating >= 4.7 ? "highRawLowConfidence" : "lowConfidence";
  if (rep.reputationConfidence === "HIGH") return rep.adjustedRating - rep.marketAverage >= 0.1 ? "strongEstablished" : "established";
  return "moderate";
}

/** Latest closing time (minutes from opening day midnight) on Friday/Saturday, or daily close when per-day hours are unknown. */
function weekendClose(r: Restaurant): { min: number; label: string } | null {
  const days = (r.weeklyHours ?? []).filter((d) => d.day === 4 || d.day === 5);
  const src = days.length ? days : r.openingHours ? [r.openingHours] : [];
  if (!src.length) return null;
  const best = src.map((h) => ({ min: interval(h.open, h.close)[1], label: h.close })).sort((a, b) => b.min - a.min)[0];
  return best;
}

function compare(me: Restaurant, meS: ReviewSummary | undefined, myRep: Reputation, c: Competitor, cS: ReviewSummary | undefined) {
  const they: Reason[] = [];
  const you: Reason[] = [];
  const them = c.restaurant;
  // Reputation, on adjusted ratings, only when the leading side's rating is statistically meaningful.
  const d = c.reputation.adjustedRating - myRep.adjustedRating;
  if (d >= RATING_GAP && c.reputation.reputationConfidence !== "LOW") they.push({ code: "betterReputation", params: { a: c.reputation.rawRating, n: c.reputation.reviewCount, b: myRep.rawRating, m: myRep.reviewCount } });
  if (-d >= RATING_GAP && myRep.reputationConfidence !== "LOW") you.push({ code: "betterReputation", params: { a: myRep.rawRating, n: myRep.reviewCount, b: c.reputation.rawRating, m: c.reputation.reviewCount } });
  // Review volume
  if (them.reviewCount >= 100 && them.reviewCount >= 3 * Math.max(1, me.reviewCount)) they.push({ code: "moreReviews", params: { a: them.reviewCount, b: me.reviewCount } });
  if (me.reviewCount >= 100 && me.reviewCount >= 3 * Math.max(1, them.reviewCount)) you.push({ code: "moreReviews", params: { a: me.reviewCount, b: them.reviewCount } });
  // Weekend opening
  const wc = weekendClose(them), wm = weekendClose(me);
  if (wc && wm) {
    const weekly = !!(them.weeklyHours?.length && me.weeklyHours?.length);
    if (wc.min - wm.min >= LATE_MIN) they.push({ code: weekly ? "openLaterWeekend" : "openLater", params: { a: wc.label, b: wm.label } });
    if (wm.min - wc.min >= LATE_MIN) you.push({ code: weekly ? "openLaterWeekend" : "openLater", params: { a: wm.label, b: wc.label } });
  }
  // Review themes, only with enough mentions on both sides
  for (const { key, themes } of COMPARED) {
    const a = smoothedPositive(cS, themes), b = smoothedPositive(meS, themes);
    if (a.n < MIN_THEME_N || b.n < MIN_THEME_N) continue;
    const params = { theme: key, a: Math.round(a.value * 100), b: Math.round(b.value * 100), n1: a.n, n2: b.n };
    if (a.value - b.value >= THEME_GAP) they.push({ code: "betterTheme", params });
    if (b.value - a.value >= THEME_GAP) you.push({ code: "betterTheme", params: { ...params, a: params.b, b: params.a, n1: b.n, n2: a.n } });
  }
  // Photos on the listing (both known)
  if (them.imagesCount !== undefined && me.imagesCount !== undefined) {
    if (them.imagesCount >= 2 * me.imagesCount && them.imagesCount - me.imagesCount >= 20) they.push({ code: "morePhotos", params: { a: them.imagesCount, b: me.imagesCount } });
    if (me.imagesCount >= 2 * them.imagesCount && me.imagesCount - them.imagesCount >= 20) you.push({ code: "morePhotos", params: { a: me.imagesCount, b: them.imagesCount } });
  }
  return { they, you };
}

function verdictOf(c: Competitor): Verdict {
  const fewReviews = c.benchmarkReasons.some((r) => r.code === "fewReviews");
  if (c.threatLevel === "HIGH" && c.benchmarkLevel === "WEAK" && fewReviews) return "emergingThreat";
  if (c.benchmarkLevel === "STRONG" && c.threatLevel !== "LOW") return "keyBenchmark";
  if (c.threatLevel === "HIGH") return "directRival";
  if (c.benchmarkLevel === "STRONG") return "learnFrom";
  if (c.threatLevel === "MEDIUM") return "watch";
  return "minor";
}

export function buildCompetitorCards(
  target: Restaurant, targetRep: Reputation, competitors: Competitor[], summaries: Record<string, ReviewSummary>,
): { cards: Record<string, CompetitorCard>; roles: CompetitorRoles } {
  const cards: Record<string, CompetitorCard> = {};
  for (const c of competitors) {
    const { they, you } = compare(target, summaries[target.id], targetRep, c, summaries[c.restaurant.id]);
    cards[c.restaurant.id] = {
      id: c.restaurant.id,
      reputationNote: reputationNote(c.reputation),
      whyItMatters: [...c.threatReasons, ...c.benchmarkReasons.filter((r) => r.code === "manyReviews" || r.code === "strongReputation")],
      theyDoBetter: they, youDoBetter: you,
      verdict: verdictOf(c),
      verdictParams: { r: c.reputation.rawRating, n: c.reputation.reviewCount },
    };
  }
  const byThreat = [...competitors].sort((a, b) => b.threatScore - a.threatScore);
  const benchmarks = competitors.filter((c) => c.benchmarkLevel !== "WEAK").sort((a, b) => b.benchmarkQuality - a.benchmarkQuality);
  return {
    cards,
    roles: {
      topThreatId: byThreat[0]?.restaurant.id,
      bestBenchmarkId: benchmarks[0]?.restaurant.id,
      emergingThreatIds: competitors.filter((c) => cards[c.restaurant.id].verdict === "emergingThreat").map((c) => c.restaurant.id),
    },
  };
}

