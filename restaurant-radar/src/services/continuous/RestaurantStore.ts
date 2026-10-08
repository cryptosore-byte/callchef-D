// Persistence for continuous intelligence: one record per restaurant, plus an index from the owner's query.
import { hash, storeGet, storePut } from "@/lib/store";
import type { Restaurant, Review } from "@/types";
import type { RestaurantRecord, StoredReview } from "./types";

const NS = "restaurants";
const IDX = "restaurant-index";
const MAX_SNAPSHOTS = 60;
const MAX_TIMELINE = 80;

export const queryKey = (q: { name: string; address: string; radiusM: number; demo?: boolean }) =>
  hash(`${q.demo ? "demo|" : ""}${q.name.trim().toLowerCase()}|${q.address.trim().toLowerCase()}|${q.radiusM}`);

export function findRecord(q: { name: string; address: string; radiusM: number; demo?: boolean }): RestaurantRecord | undefined {
  const id = storeGet<{ id: string }>(IDX, queryKey(q))?.id;
  return id ? loadRecord(id) : undefined;
}
export const loadRecord = (id: string) => storeGet<RestaurantRecord>(NS, id);

export function saveRecord(r: RestaurantRecord) {
  r.snapshots = r.snapshots.slice(-MAX_SNAPSHOTS);
  r.timeline = r.timeline.slice(-MAX_TIMELINE);
  storePut(NS, r.id, r);
  storePut(IDX, queryKey(r.input), { id: r.id });
}

/** Stable review identity: provider id when present, else a hash of (place, date, text). */
export const reviewHash = (placeId: string, r: Review) => (r.id && !/-r\d+$/.test(r.id) ? `id:${r.id}` : `h:${hash(`${placeId}|${r.date.slice(0, 10)}|${r.text.slice(0, 200)}`)}`);

/**
 * Merge freshly fetched reviews into the stored set. Existing reviews keep their classification (`mentions`),
 * so the classifier (keyword or LLM) only ever sees NEW reviews. Returns counts for the cost panel.
 */
export function mergeReviews(rec: RestaurantRecord, placeId: string, fresh: Review[]): { reused: number; added: number } {
  const bucket = (rec.reviews[placeId] ??= {});
  let reused = 0, added = 0;
  for (const r of fresh) {
    const h = reviewHash(placeId, r);
    if (bucket[h]) { reused++; continue; }
    bucket[h] = { ...r, hash: h };
    added++;
  }
  return { reused, added };
}

/** All stored reviews of a place, newest first. */
export const storedReviews = (rec: RestaurantRecord, placeId: string): StoredReview[] =>
  Object.values(rec.reviews[placeId] ?? {}).sort((a, b) => b.date.localeCompare(a.date));

/** Store a place profile without its reviews (they live in `reviews`). */
export function rememberPlace(rec: RestaurantRecord, r: Restaurant) {
  rec.places[r.id] = { ...r, reviews: [] };
}
