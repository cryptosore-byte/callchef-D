// Simulated Apify responses (fictional places, French reviews) shaped like compass~crawler-google-places output.
// This validates OUR code path end to end. It does NOT prove the real actor's schema: run once with a real token to confirm.
process.env.APIFY_API_TOKEN = "test-token";
delete process.env.TYPESAFE_API_KEY;
import { runRadar, ApifyError } from "../src/lib/pipeline";
import { parseHoursRange, priceLevelFrom, foodTypeFrom } from "../src/providers/apify/normalize";
import { keywordClassify } from "../src/services/ReviewIntelligenceService";
import { cacheClear } from "../src/lib/cache";
import { computeDataQuality } from "../src/services/MarketFeatureService";
import { makeT } from "../src/i18n";

let calls: any[] = [];
let mode: "ok" | "429" | "empty" | "net" | "noreviews" = "ok";
const place = (id: string, title: string, lat: number, lng: number, cats: string[], score: number, n: number, price: string, hours: string, extra: any = {}) => ({
  placeId: id, title, address: `${title}, Marseille`, location: { lat, lng }, categories: cats, categoryName: cats[0], totalScore: score, reviewsCount: n, price,
  url: `https://www.google.com/maps/place/?q=place_id:${id}`, openingHours: ["Monday","Tuesday","Wednesday","Thursday","Friday","Saturday","Sunday"].map((day) => ({ day, hours })), ...extra,
});
const REV_T = ["Burger top mais frites froides et molles", "Emballage pas terrible, frites ramollies", "Livraison lente, burger délicieux", "Service aimable, portions généreuses", "Trop cher pour ce que c'est", "Frites froides encore une fois, emballage détrempé", "Super burger, personnel sympa", "Attente très longue, déçu"];
const reviews = (n: number) => Array.from({ length: n }, (_, i) => ({ reviewId: `r${i}`, name: "Anon", text: REV_T[i % REV_T.length], stars: [4, 2, 3, 5, 2, 1, 5, 2][i % 8], publishedAtDate: new Date(Date.now() - i * 86400000 * 3).toISOString() }));

const target = place("T1", "Burger Bastide", 43.2951, 5.3745, ["Burger restaurant", "Fast food restaurant"], 4.4, 540, "€10–20", "11:30 AM to 10 PM");
const nearby = [
  target, // must be excluded
  place("C1", "Smash Quartier", 43.2938, 5.3799, ["Burger restaurant", "Late-night food"], 4.5, 1100, "€10–20", "11:30 AM to 2 AM"),
  place("C2", "Le Comptoir Burger", 43.2923, 5.3768, ["Burger restaurant"], 4.2, 480, "€€", "12 to 11 PM"),
  place("C3", "Poulet Roi", 43.2985, 5.3801, ["Fried chicken takeaway"], 4.0, 700, "€", "11 AM to 1 AM"),
  place("N1", "Pizzeria Luna", 43.2932, 5.3712, ["Pizza restaurant"], 4.3, 900, "€€", "12 PM to 11:30 PM"),
  place("N2", "Café Vieux Port", 43.2931, 5.3698, ["Coffee shop"], 4.2, 520, "€€", "7:30 AM to 6 PM"),
  place("FAR", "Burger Lointain", 43.40, 5.55, ["Burger restaurant"], 4.8, 900, "€€", "12 to 10 PM"), // beyond radius
  { placeId: "BAD", title: "No Coordinates", categories: ["Restaurant"] },                          // must be skipped
];
const withRev = (p: any, n: number) => ({ ...p, reviews: reviews(n) });

const realFetch = globalThis.fetch;
globalThis.fetch = (async (_url: any, init: any) => {
  const body = JSON.parse(init.body); calls.push(body);
  if (mode === "net") throw new TypeError("fetch failed");
  if (mode === "429") return new Response("{}", { status: 429 });
  const json = (x: any) => new Response(JSON.stringify(x), { status: 200 });
  if (body.startUrls) return json([withRev(nearby[1], 50), withRev(nearby[2], 50), withRev(nearby[3], 50)]);
  if (body.customGeolocation) return json(nearby);
  if (mode === "empty") return json([]);
  return json([mode === "noreviews" ? target : withRev(target, 200), place("X", "Autre Chose Totalement", 43.3, 5.4, ["Bakery"], 4, 10, "€", "7 AM to 7 PM")]);
}) as any;

const ok = (c: boolean, m: string) => { console.log(c ? "PASS" : "FAIL", m); if (!c) process.exitCode = 1; };
(async () => {
  // unit checks on parsers
  ok(JSON.stringify(parseHoursRange("11:30 AM to 2 AM")) === '{"open":"11:30","close":"02:00"}', "hours: past-midnight close");
  ok(JSON.stringify(parseHoursRange("12 to 11 PM")) === '{"open":"12:00","close":"23:00"}', "hours: missing first meridiem");
  ok(JSON.stringify(parseHoursRange("11 AM to 2 PM, 6 to 11 PM")) === '{"open":"11:00","close":"23:00"}', "hours: split shift");
  ok(parseHoursRange("Closed") === null, "hours: closed day");
  ok(priceLevelFrom({ price: "€€" }) === 2 && priceLevelFrom({ price: "€1–10" }) === 1 && priceLevelFrom({ price: "€10–20" }) === 2 && priceLevelFrom({ price: "€20–30" }) === 3 && priceLevelFrom({ price: "€30–50" }) === 4, "price parsing");
  ok(foodTypeFrom(["Hamburger restaurant"]) === "burger" && foodTypeFrom(["Pizza takeaway"]) === "pizza", "food type mapping");
  const m = keywordClassify({ id: "x", text: "Burger top mais frites froides et molles", rating: 3, date: "", source: "t" });
  ok(m.some((x) => x.theme === "BURGER" && x.sentiment === "positive") && m.some((x) => x.theme === "FRIES" && x.sentiment === "negative" && x.reason === "cold"), "FR clause-level classification");

  // full live run
  const r = await runRadar({ name: "Burger Bastide", address: "Marseille", radiusM: 1000 }, "fr");
  ok(!r.demo, "live mode (not demo)");
  ok(r.target.name === "Burger Bastide" && r.target.openingHours?.close === "22:00" && r.target.priceLevel === 2, "target normalized");
  ok(!r.nearby.some((n) => n.restaurant.id === "T1" || n.restaurant.id === "BAD" || n.restaurant.id === "FAR"), "target, bad-coords and out-of-radius excluded");
  const withReviews = r.competitors.filter((c) => c.restaurant.reviews.length === 50);
  ok(withReviews.length >= 2 && r.competitors.every((c) => c.restaurant.reviews.length === 0 || c.restaurant.reviews.length === 50), `competitors confirmed, reviews attached where returned (${r.competitors.map((c) => c.restaurant.name + ":" + c.restaurant.reviews.length).join(", ")})`);
  // thin competitor data must be flagged (checked directly: the pizzeria is now correctly not a competitor)
  const thinNotes = computeDataQuality(makeT("en"), 200, [{ ...r.competitors[0], restaurant: { ...r.competitors[0].restaurant, id: "thin" } }], { thin: { ...r.summaries[r.target.id], reviewsAnalyzed: 0 } }, 10, "now").notes;
  ok(thinNotes.some((n) => /fewer than/.test(n)), "competitor with <11 reviews is flagged as lower confidence");
  ok(!r.competitors.some((c) => c.restaurant.name === "Pizzeria Luna"), "pizza place gated out by cuisine similarity");
  ok(r.target.reviews.length === 200 && r.dataQuality.level === "HIGH", "target has 200 reviews, HIGH quality");
  ok(r.decisions.available && !!r.decisions.bestTest && !!r.decisions.owner, `decisions produced (${r.decisions.bestTest?.choice}, ${r.decisions.bestTest?.tier})`);
  ok(r.sources[0].provider === "apify:google-maps", "source attribution present");
  ok(r.warnings.some((w) => w.includes("Jev")), "warns that Jev is not configured");
  ok(calls.length === 3, `3 actor runs (target, nearby, competitor reviews): ${calls.length}`);
  ok(calls.find((c) => c.customGeolocation)?.maxReviews === 0, "nearby run requests no reviews (cost control)");
  const before = calls.length; await runRadar({ name: "Burger Bastide", address: "Marseille", radiusM: 1000 }, "en");
  ok(calls.length === before, "second identical run served from cache (0 new actor runs)");

  // failure states
  const expect = async (label: string, code: string, fn: () => Promise<unknown>) => {
    try { await fn(); ok(false, label + " should throw"); } catch (e) { ok(e instanceof ApifyError && e.code === code, `${label} -> ${code}`); }
  };
  cacheClear(); mode = "empty"; await expect("empty results", "not_found", () => runRadar({ name: "Zzz", address: "x", radiusM: 1000 }));
  cacheClear(); mode = "429"; await expect("HTTP 429", "rate_limit", () => runRadar({ name: "Burger Bastide", address: "x", radiusM: 1000 }));
  cacheClear(); mode = "net"; await expect("network error", "network", () => runRadar({ name: "Burger Bastide", address: "x", radiusM: 1000 }));
  cacheClear(); mode = "noreviews";
  const nr = await runRadar({ name: "Burger Bastide", address: "x", radiusM: 1000 }, "en");
  ok(nr.dataQuality.level === "LOW" && nr.warnings.some((w) => w.includes("No public reviews")), "no reviews -> LOW quality + warning");
  ok(nr.decisions.bestTest?.tier !== "STRONG" && nr.decisions.owner?.action.tier !== "STRONG", `no reviews -> no strong recommendation (${nr.decisions.bestTest?.choice}, ${nr.decisions.bestTest?.tier})`);
  globalThis.fetch = realFetch;
})();
