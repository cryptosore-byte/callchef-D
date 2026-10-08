// Continuous intelligence orchestrator: decides the scan mode, serves stored data, refreshes only what is cheap and
// change-sensitive, and keeps the restaurant's history (snapshots, timeline, experiments).
//   DEEP_SCAN       first analysis, explicit request, or data older than deepScanMaxAgeDays
//   MONTHLY_REFRESH every monthlyRefreshDays: stronger refresh, fewer target reviews (stored ones are kept)
//   LIGHT_REFRESH   weekly: ratings, counts, hours, newest target reviews, new places (optional), changed competitors only
//   CACHE           more recent than lightRefreshMinDays, or after an owner action: zero provider call
import { CONFIG } from "@/config";
import type { Locale } from "@/i18n";
import type { RadarInput, RadarResult, Restaurant, Review } from "@/types";
import type { DecisionProvider } from "@/providers/DecisionProvider";
import { ApifyPlacesProvider, BudgetSkipError, DemoPlacesProvider, type NearbyQuery, type NearbyResult, type PlacesProvider, type PlacesSearchQuery } from "@/providers/ApifyPlacesProvider";
import { ProviderBudget, type ScanMode } from "@/services/ProviderBudgetService";
import { ensureMentions } from "@/services/ReviewIntelligenceService";
import { isLive, runRadar, type RadarProgress } from "@/lib/pipeline";
import { cacheDelete } from "@/lib/cache";
import { findRecord, mergeReviews, rememberPlace, saveRecord, storedReviews } from "@/services/continuous/RestaurantStore";
import { buildSnapshot } from "@/services/continuous/SnapshotService";
import { detectChanges, interpretation, topChanges, type MarketChange } from "@/services/continuous/MarketChangeService";
import { activeExperiment, lastFinished, ruleVerdict, updateExperiments, EXPERIMENTS } from "@/services/continuous/ExperimentService";
import { simulate, type Simulation } from "@/services/continuous/OpportunitySimulator";
import { monthlyReport, type MonthlyReport } from "@/services/continuous/MonthlyReportService";
import { demoHistory, demoMenus } from "@/data/demoHistory";
import type { Experiment, RestaurantRecord, TimelineEvent } from "@/services/continuous/types";

export type RequestedMode = "auto" | "deep" | "light" | "monthly" | "cache";
export type DeepArea = "reviews" | "competitors" | "visibility" | "menu" | "instagram";

export interface ContinuousView {
  restaurantId: string;
  mode: ScanMode;
  isFirstScan: boolean;
  previousScanAt?: string;
  changes: MarketChange[];
  meaning: string;
  timeline: TimelineEvent[];
  active?: Experiment & { progress: number };
  finished?: Experiment;
  simulation?: Simulation | null;
  financials?: RestaurantRecord["financials"];
  monthly?: MonthlyReport;
}

const DAY = 86_400_000;
const age = (iso: string | undefined, now: number) => (iso ? (now - new Date(iso).getTime()) / DAY : Infinity);

export function resolveMode(req: RequestedMode, rec: RestaurantRecord | undefined, now: number): ScanMode {
  if (!rec) return "DEEP_SCAN";
  if (req === "deep") return "DEEP_SCAN";
  if (req === "light") return "LIGHT_REFRESH";
  if (req === "monthly") return "MONTHLY_REFRESH";
  if (req === "cache") return "CACHE";
  const M = CONFIG.scanModes;
  if (age(rec.lastDeepAt, now) > M.deepScanMaxAgeDays) return "DEEP_SCAN";
  if (age(rec.lastRefreshAt, now) < M.lightRefreshMinDays) return "CACHE";
  if (age(rec.lastMonthlyAt ?? rec.lastDeepAt, now) > M.monthlyRefreshDays) return "MONTHLY_REFRESH";
  return "LIGHT_REFRESH";
}

/** Attach every stored review of a place, merging new ones first. Classification is reused for known reviews. */
function withStored(rec: RestaurantRecord, r: Restaurant, fresh: Review[], budget: ProviderBudget): Restaurant {
  const { reused, added } = mergeReviews(rec, r.id, fresh);
  budget.counters.reviewsReused += reused;
  budget.counters.reviewsNew += added;
  // Classify only the reviews that have no mentions yet (new ones), then write them back.
  const all = storedReviews(rec, r.id);
  const classified = ensureMentions(all);
  classified.forEach((c, i) => { if (!all[i].mentions) rec.reviews[r.id][all[i].hash].mentions = c.mentions; });
  return { ...r, reviews: classified };
}

/** Full scans: the real provider, with every fetched review merged into the store. */
class MergingProvider implements PlacesProvider {
  constructor(private base: PlacesProvider, private rec: RestaurantRecord, private budget: ProviderBudget) {}
  async findRestaurant(q: PlacesSearchQuery) {
    const r = await this.base.findRestaurant(q);
    if (!r) return r;
    this.rec.id ||= r.id; this.rec.targetId = r.id;
    return withStored(this.rec, r, r.reviews, this.budget);
  }
  findNearby(q: NearbyQuery, excludeId: string) { return this.base.findNearby(q, excludeId); }
  async enrichWithReviews(rs: Restaurant[], max: number) {
    const out = await this.base.enrichWithReviews(rs, max);
    return out.map((r) => withStored(this.rec, r, r.reviews, this.budget));
  }
}

/** LIGHT_REFRESH / CACHE: serve the stored market, refreshing only cheap, change-sensitive signals. */
interface RefreshPlan {
  counts: boolean;                                    // ratings / review counts / hours of target + known competitors
  targetNew: number;                                  // newest target reviews to fetch
  newPlaces: "cheap" | "full" | "none";               // one-query search, full nearby scan, or nothing
  competitorReviews: "moved" | "benchmarks" | "none"; // only competitors that moved, top benchmarks (deep dive), or none
}
const LIGHT: RefreshPlan = { counts: true, targetNew: CONFIG.reviewDepth.lightTargetNew, newPlaces: "cheap", competitorReviews: "moved" };
const NONE_PLAN: RefreshPlan = { counts: false, targetNew: 0, newPlaces: "none", competitorReviews: "none" };
/** Deep dive on ONE area: only that area is re-fetched (Part 24). */
const AREA_PLAN: Record<DeepArea, RefreshPlan> = {
  reviews: { counts: true, targetNew: CONFIG.reviewDepth.target, newPlaces: "none", competitorReviews: "benchmarks" },
  competitors: { counts: true, targetNew: 0, newPlaces: "full", competitorReviews: "none" },
  visibility: { counts: false, targetNew: 0, newPlaces: "none", competitorReviews: "none" },
  menu: NONE_PLAN, instagram: NONE_PLAN, // sources not connected: nothing to fetch
};

class StoredProvider implements PlacesProvider {
  constructor(private base: PlacesProvider, private rec: RestaurantRecord, private budget: ProviderBudget, private plan: RefreshPlan) {}

  async findRestaurant() {
    let t = this.rec.places[this.rec.targetId];
    let fresh: Review[] = [];
    if ((this.plan.counts || this.plan.targetNew) && this.base.refreshPlaces) {
      try {
        const [u] = await this.base.refreshPlaces([t], this.plan.targetNew, 1);
        if (u) { t = { ...t, rating: u.rating, reviewCount: u.reviewCount, openingHours: u.openingHours ?? t.openingHours, weeklyHours: u.weeklyHours ?? t.weeklyHours, closed: u.closed }; fresh = u.reviews; }
      } catch (e) { if (!(e instanceof BudgetSkipError)) throw e; }
    }
    return withStored(this.rec, t, fresh, this.budget);
  }

  async findNearby(q: NearbyQuery): Promise<NearbyResult> {
    const places = new Map(Object.values(this.rec.places).filter((p) => p.id !== this.rec.targetId).map((p) => [p.id, { ...p }]));
    if (this.plan.counts && this.base.refreshPlaces) {
      // Ratings, counts and hours of the known direct competitors: cheap and the most change-sensitive signal.
      const known = this.rec.confirmedIds.map((id) => places.get(id)).filter((p): p is Restaurant => !!p);
      try {
        for (const u of await this.base.refreshPlaces(known, 0, 1)) {
          const p = places.get(u.id);
          if (p) places.set(u.id, { ...p, rating: u.rating, reviewCount: u.reviewCount, openingHours: u.openingHours ?? p.openingHours, weeklyHours: u.weeklyHours ?? p.weeklyHours, closed: u.closed });
        }
      } catch (e) { if (!(e instanceof BudgetSkipError)) throw e; }
    }
    // New places: ONE cheap search on the main cuisine query (optional), or the full nearby scan on a deep dive.
    const kw = q.keywords?.[0];
    if (this.plan.newPlaces === "cheap" && kw && this.base instanceof ApifyPlacesProvider) {
      try {
        for (const n of await this.base.findNewNearby(q.center, q.radiusM, kw)) if (!places.has(n.id) && n.id !== this.rec.targetId) places.set(n.id, n);
      } catch (e) { if (!(e instanceof BudgetSkipError)) throw e; }
    }
    if (this.plan.newPlaces === "full") {
      const full = await this.base.findNearby(q, this.rec.targetId);
      for (const n of full.places) places.set(n.id, { ...places.get(n.id), ...n });
      return { places: [...places.values()], targetRanks: full.targetRanks };
    }
    return { places: [...places.values()], targetRanks: this.rec.places[this.rec.targetId]?.searchRanks ?? [] };
  }

  async enrichWithReviews(rs: Restaurant[]) {
    // Only competitors whose review count moved materially get their newest reviews; the rest reuse the store.
    const D = CONFIG.reviewDepth;
    const prev = this.rec.snapshots[this.rec.snapshots.length - 1];
    if (this.plan.competitorReviews === "benchmarks" && this.base.refreshPlaces) {
      const strong = rs.slice(0, D.strongBenchmarkCount);
      const fresh = new Map<string, Review[]>();
      for (const u of await this.base.refreshPlaces(strong, D.strongBenchmark, 2)) fresh.set(u.id, u.reviews);
      return rs.map((r) => withStored(this.rec, r, fresh.get(r.id) ?? [], this.budget));
    }
    const moved = this.plan.competitorReviews === "none" ? [] : rs.filter((r) => {
      const p = prev?.competitors.find((c) => c.id === r.id) ?? prev?.nearby.find((c) => c.id === r.id);
      if (!p) return false;
      const d = r.reviewCount - p.reviewCount;
      return d >= D.materialReviewDelta || d >= p.reviewCount * D.materialReviewPct;
    });
    const fresh = new Map<string, Review[]>();
    if (moved.length && this.base.refreshPlaces) {
      try { for (const u of await this.base.refreshPlaces(moved, D.lightCompetitorNew, 2)) fresh.set(u.id, u.reviews); } catch (e) { if (!(e instanceof BudgetSkipError)) throw e; }
    }
    return rs.map((r) => withStored(this.rec, r, fresh.get(r.id) ?? [], this.budget));
  }
}

export interface ScanOptions { mode?: RequestedMode; area?: DeepArea; onProgress?: (p: RadarProgress) => void; decider?: DecisionProvider; nowMs?: number; places?: PlacesProvider; }

export async function runScan(input: RadarInput, locale: Locale, o: ScanOptions = {}): Promise<RadarResult> {
  const now = o.nowMs ?? Date.now();
  const demo = input.demo || !isLive();
  let rec = findRecord({ ...input, demo });
  const isFirstScan = !rec;
  if (!rec && demo) rec = demoHistory(input, now); // fictional history so the demo shows changes and experiments
  let mode = resolveMode(o.mode ?? "auto", rec, now);
  if (rec && !rec.places[rec.targetId] && mode !== "DEEP_SCAN") mode = "DEEP_SCAN"; // nothing stored to refresh
  // A deep dive refreshes ONE area on top of the stored data; it is never a full rescan.
  const area = rec?.places[rec.targetId] ? o.area : undefined;
  if (area) mode = "DEEP_SCAN";
  if (area === "visibility" && rec) { const site = rec.places[rec.targetId]?.website; if (site) cacheDelete(`site:${site}`); }
  const budget = new ProviderBudget(mode);
  const record: RestaurantRecord = rec ?? { id: "", name: input.name, input: { ...input, demo }, createdAt: new Date(now).toISOString(), places: {}, targetId: "", confirmedIds: [], reviews: {}, snapshots: [], timeline: [], experiments: [] };
  const previous = record.snapshots[record.snapshots.length - 1];

  const base: PlacesProvider = o.places ?? (demo ? new DemoPlacesProvider() : new ApifyPlacesProvider(undefined, undefined, budget, mode === "MONTHLY_REFRESH" ? 50 : CONFIG.reviewDepth.target));
  const places: PlacesProvider = area
    ? new StoredProvider(base, record, budget, demo ? NONE_PLAN : AREA_PLAN[area])
    : mode === "DEEP_SCAN" || mode === "MONTHLY_REFRESH"
      ? new MergingProvider(base, record, budget)
      : new StoredProvider(base, record, budget, mode === "LIGHT_REFRESH" && !demo ? LIGHT : NONE_PLAN);

  let changes: MarketChange[] = [];
  const events: TimelineEvent[] = [];
  const iso = new Date(now).toISOString();

  const result = await runRadar(input, locale, {
    decider: o.decider, onProgress: o.onProgress, places, budget,
    continuous: (a) => {
      const snap = buildSnapshot(mode, a.target, a.competitors, a.nearby, a.summary, a.digital, now);
      if (mode !== "CACHE") {
        if (previous) changes = detectChanges(previous, snap);
        record.snapshots.push(snap);
      } else if (record.snapshots.length >= 2) {
        changes = detectChanges(record.snapshots[record.snapshots.length - 2], record.snapshots[record.snapshots.length - 1]);
      }
      for (const e of updateExperiments(record, a.target, now)) events.push({ at: iso, kind: e.kind, code: e.code, params: e.params });
      const finished = lastFinished(record);
      const recent = finished && age(finished.endDate, now) <= 45 ? finished : undefined;
      const menus = demo ? demoMenus(a.target, a.competitors.map((c) => c.restaurant)) : undefined;
      return {
        input: { changes, active: activeExperiment(record), finished: recent, menu: [] },
        experimentRule: recent?.result ? ruleVerdict(recent.type, recent.result.before, recent.result.after) : undefined,
        menuTarget: menus?.target, menuCompetitors: menus?.competitors,
      };
    },
  });

  // Jev may refine the verdict of a finished experiment, only when the measurement was sufficient.
  const fin = lastFinished(record);
  const jr = result.decisions.experimentResult;
  if (fin?.result && jr && jr.engine !== "rule" && ["PROMISING", "NO_CLEAR_EFFECT", "NEGATIVE"].includes(jr.choice)) fin.result = { ...fin.result, label: jr.choice as never, decidedBy: jr.engine };

  // Persist what we learned (places without reviews; reviews live in the review store).
  if (mode !== "CACHE") {
    rememberPlace(record, result.target);
    for (const n of result.nearby) rememberPlace(record, n.restaurant);
    record.confirmedIds = result.competitors.map((c) => c.restaurant.id);
    record.id ||= result.target.id; record.targetId = result.target.id; record.name = result.target.name;
    record.lastRefreshAt = iso;
    if (mode === "DEEP_SCAN" && !area) record.lastDeepAt = iso;
    if (mode === "MONTHLY_REFRESH") record.lastMonthlyAt = iso;
    if (isFirstScan && !demo) record.timeline.push({ at: iso, kind: "INITIAL_SCAN", code: "tl.initial" });
    else if (mode === "DEEP_SCAN" || mode === "MONTHLY_REFRESH") record.timeline.push({ at: iso, kind: "DEEP_SCAN", code: mode === "DEEP_SCAN" ? "tl.deep" : "tl.monthly" });
    for (const c of topChanges(changes).filter((c) => c.importance >= 0.6)) record.timeline.push({ at: iso, kind: "CHANGE", code: "chg." + c.type, params: c.params });
  }
  record.timeline.push(...events);
  saveRecord(record);

  const active = activeExperiment(record);
  const top = topChanges(changes);
  const sim = active ? simulate(active.type, record.financials) : result.decisions.bestTest ? simulate(result.decisions.bestTest.choice as never, record.financials) : null;
  result.continuous = {
    restaurantId: record.id, mode, isFirstScan: isFirstScan && !demo, previousScanAt: previous?.at,
    changes: top, meaning: interpretation(top, !!active),
    timeline: record.timeline.slice(-8),
    active: active ? { ...active, progress: Math.min(1, Math.max(0, (now - new Date(active.startDate).getTime()) / (new Date(active.endDate).getTime() - new Date(active.startDate).getTime()))) } : undefined,
    finished: lastFinished(record),
    simulation: sim, financials: record.financials,
    monthly: monthlyReport(record, now),
  };
  // Known experiment types only (guards against stale stored data).
  if (result.continuous.active && !EXPERIMENTS[result.continuous.active.type]) result.continuous.active = undefined;
  return result;
}

