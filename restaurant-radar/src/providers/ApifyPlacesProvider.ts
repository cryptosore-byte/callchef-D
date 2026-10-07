import type { Restaurant } from "@/types";
import { buildDemoMarket } from "@/data/demo";
import { CONFIG } from "@/config";
import { cacheGet, cacheSet } from "@/lib/cache";
import { DEFAULT_ACTOR_ID, nearbyInput, reviewsInput, targetInput } from "./apify/inputs";
import { isFoodPlace, nameSimilarity, normalizePlace } from "./apify/normalize";

export interface PlacesSearchQuery { name: string; address: string; }
export interface NearbyQuery { center: { latitude: number; longitude: number }; radiusM: number; maxResults: number; keywords?: string[]; }

export interface PlacesProvider {
  findRestaurant(q: PlacesSearchQuery): Promise<Restaurant | null>;
  findNearby(q: NearbyQuery, excludeId: string): Promise<Restaurant[]>;
  /** Attach reviews to the given restaurants (called only for confirmed competitors). */
  enrichWithReviews(rs: Restaurant[], maxPerRestaurant: number): Promise<Restaurant[]>;
}

export type ApifyErrorCode = "not_found" | "rate_limit" | "actor_failed" | "timeout" | "network";
export class ApifyError extends Error {
  constructor(public code: ApifyErrorCode, detail?: string) { super(detail ? `${code}: ${detail}` : code); }
}

const RUN_TIMEOUT_MS = 110_000; // Apify's run-sync endpoint allows up to 300 s
const MIN_NAME_SIMILARITY = 0.3;

export class ApifyPlacesProvider implements PlacesProvider {
  constructor(
    private token = process.env.APIFY_API_TOKEN,
    private actorId = process.env.APIFY_GOOGLE_MAPS_ACTOR_ID || DEFAULT_ACTOR_ID,
  ) {}

  static isConfigured() { return !!process.env.APIFY_API_TOKEN; }

  private async run(input: object): Promise<any[]> { // eslint-disable-line @typescript-eslint/no-explicit-any
    const key = `${this.actorId}:${JSON.stringify(input)}`;
    const cached = cacheGet<any[]>(key); // eslint-disable-line @typescript-eslint/no-explicit-any
    if (cached) return cached;

    const url = `https://api.apify.com/v2/acts/${encodeURIComponent(this.actorId)}/run-sync-get-dataset-items`;
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), RUN_TIMEOUT_MS);
    let res: Response;
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

    if (res.status === 429) throw new ApifyError("rate_limit");
    if (!res.ok) {
      // Apify's error body names the cause (invalid token, no credit, bad input). It never echoes the token.
      const detail = await res.text().then((b) => b.slice(0, 300)).catch(() => "");
      throw new ApifyError("actor_failed", `HTTP ${res.status} ${detail}`.trim());
    }
    const data = await res.json().catch(() => null);
    if (!Array.isArray(data)) throw new ApifyError("actor_failed", "unexpected response shape");
    cacheSet(key, data, CONFIG.limits.scanCacheHours);
    return data;
  }

  async findRestaurant(q: PlacesSearchQuery): Promise<Restaurant | null> {
    const now = new Date().toISOString();
    const items = await this.run(targetInput(q.name, q.address, CONFIG.limits.maxReviewsTarget));
    const places = items.map((i) => normalizePlace(i, now, CONFIG.limits.maxReviewsTarget)).filter((x): x is Restaurant => !!x);
    const best = places
      .map((p) => ({ p, s: nameSimilarity(q.name, p.name) }))
      .sort((a, b) => b.s - a.s)[0];
    if (!best || best.s < MIN_NAME_SIMILARITY) throw new ApifyError("not_found");
    return best.p;
  }

  async findNearby(q: NearbyQuery, excludeId: string): Promise<Restaurant[]> {
    const now = new Date().toISOString();
    const items = await this.run(nearbyInput(q.center, q.radiusM, q.maxResults, q.keywords ?? []));
    const seen = new Set<string>([excludeId]);
    const out: Restaurant[] = [];
    for (const i of items) {
      if (i.permanentlyClosed || i.temporarilyClosed) continue;
      const r = normalizePlace(i, now, 0);
      if (!r || seen.has(r.id) || !isFoodPlace(r.categories)) continue;
      seen.add(r.id); out.push(r);
    }
    return out.slice(0, q.maxResults);
  }

  async enrichWithReviews(rs: Restaurant[], max: number): Promise<Restaurant[]> {
    if (!rs.length) return rs;
    const now = new Date().toISOString();
    const items = await this.run(reviewsInput(rs, max));
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
}

/** Demo provider: no keys required, fictional data only. */
export class DemoPlacesProvider implements PlacesProvider {
  private market = buildDemoMarket({ target: CONFIG.limits.maxReviewsTarget, competitor: CONFIG.limits.maxReviewsPerCompetitor });
  async findRestaurant() { return this.market.target; }
  async findNearby() { return this.market.nearby; }
  async enrichWithReviews(rs: Restaurant[]) { return rs; } // demo reviews are already attached
}
