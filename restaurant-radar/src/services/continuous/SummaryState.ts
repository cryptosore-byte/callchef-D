// The small normalized state shared with Jev (Part 4): a handful of numbers and labels, never raw reviews.
import type { Competitor, MarketFeatures, Restaurant, ReviewSummary } from "@/types";
import type { DigitalHealth } from "@/services/DigitalHealthRunner";
import type { Experiment } from "./types";
import { weekendClose } from "./SnapshotService";
import { interval } from "@/lib/util";

const closeMin = (r: Restaurant) => { const c = weekendClose(r); const o = r.openingHours?.open ?? "10:00"; return c ? interval(o, c)[1] : null; };

export function buildSummaryState(target: Restaurant, competitors: Competitor[], market: MarketFeatures, summary: ReviewSummary | undefined, digital: DigitalHealth | undefined, active?: Experiment) {
  const pos = (summary?.stats ?? []).filter((s) => s.mentions >= 10).sort((a, b) => b.positiveRate - a.positiveRate)[0];
  const mine = closeMin(target);
  const later = competitors.filter((c) => { const m = closeMin(c.restaurant); return mine !== null && m !== null && m - mine >= 30; });
  const gaps = later.map((c) => closeMin(c.restaurant)! - mine!);
  const waiting = summary?.stats.find((s) => s.theme === "WAITING_TIME");
  const dg = digital?.reputation;
  return {
    topStrength: pos?.theme ?? null,
    strengthEvidence: pos ? Number(pos.positiveRate.toFixed(2)) : null,
    availabilityGapMinutes: gaps.length ? Math.max(...gaps) : 0,
    competitorsOpenLater: later.length,
    directCompetitors: competitors.length,
    googleReputationPercentile: Math.round(market.localMarket.ratingPercentile * 100),
    deliveryReputationGap: dg?.deliveryAverage !== null && dg?.deliveryAverage !== undefined && target.rating ? Number((dg.deliveryAverage - target.rating).toFixed(2)) : null,
    recentWaitingTrend: waiting?.recentTrend?.toUpperCase() ?? "UNKNOWN",
    socialGap: digital?.social.insight?.code === "social.biggerButLessEngaged" ? digital.social.insight.params : null,
    activeExperiment: active ? { type: active.type, endsOn: active.endDate.slice(0, 10) } : null,
  };
}
