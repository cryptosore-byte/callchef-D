// Homepage: autocomplete providers (no paid call), compare matching, request parsing. No network.
/* eslint-disable @typescript-eslint/no-explicit-any */
import { DemoSuggestProvider, PhotonSuggestProvider } from "../src/providers/PlaceSuggestProvider";
import { matchPlace } from "../src/lib/pipeline";
import { parseRadarBody } from "../src/lib/radarInput";

let fails = 0;
const ok = (c: boolean, m: string) => { console.log(c ? "PASS" : "FAIL", m); if (!c) fails++; };

(async () => {
  const demo = new DemoSuggestProvider();
  ok((await demo.suggest("bras", "fr")).map((s) => s.name).join() === "Maison Brasero", "demo target suggestions: only the demo target");
  ok((await demo.suggest("tonton", "fr", "compare"))[0]?.name === "Chez Tonton Grill", "demo compare suggestions: other demo places");

  const seen: string[] = [];
  globalThis.fetch = (async (u: any) => {
    seen.push(String(u));
    return new Response(JSON.stringify({ features: [
      { properties: { osm_type: "N", osm_id: 1, name: "Barlou Burger", osm_value: "fast_food", housenumber: "12", street: "Rue Test", postcode: "13001", city: "Marseille" } },
      { properties: { osm_type: "W", osm_id: 2, name: "Barlou Parking", osm_value: "parking", city: "Marseille" } },
    ] }), { status: 200 });
  }) as any;
  const s = await new PhotonSuggestProvider("https://geo.test/api").suggest("barlou", "fr");
  ok(s.length === 1 && s[0].address === "12 Rue Test, 13001 Marseille" && s[0].kind === "fast_food", "photon: food places only, address built from street + city");
  ok(seen.length === 1 && !seen[0].includes("apify"), "autocomplete never calls a paid provider");

  const cands = ["Chez Tonton Grill", "Tonton", "Smash District"].map((name, i) => ({ restaurant: { id: `c${i}`, name } })) as any;
  ok(matchPlace("chez tonton", cands)?.restaurant.id === "c0", "compare: all query words must match");
  ok(matchPlace("Tonton", cands)?.restaurant.id === "c1", "compare: shortest exact-ish name wins");
  ok(!matchPlace("Le Grand Véfour", cands), "compare: unknown place is not matched (no forced guess)");
  ok(parseRadarBody({ name: "A", compareWith: "  B  " }).input.compareWith === "B" && !("compareWith" in parseRadarBody({ name: "A", compareWith: " " }).input), "request: compareWith trimmed, empty dropped");

  console.log(fails ? `${fails} FAILED` : "all passed");
  process.exit(fails ? 1 : 0);
})();
