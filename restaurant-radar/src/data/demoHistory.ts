// DEMO ONLY - fictional history so the demo can show "what changed", an active test and a measured result.
// Nothing here is real. Live restaurants start with an empty history.
import type { RadarInput, Restaurant } from "@/types";
import type { Menu } from "@/services/continuous/MenuIntelligenceService";
import type { MarketSnapshot, RestaurantRecord } from "@/services/continuous/types";

const DAY = 86_400_000;

export function demoHistory(input: RadarInput, now: number): RestaurantRecord {
  const at = (d: number) => new Date(now - d * DAY).toISOString();
  const snap = (daysAgo: number, target: number, smash: number, wait: number): MarketSnapshot => ({
    at: at(daysAgo), mode: daysAgo > 20 ? "DEEP_SCAN" : "LIGHT_REFRESH",
    target: { id: "demo-target", name: "Maison Brasero", rating: 4.4, reviewCount: target, weekendClose: "22:00", dailyClose: "22:00" },
    competitors: [
      { id: "demo-c3", name: "Chez Tonton Grill", rating: 4.6, reviewCount: 305, weekendClose: "22:30", distanceM: 421 },
      { id: "demo-c1", name: "Smash District", rating: 4.5, reviewCount: smash, weekendClose: "02:00", distanceM: 460 },
      { id: "demo-c2", name: "Burger Lab 13", rating: 4.2, reviewCount: 484, weekendClose: "23:00", distanceM: 363 },
      { id: "demo-c5", name: "Tacos Canebière", rating: 3.9, reviewCount: 1522, weekendClose: "03:00", distanceM: 279 },
    ],
    nearby: [],
    themes: { WAITING_TIME: { neg100: wait, pos100: 3, reviews: 60 }, FRIES: { neg100: 15, pos100: 2, reviews: 60 } },
    deliveryAvg: 4.0, instagram: null, visibility: 85,
    searchRanks: [{ query: "burger", rank: 4 }, { query: "burger gourmet", rank: 9 }, { query: "burger halal", rank: null }],
  });
  return {
    id: "", name: "Maison Brasero", input: { ...input, demo: true }, createdAt: at(35),
    lastDeepAt: at(35), lastRefreshAt: at(7), places: {}, targetId: "demo-target", confirmedIds: [], reviews: {},
    snapshots: [snap(35, 571, 1180, 4), snap(7, 603, 1247, 6)],
    timeline: [
      { at: at(35), kind: "INITIAL_SCAN", code: "tl.initial" },
      { at: at(33), kind: "EXPERIMENT_STARTED", code: "tl.started", params: { type: "RUN_REVIEW_GENERATION_TEST" } },
      { at: at(19), kind: "EXPERIMENT_COMPLETED", code: "tl.completed", params: { type: "RUN_REVIEW_GENERATION_TEST", label: "PROMISING" } },
      { at: at(16), kind: "EXPERIMENT_STARTED", code: "tl.started", params: { type: "EXTEND_WEEKEND_HOURS" } },
    ],
    experiments: [
      {
        id: "demo-exp-1", restaurantId: "demo-target", type: "RUN_REVIEW_GENERATION_TEST", startDate: at(33), endDate: at(19),
        baseline: { metric: "newReviewsPerWeek", value: 2.1, unit: "perWeek", source: "google" }, costLevel: "LOW", riskLevel: "LOW", reversible: true,
        status: "COMPLETED", ownerEntries: [],
        result: { label: "PROMISING", before: { metric: "newReviewsPerWeek", value: 2.1, unit: "perWeek", source: "google" }, after: { metric: "newReviewsPerWeek", value: 4.0, unit: "perWeek", source: "google", sample: 8 }, decidedBy: "rule" },
      },
      {
        id: "demo-exp-2", restaurantId: "demo-target", type: "EXTEND_WEEKEND_HOURS", startDate: at(16), endDate: new Date(now + 12 * DAY).toISOString(),
        baseline: { metric: "extraHourRevenue", value: 0, unit: "EUR", source: "owner" }, costLevel: "LOW", riskLevel: "LOW", reversible: true,
        status: "ACTIVE", ownerEntries: [{ at: at(9), value: 160 }, { at: at(2), value: 210 }], midpointLogged: true,
      },
    ],
    financials: { aov: 23, extraOrdersLow: 4, extraOrdersHigh: 8 },
  };
}

/** Fictional menus for the demo market (live menus are NOT collected: provider not connected). */
export function demoMenus(target: Restaurant, competitors: Restaurant[]): { target: Menu; competitors: Menu[] } {
  const now = new Date().toISOString();
  const items = (n: number, bundle: number | null, hero: boolean) => [
    ...Array.from({ length: n }, (_, i) => ({ name: `Item ${i + 1}`, price: 9 + (i % 6), category: (i % 4 === 0 ? "SIDE" : i % 5 === 0 ? "DRINK" : "MAIN") as "SIDE" | "DRINK" | "MAIN", tier: "STANDARD" as const, hero: hero && i === 0 })),
    ...(bundle ? [{ name: "Menu complet", price: bundle, category: "BUNDLE" as const }] : []),
  ];
  return {
    target: { placeId: target.id, name: target.name, items: items(44, null, false), source: "demo", retrievedAt: now },
    competitors: competitors.slice(0, 4).map((c, i) => ({ placeId: c.id, name: c.name, items: items(20 + i * 2, i < 3 ? 17.9 + i : null, i !== 3), source: "demo", retrievedAt: now })),
  };
}
