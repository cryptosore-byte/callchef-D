// "Votre mois en 60 secondes": improved / got worse / changed around you / tested. Built from snapshots only.
import { detectChanges, type MarketChange } from "./MarketChangeService";
import type { Experiment, RestaurantRecord } from "./types";

export interface MonthlyReport {
  from: string; to: string;
  improved: MarketChange[];
  worse: MarketChange[];
  around: MarketChange[];
  tested: Experiment[];
}

const DAY = 86_400_000;
const AROUND = new Set(["NEW_COMPETITOR", "COMPETITOR_CLOSED", "COMPETITOR_RATING_UP", "COMPETITOR_RATING_DOWN", "COMPETITOR_REVIEW_GROWTH", "OPENING_HOURS_CHANGE"]);

/** Needs two snapshots at least 14 days apart within the last ~45 days; otherwise there is no "month" to tell. */
export function monthlyReport(rec: RestaurantRecord, now: number): MonthlyReport | undefined {
  const snaps = rec.snapshots.filter((s) => now - new Date(s.at).getTime() <= 45 * DAY);
  if (snaps.length < 2) return undefined;
  const first = snaps[0], last = snaps[snaps.length - 1];
  if (new Date(last.at).getTime() - new Date(first.at).getTime() < 14 * DAY) return undefined;
  const ch = detectChanges(first, last);
  const mine = ch.filter((c) => !AROUND.has(c.type) || !c.placeId);
  return {
    from: first.at, to: last.at,
    improved: mine.filter((c) => c.tone === "good").slice(0, 2),
    worse: mine.filter((c) => c.tone === "bad").slice(0, 2),
    around: ch.filter((c) => AROUND.has(c.type) && c.placeId).slice(0, 2),
    tested: rec.experiments.filter((e) => now - new Date(e.startDate).getTime() <= 45 * DAY || (e.result && now - new Date(e.endDate).getTime() <= 45 * DAY)).slice(-2),
  };
}
