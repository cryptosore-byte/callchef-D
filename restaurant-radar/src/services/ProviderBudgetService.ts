// Provider cost guard. Estimates are SAFETY CEILINGS built from configurable unit prices, not provider invoices.
// Core sources always run (the Radar must work); optional sources are skipped when they would exceed the ceiling.
import { CONFIG } from "@/config";

export type ScanMode = "DEEP_SCAN" | "LIGHT_REFRESH" | "MONTHLY_REFRESH" | "CACHE";
/** 1 = google/local market ... 6 = advanced visibility checks. 1-3 are core. */
export type Priority = 1 | 2 | 3 | 4 | 5 | 6;

export interface BudgetEntry { source: string; priority: Priority; estimateUsd: number; status: "RUN" | "CACHED" | "SKIPPED"; records?: number; }

export class ProviderBudget {
  readonly ceilingUsd: number;
  spentUsd = 0;
  entries: BudgetEntry[] = [];
  counters = { cacheHits: 0, providerRequests: 0, newRecords: 0, reviewsReused: 0, reviewsNew: 0, jevRequests: 0, jevCached: 0, llmTokens: 0 };

  constructor(readonly mode: ScanMode) {
    const b = CONFIG.budget;
    this.ceilingUsd = mode === "DEEP_SCAN" ? b.maxDeepScanUsd : mode === "MONTHLY_REFRESH" ? b.maxMonthlyRefreshUsd : b.maxLightRefreshUsd;
  }

  static apifyEstimate(places: number, reviews: number) {
    const u = CONFIG.budget.unit;
    return u.apifyRun + places * u.apifyPlace + reviews * u.apifyReview;
  }

  /** Typical cost of each scan mode with the current limits (admin only; ceilings, not invoices). */
  static projections() {
    const D = CONFIG.reviewDepth, L = CONFIG.limits;
    const perSearch = Math.max(5, Math.ceil(L.maxNearbyRestaurants / 2));
    const e = ProviderBudget.apifyEstimate;
    const comps = L.maxCompetitorsAnalyzed, strong = Math.min(D.strongBenchmarkCount, comps);
    const deep = e(3, 3 * D.target) + e(4 * perSearch, 0) + e(strong, strong * D.strongBenchmark) + e(comps - strong, (comps - strong) * D.secondaryCompetitor);
    const light = e(1, D.lightTargetNew) + e(comps, 0) + e(perSearch, 0) + e(1, D.lightCompetitorNew);
    const monthly = e(3, 3 * 50) + e(4 * perSearch, 0) + e(strong, strong * D.strongBenchmark) + e(comps - strong, (comps - strong) * D.secondaryCompetitor);
    const r = (x: number) => Number(x.toFixed(3));
    return { initialDeepScanUsd: r(deep), weeklyRefreshUsd: r(light), monthlyRefreshUsd: r(monthly), firstMonthUsd: r(deep + 3 * light), steadyMonthUsd: r(monthly + 3 * light) };
  }

  /** Ask before a paid call. Core (priority <= 3) always runs; optional calls must fit in what is left. */
  allow(source: string, priority: Priority, estimateUsd: number): boolean {
    const ok = priority <= 3 || this.spentUsd + estimateUsd <= this.ceilingUsd;
    this.entries.push({ source, priority, estimateUsd: Number(estimateUsd.toFixed(4)), status: ok ? "RUN" : "SKIPPED" });
    if (ok) { this.spentUsd += estimateUsd; this.counters.providerRequests++; }
    return ok;
  }
  cached(source: string, priority: Priority) {
    this.entries.push({ source, priority, estimateUsd: 0, status: "CACHED" });
    this.counters.cacheHits++;
  }
  records(n: number) { this.counters.newRecords += n; const last = this.entries[this.entries.length - 1]; if (last) last.records = n; }

  report() {
    const req = this.counters.providerRequests + this.counters.cacheHits;
    const warnings: string[] = [];
    const ratio = req ? this.counters.cacheHits / req : 1;
    if (this.mode !== "DEEP_SCAN" && req >= 3 && ratio < 0.5) warnings.push("LOW_CACHE_HIT_RATIO");
    if (this.spentUsd > this.ceilingUsd) warnings.push("CORE_OVER_CEILING");
    const seen = new Map<string, number>();
    for (const e of this.entries.filter((x) => x.status === "RUN")) seen.set(e.source, (seen.get(e.source) ?? 0) + 1);
    if ([...seen.values()].some((n) => n > 2)) warnings.push("SAME_SOURCE_REPEATED");
    if (this.counters.reviewsNew > CONFIG.budget.reviewSpikeThreshold) warnings.push("REVIEW_VOLUME_SPIKE");
    if (this.entries.some((e) => e.priority >= 4 && e.status === "RUN" && e.estimateUsd > this.ceilingUsd * 0.5)) warnings.push("OPTIONAL_SOURCE_EXPENSIVE");
    return { mode: this.mode, projections: ProviderBudget.projections(), ceilingUsd: this.ceilingUsd, estimatedUsd: Number(this.spentUsd.toFixed(4)), cacheHitRatio: Number(ratio.toFixed(2)), ...this.counters, entries: this.entries, warnings };
  }
}
export type BudgetReport = ReturnType<ProviderBudget["report"]>;
