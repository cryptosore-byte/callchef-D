// ALL actor-specific INPUT shapes live here. If the actor's input schema changes, edit only this file.
// Written for "compass~crawler-google-places"; confirm field names on the actor's Input tab.
import type { Restaurant } from "@/types";

export const DEFAULT_ACTOR_ID = "compass~crawler-google-places";

export const targetInput = (name: string, address: string, maxReviews: number) => ({
  searchStringsArray: [`${name} ${address}`.trim()],
  maxCrawledPlacesPerSearch: 3, // a few candidates so we can pick the best name match
  language: "en",
  maxReviews,
  reviewsSort: "newest",
});

export const nearbyInput = (center: { latitude: number; longitude: number }, radiusM: number, max: number, keywords: string[]) => ({
  // targeted searches first (same cuisine), then a generic one for market context
  searchStringsArray: [...keywords, "restaurant"],
  customGeolocation: { type: "Point", coordinates: [center.longitude, center.latitude], radiusKm: radiusM / 1000 },
  maxCrawledPlacesPerSearch: Math.max(5, Math.ceil(max / 2)),
  language: "en",
  maxReviews: 0, // reviews are fetched later, for confirmed competitors only (cost control)
  skipClosedPlaces: true,
});

export const reviewsInput = (rs: Restaurant[], maxReviews: number) => ({
  startUrls: rs.filter((r) => r.source.url).map((r) => ({ url: r.source.url })),
  language: "en",
  maxReviews,
  reviewsSort: "newest",
});
