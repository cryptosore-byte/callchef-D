// V3 intelligence checks: food type, Bayesian reputation, threat vs benchmark. Fictional fixtures modelled on the Barlou case.
import type { Restaurant } from "../src/types";
import { detectFoodType, withFoodProfile } from "../src/services/FoodTypeDetectionService";
import { adjustedRating } from "../src/services/ReputationService";
import { scoreCandidates } from "../src/services/CompetitorDetectionService";

let fails = 0;
const ok = (c: boolean, m: string) => { console.log(c ? "PASS" : "FAIL", m); if (!c) fails++; };
const now = new Date().toISOString();
const R = (o: Partial<Restaurant> & { id: string; name: string }): Restaurant => ({
  address: "Marseille", latitude: 43.2951, longitude: 5.3745, categories: [], primaryFoodType: "other", format: "fast_food",
  rating: 4.4, reviewCount: 100, priceLevel: 2, priceKnown: true, openingHours: { open: "11:30", close: "23:00" },
  source: { provider: "test", retrievedAt: now }, reviews: [], ...o,
});
const rev = (texts: string[]) => texts.map((text, i) => ({ id: `r${i}`, text, rating: 5, date: now, source: "t" }));

(async () => {
  // ---- food type
  const target = withFoodProfile(R({
    id: "T", name: "Barlou Burger", categories: ["Hamburger restaurant"], rating: 4.5, reviewCount: 519,
    description: "Burgers gourmet faits maison, viande halal", attributes: ["Delivery", "Halal food"],
    reviews: rev(["Burger incroyable", "Le meilleur burger gourmet", "Livraison rapide, burger chaud", "Portions généreuses", "Burger halal top", "Frites maison", "Super burger", "burger"]),
  }));
  const fp = target.foodProfile!;
  ok(fp.primary === "GOURMET_BURGER" && fp.secondary === "BURGER", `Barlou -> ${fp.primary} / ${fp.secondary}`);
  ok(fp.level === "HIGH" && fp.evidence.length >= 2, `confidence ${fp.confidence} (${fp.level}) with ${fp.evidence.length} evidence items`);
  ok(fp.modifiers.some((m) => m.key === "HALAL") && fp.modifiers.some((m) => m.key === "PREMIUM"), `modifiers: ${fp.modifiers.map((m) => m.key).join(",")}`);
  const vague = detectFoodType(R({ id: "V", name: "Chez Paul", categories: ["Restaurant"] }));
  ok(vague.level === "LOW", `no cuisine signal -> LOW confidence (${vague.primary}, ${vague.confidence})`);
  const smash = detectFoodType(R({ id: "S", name: "Banger Burger", categories: ["Hamburger restaurant", "Smash burger"] }));
  ok(smash.primary === "SMASH_BURGER", `smash detected (${smash.primary})`);

  // ---- Bayesian reputation
  const C = 4.4;
  const a = adjustedRating(5.0, 12, C), b = adjustedRating(4.6, 450, C);
  ok(a < b, `5.0/12 -> ${a.toFixed(2)} < 4.6/450 -> ${b.toFixed(2)}`);

  // ---- threat vs benchmark
  const banger = withFoodProfile(R({ id: "BANGER", name: "Banger Burger", categories: ["Hamburger restaurant"], rating: 5.0, reviewCount: 12, latitude: 43.2973, longitude: 5.3745, attributes: ["Delivery", "Halal food"] }));
  const french = withFoodProfile(R({ id: "FRENCH", name: "French Burger", categories: ["Hamburger restaurant"], description: "Burgers gourmet", rating: 4.6, reviewCount: 430, latitude: 43.3027, longitude: 5.3745, attributes: ["Delivery"] }));
  const pizza = withFoodProfile(R({ id: "PIZZA", name: "Pizza Roma", categories: ["Pizza restaurant"], rating: 4.8, reviewCount: 900, latitude: 43.2960, longitude: 5.3745 }));
  // a realistic local market: most places sit around 4.2-4.4 (C ~ 4.4)
  const typical = [4.1, 4.2, 4.3, 4.3, 4.4, 4.2, 4.0, 4.5].map((rating, i) => withFoodProfile(R({ id: `N${i}`, name: `Place ${i}`, categories: ["Restaurant"], rating, reviewCount: 200, latitude: 43.30 + i * 0.001 })));
  const scored = scoreCandidates(target, [banger, french, pizza, ...typical], 2000);
  const g = (id: string) => scored.find((x) => x.restaurant.id === id)!;
  console.log(scored.filter((x) => !x.restaurant.id.startsWith("N")).map((x) => `${x.restaurant.name}: rel=${x.relevance.toFixed(0)} threat=${x.threatPotential.toFixed(0)}/${x.threatLevel} bench=${x.benchmarkQuality.toFixed(0)}/${x.benchmarkLevel} adj=${x.reputation.adjustedRating}`).join("\n"));
  ok(g("BANGER").threatLevel === "HIGH", "Banger (247 m, same cuisine) = HIGH threat");
  ok(g("BANGER").benchmarkLevel === "WEAK" && g("BANGER").benchmarkReasons.some((r) => r.code === "fewReviews"), "Banger (12 reviews) = WEAK benchmark, reason fewReviews");
  ok(g("FRENCH").benchmarkLevel === "STRONG", "French Burger (430 reviews, similar concept) = STRONG benchmark");
  ok(g("FRENCH").reputation.adjustedRating > g("BANGER").reputation.adjustedRating, "French Burger more reputable than Banger after smoothing");
  ok(g("PIZZA").relevance < g("FRENCH").relevance && g("PIZZA").threatLevel !== "HIGH", "pizzeria next door is not a direct competitor");
  ok(g("PIZZA").benchmarkLevel === "WEAK", "pizzeria is not a benchmark for a burger place, however well rated");
  ok(g("BANGER").reputation.rawRating === 5.0 && g("BANGER").reputation.reputationConfidence === "LOW", "raw rating kept for display, LOW reputation confidence");

  // ---- unknown price is neutral, never a claim
  const noPrice = scoreCandidates({ ...target, priceKnown: false }, [french], 2000)[0];
  ok(!noPrice.breakdown.priceKnown && noPrice.breakdown.price === 0.5 && !noPrice.threatReasons.some((r) => r.code === "samePrice"), "unknown price -> neutral 0.5, no price reason");

  console.log(fails ? `${fails} FAILED` : "all passed");
  process.exit(fails ? 1 : 0);
})();
