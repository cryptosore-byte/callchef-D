import type { Restaurant } from "@/types";
import { buildDemoMarket } from "@/data/demo";
import { CONFIG } from "@/config";
import { cacheGet, cacheSet } from "@/lib/cache";
import { ProviderBudget, type Priority } from "@/services/ProviderBudgetService";
import { DEFAULT_ACTOR_ID, nearbyInput, reviewsInput, targetInput } from "./apify/inputs";
import { isFoodPlace, nameSimilarity, normalizePlace } from "./apify/normalize";

export interface PlacesSearchQuery { name: string; address: string; }
export interface NearbyQuery { center: { latitude: number; longitude: number }; radiusM: number; maxResults: number; keywords?: string[]; }

export interface NearbyResult {
  places: Restaurant[];
  /** Where the target itself appeared in the nearby searches (Google Maps order), when the provider exposes ranks. */
  targetRanks: { query: string; rank: number }[];
}

export interface PlacesProvider {
  findRestaurant(q: PlacesSearchQuery): Promise<Restaurant | null>;
  findNearby(q: NearbyQuery, excludeId: string): Promise<NearbyResult>;
  /** Attach reviews to the given restaurants (called only for confirmed competitors). */
  enrichWithReviews(rs: Restaurant[], maxPerRestaurant: number): Promise<Restaurant[]>;
  /** LIGHT_REFRESH: re-read known places by URL (rating, review count, hours) with at most `maxReviews` newest reviews. */
  refreshPlaces?(rs: Restaurant[], maxReviews: number, priority?: Priority): Promise<Restaurant[]>;
}

/** Thrown when an OPTIONAL paid call is skipped by the budget guard. Callers degrade gracefully. */
export class BudgetSkipError extends Error {}

export type ApifyErrorCode = "not_found" | "rate_limit" | "actor_failed" | "timeout" | "network";
export class ApifyError extends Error {
  constructor(public code: ApifyErrorCode, detail?: string) { super(detail ? `${code}: ${detail}` : code); }
}

const RETRY_DELAY_MS = Number(process.env.APIFY_RETRY_DELAY_MS ?? 3000);
const RUN_TIMEOUT_MS = 110_000; // Apify's run-sync endpoint allows up to 300 s
const MIN_NAME_SIMILARITY = 0.3;

export class ApifyPlacesProvider implements PlacesProvider {
  constructor(
    private token = process.env.APIFY_API_TOKEN,
    private actorId = process.env.APIFY_GOOGLE_MAPS_ACTOR_ID || DEFAULT_ACTOR_ID,
    private budget?: ProviderBudget,
    /** Reviews fetched with the target: 200 on a deep scan, fewer on a monthly refresh (stored reviews are kept). */
    private targetReviews = CONFIG.reviewDepth.target,
  ) {}

  static isConfigured() { return !!process.env.APIFY_API_TOKEN; }

  /** Places and reviews an input may return, for the cost estimate. */
  private static size(input: Record<string, any>) { // eslint-disable-line @typescript-eslint/no-explicit-any
    const places = Array.isArray(input.startUrls) ? input.startUrls.length : (input.searchStringsArray?.length ?? 1) * (input.maxCrawledPlacesPerSearch ?? 1);
    return { places, reviews: places * (input.maxReviews ?? 0) };
  }

  private async run(input: Record<string, unknown>, source = "google.places", priority: Priority = 1): Promise<any[]> { // eslint-disable-line @typescript-eslint/no-explicit-any
    const key = `${this.actorId}:${JSON.stringify(input)}`;
    const cached = cacheGet<any[]>(key); // eslint-disable-line @typescript-eslint/no-explicit-any
    if (cached) { this.budget?.cached(source, priority); return cached; }
    const { places, reviews } = ApifyPlacesProvider.size(input);
    if (this.budget && !this.budget.allow(source, priority, ProviderBudget.apifyEstimate(places, reviews))) throw new BudgetSkipError(source);

    const url = `https://api.apify.com/v2/acts/${encodeURIComponent(this.actorId)}/run-sync-get-dataset-items`;
    let res!: Response;
    // One retry on a transient Apify failure (5xx, or 408 when the synchronous run took too long).
    for (let attempt = 0; attempt < 2; attempt++) {
      const ctrl = new AbortController();
      const timer = setTimeout(() => ctrl.abort(), RUN_TIMEOUT_MS);
      try {
        res = await fetch(url, {
          method: "POST",
          headers: { "Content-Type": "application/json", Authorization: `Bearer ${this.token}` },
          body: JSON.stringify(input),
          signal: ctrl.signal,
        });
      } catch (e) {
        if ((e as Error).name === "AbortError") throw new ApifyError("timeout");
        throw new ApifyError("network", (e as Error).message);
      } finally { clearTimeout(timer); }
      if (!(res.status >= 500 || res.status === 408) || attempt === 1) break;
      await new Promise((r) => setTimeout(r, RETRY_DELAY_MS));
    }

    if (res.status === 429) throw new ApifyError("rate_limit");
    if (!res.ok) {
      // Apify's error body names the cause (invalid token, no credit, bad input). It never echoes the token.
      const detail = await res.text().then((b) => b.slice(0, 300)).catch(() => "");
      throw new ApifyError("actor_failed", `HTTP ${res.status} ${detail}`.trim());
    }
    const data = await res.json().catch(() => null);
    if (!Array.isArray(data)) throw new ApifyError("actor_failed", "unexpected response shape");
    cacheSet(key, data, CONFIG.limits.scanCacheHours);
    this.budget?.records(data.length);
    return data;
  }

  async findRestaurant(q: PlacesSearchQuery): Promise<Restaurant | null> {
    const now = new Date().toISOString();
    const items = await this.run(targetInput(q.name, q.address, this.targetReviews), "google.target", 1);
    const places = items.map((i) => normalizePlace(i, now, this.targetReviews)).filter((x): x is Restaurant => !!x);
    const best = places
      .map((p) => ({ p, s: nameSimilarity(q.name, p.name) }))
      .sort((a, b) => b.s - a.s)[0];
    if (!best || best.s < MIN_NAME_SIMILARITY) throw new ApifyError("not_found");
    return best.p;
  }

  async findNearby(q: NearbyQuery, excludeId: string): Promise<NearbyResult> {
    const now = new Date().toISOString();
    const items = await this.run(nearbyInput(q.center, q.radiusM, q.maxResults, q.keywords ?? []), "google.nearby", 1);
    const byId = new Map<string, Restaurant>();
    const targetRanks: NearbyResult["targetRanks"] = [];
    for (const i of items) {
      const r = normalizePlace(i, now, 0);
      if (!r) continue;
      if (r.id === excludeId) { targetRanks.push(...(r.searchRanks ?? [])); continue; }
      if (i.permanentlyClosed || i.temporarilyClosed || !isFoodPlace(r.categories)) continue;
      const prev = byId.get(r.id);
      if (prev) { prev.searchRanks = [...(prev.searchRanks ?? []), ...(r.searchRanks ?? [])]; continue; } // same place found by several searches
      byId.set(r.id, r);
    }
    return { places: [...byId.values()].slice(0, q.maxResults), targetRanks };
  }

  async enrichWithReviews(rs: Restaurant[], max: number): Promise<Restaurant[]> {
    if (!rs.length) return rs;
    const now = new Date().toISOString();
    const items = await this.run(reviewsInput(rs, max), "google.competitorReviews", 2);
    const byKey = new Map<string, Restaurant>();
    for (const i of items) {
      const p = normalizePlace(i, now, max);
      if (p) { byKey.set(p.id, p); if (p.source.url) byKey.set(p.source.url, p); }
    }
    return rs.map((r) => {
      const hit = byKey.get(r.id) ?? (r.source.url ? byKey.get(r.source.url) : undefined);
      return hit ? { ...r, reviews: hit.reviews } : r;
    });
  }

  /** LIGHT_REFRESH: one cheap search (main cuisine query only, no reviews) to spot new places nearby. Optional. */
  async findNewNearby(center: { latitude: number; longitude: number }, radiusM: number, keyword: string): Promise<Restaurant[]> {
    const now = new Date().toISOString();
    const input = { ...nearbyInput(center, radiusM, 30, [keyword]), searchStringsArray: [keyword] };
    const items = await this.run(input, "google.newNearby", 4);
    return items.filter((i) => !i.permanentlyClosed).map((i) => normalizePlace(i, now, 0)).filter((x): x is Restaurant => !!x && isFoodPlace(x.categories));
  }

  async refreshPlaces(rs: Restaurant[], maxReviews: number, priority: Priority = 1): Promise<Restaurant[]> {
    const withUrl = rs.filter((r) => r.source.url);
    if (!withUrl.length) return [];
    const now = new Date().toISOString();
    const items = await this.run(reviewsInput(withUrl, maxReviews), maxReviews ? "google.refreshWithReviews" : "google.refreshCounts", priority);
    return items.map((i) => normalizePlace(i, now, maxReviews)).filter((x): x is Restaurant => !!x);
  }
}

/** Demo provider: no keys required, fictional data only. */
export class DemoPlacesProvider implements PlacesProvider {
  private market = buildDemoMarket({ target: CONFIG.limits.maxReviewsTarget, competitor: CONFIG.limits.maxReviewsPerCompetitor });
  async findRestaurant() { return this.market.target; }
  async findNearby(): Promise<NearbyResult> { return { places: this.market.nearby, targetRanks: this.market.targetRanks ?? [] }; }
  async enrichWithReviews(rs: Restaurant[]) { return rs; } // demo reviews are already attached
}
