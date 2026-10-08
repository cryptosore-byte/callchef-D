// Builds a compact market snapshot from a finished analysis.
import type { Competitor, CompetitorCandidate, Restaurant, ReviewSummary, Theme } from "@/types";
import type { DigitalHealth } from "@/services/DigitalHealthRunner";
import { engagementRate } from "@/services/DigitalHealthService";
import type { ScanMode } from "@/services/ProviderBudgetService";
import { interval } from "@/lib/util";
import type { MarketSnapshot, PlaceSnap } from "./types";

export function weekendClose(r: Restaurant): string | undefined {
  const days = (r.weeklyHours ?? []).filter((d) => d.day === 4 || d.day === 5);
  const src = days.length ? days : r.openingHours ? [r.openingHours] : [];
  return src.sort((a, b) => interval(b.open, b.close)[1] - interval(a.open, a.close)[1])[0]?.close;
}

export const placeSnap = (r: Restaurant, distanceM?: number): PlaceSnap => ({
  id: r.id, name: r.name, rating: r.rating, reviewCount: r.reviewCount, weekendClose: weekendClose(r),
  dailyClose: r.openingHours?.close, distanceM: distanceM !== undefined ? Math.round(distanceM) : undefined,
  cuisine: r.foodProfile && r.foodProfile.level !== "LOW" ? r.foodProfile.primary : undefined, closed: r.closed,
});

/** Per-100-review rates over the last 90 days (needs >= 15 recent reviews, else omitted). */
function themeRates(target: Restaurant, nowMs: number): MarketSnapshot["themes"] {
  const recent = target.reviews.filter((r) => (nowMs - new Date(r.date).getTime()) / 86400000 <= 90);
  if (recent.length < 15) return {};
  const out: MarketSnapshot["themes"] = {};
  const count = new Map<Theme, { neg: number; pos: number }>();
  for (const r of recent) for (const m of r.mentions ?? []) {
    const c = count.get(m.theme) ?? { neg: 0, pos: 0 };
    if (m.sentiment === "negative") c.neg++; else if (m.sentiment === "positive") c.pos++;
    count.set(m.theme, c);
  }
  for (const [th, c] of count) out[th] = { neg100: Math.round((100 * c.neg) / recent.length), pos100: Math.round((100 * c.pos) / recent.length), reviews: recent.length };
  return out;
}

export function buildSnapshot(
  mode: ScanMode, target: Restaurant, competitors: Competitor[], nearby: CompetitorCandidate[], _summary: ReviewSummary | undefined, digital: DigitalHealth | undefined, nowMs = Date.now(),
): MarketSnapshot {
  const ig = digital?.social.profile;
  return {
    at: new Date(nowMs).toISOString(), mode,
    target: placeSnap(target),
    competitors: competitors.map((c) => placeSnap(c.restaurant, c.distanceM)),
    nearby: nearby.map((n) => placeSnap(n.restaurant, n.distanceM)),
    themes: themeRates(target, nowMs),
    deliveryAvg: digital?.reputation.deliveryAverage ?? null,
    instagram: ig?.status === "CONNECTED" && ig.followers ? { followers: ig.followers, posts: ig.postCount, er: engagementRate(ig) } : null,
    visibility: digital?.visibility.score ?? null,
    searchRanks: digital?.visibility.search.results,
  };
}
