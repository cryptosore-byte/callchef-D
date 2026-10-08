// Homepage autocomplete. Deliberately NOT Apify: one keystroke must never trigger a paid scraping run.
// Live: Photon (OpenStreetMap geocoder built for search-as-you-type; free, fair use, self-hostable via PLACE_SUGGEST_URL).
// Demo: the fictional demo places. The full Google Maps diagnosis starts only after the owner confirms the restaurant.
import { DEMO_PLACE_NAMES } from "@/data/demo";

export interface PlaceSuggestion {
  id: string;
  name: string;
  /** Street + city, used as the address of the scan. */
  address: string;
  street?: string;
  city?: string;
  /** OSM amenity: restaurant, fast_food, cafe, bar, pub... */
  kind?: string;
  source: "osm" | "demo";
}

export interface PlaceSuggestProvider { suggest(q: string, lang: string, scope?: "target" | "compare"): Promise<PlaceSuggestion[]>; }

const FOOD = new Set(["restaurant", "fast_food", "cafe", "bar", "pub", "food_court", "ice_cream", "biergarten"]);

export class PhotonSuggestProvider implements PlaceSuggestProvider {
  constructor(private url = process.env.PLACE_SUGGEST_URL || "https://photon.komoot.io/api") {}
  async suggest(q: string, lang: string): Promise<PlaceSuggestion[]> {
    const u = new URL(this.url);
    u.searchParams.set("q", q);
    u.searchParams.set("limit", "15");
    u.searchParams.set("osm_tag", "amenity");
    if (["fr", "en", "de"].includes(lang)) u.searchParams.set("lang", lang);
    const res = await fetch(u, { headers: { "User-Agent": "RestaurantRadar/1.0 (autocomplete)" }, signal: AbortSignal.timeout(3500) });
    if (!res.ok) throw new Error(`suggest ${res.status}`);
    const json = (await res.json()) as { features?: { properties?: Record<string, string | number | undefined> }[] };
    const out: PlaceSuggestion[] = [];
    for (const f of json.features ?? []) {
      const p = f.properties ?? {};
      if (!p.name || !FOOD.has(String(p.osm_value))) continue;
      const street = [p.housenumber, p.street].filter(Boolean).join(" ");
      const city = [p.postcode, p.city ?? p.town ?? p.village].filter(Boolean).join(" ");
      out.push({ id: `osm:${p.osm_type}${p.osm_id}`, name: String(p.name), address: [street, city].filter(Boolean).join(", "), street: street || undefined, city: String(p.city ?? p.town ?? p.village ?? "") || undefined, kind: String(p.osm_value), source: "osm" });
    }
    return out.slice(0, 6);
  }
}

export class DemoSuggestProvider implements PlaceSuggestProvider {
  // The demo market has ONE target; other demo places are only offered as the restaurant to compare with.
  async suggest(q: string, _lang: string, scope: "target" | "compare" = "target"): Promise<PlaceSuggestion[]> {
    const n = q.toLowerCase();
    return DEMO_PLACE_NAMES.filter((p) => (scope === "target") === p.target && p.name.toLowerCase().includes(n)).slice(0, 6)
      .map((p) => ({ id: `demo:${p.id}`, name: p.name, address: p.address, street: p.address.split(",")[0], city: "Marseille", kind: "restaurant", source: "demo" as const }));
  }
}
