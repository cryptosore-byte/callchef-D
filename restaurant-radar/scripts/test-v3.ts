// V3 intelligence checks: food type, Bayesian reputation, threat vs benchmark. Fictional fixtures modelled on the Barlou case.
import type { Restaurant } from "../src/types";
import { detectFoodType, withFoodProfile } from "../src/services/FoodTypeDetectionService";
import { adjustedRating } from "../src/services/ReputationService";
import { scoreCandidates } from "../src/services/CompetitorDetectionService";
import { auditHtml, localSearchFrom } from "../src/providers/DigitalProviders";
import { aiSection, reputationSection, socialSection, visibilitySection } from "../src/services/DigitalHealthService";
import { runRadar } from "../src/lib/pipeline";
import { makeT } from "../src/i18n";
import { evidenceText, paramsText } from "../src/lib/evidence";
import { reasonText } from "../src/lib/reasons";

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

  // ---- digital health: NO DATA = NO CLAIM
  const rep = reputationSection(target, 4.45, [{ platform: "GOOGLE", status: "CONNECTED", rating: 4.5, ratingCount: 519 }, { platform: "UBER_EATS", status: "NOT_CONNECTED" }, { platform: "DELIVEROO", status: "NOT_CONNECTED" }]);
  ok(rep.deliveryScore === null && rep.deliveryAverage === null && !["rep.deliveryGap", "rep.deliveryStronger"].includes(rep.insight?.code ?? ""), "delivery not connected -> no delivery score, no delivery claim");
  ok(rep.score !== null, `reputation still scored from Google alone (${rep.score})`);
  const repGap = reputationSection(target, 4.6, [{ platform: "GOOGLE", status: "CONNECTED", rating: 4.7, ratingCount: 519 }, { platform: "UBER_EATS", status: "CONNECTED", rating: 4.0 }, { platform: "DELIVEROO", status: "CONNECTED", rating: 4.0 }]);
  ok(repGap.insight?.code === "rep.deliveryGap", "Google 4.7 vs delivery 4.0 -> delivery gap insight");
  const soc = socialSection({ status: "NOT_CONNECTED" }, []);
  ok(soc.score === null && !soc.insight, "Instagram not connected -> no Social score");
  ok(localSearchFrom({ ...target, searchRanks: undefined }, ["burger"], 15).status === "NOT_CONNECTED", "no rank data -> local search not measured (no fake ranking)");
  const ls = localSearchFrom({ ...target, searchRanks: [{ query: "burger", rank: 3 }] }, ["burger", "burger halal"], 15);
  ok(ls.results[1].rank === null && ls.topN === 15, "absent query reported as 'not in top 15', not as a rank");
  const noSite = aiSection({ ...target, website: undefined }, /burger/i, ["HALAL"], { status: "NOT_FOUND", schemaTypes: [], schemaHours: false, schemaAddress: false, textSample: "", hasMenuText: false }, false);
  ok(noSite.insight?.code === "ai.noSite" && noSite.checks.find((c) => c.key === "ai.schema")?.status === "MISSING", "no website -> stated as missing");
  const unreadable = aiSection({ ...target, website: "https://x.test" }, /burger/i, [], { status: "ERROR", schemaTypes: [], schemaHours: false, schemaAddress: false, textSample: "", hasMenuText: false }, false);
  ok(unreadable.checks.find((c) => c.key === "ai.schema")?.status === "UNKNOWN" && unreadable.insight?.code === "ai.unreadable", "unreadable site -> not measured, not 'missing'");
  const html = `<html><head><title>Barlou</title><meta name="description" content="Burgers halal"><script type="application/ld+json">{"@type":"Restaurant","servesCuisine":"Burgers","telephone":"+33 4 91 00 00 00","openingHours":"Mo-Su 11:00-23:00","address":{"streetAddress":"x"}}</script></head><body>Barlou Burger - Notre carte : Classic 12,50 € - halal</body></html>`;
  const au = auditHtml("https://barlou.test", html);
  ok(au.schemaTypes.includes("Restaurant") && au.schemaHours && au.hasMenuText && au.schemaCuisine === "Burgers", "website audit parses JSON-LD, hours and a text menu");
  const vis = visibilitySection({ ...target, imagesCount: undefined }, true, ls, au);
  ok(vis.checks.find((c) => c.key === "vis.photos")?.status === "UNKNOWN", "unknown photo count is excluded, not scored as zero");

  // ---- every rendered owner-facing sentence is translated (no raw keys), in FR and EN
  for (const loc of ["fr", "en"] as const) {
    const t = makeT(loc);
    const r = await runRadar({ name: "x", address: "y", radiusM: 1000, demo: true }, loc);
    const texts: string[] = [];
    for (const e of r.evidence ?? []) texts.push(evidenceText(t, e));
    for (const c of Object.values(r.competitorCards ?? {})) for (const x of [...c.whyItMatters, ...c.theyDoBetter, ...c.youDoBetter]) texts.push(reasonText(t, x));
    for (const c of Object.values(r.competitorCards ?? {})) texts.push(t("verdict." + c.verdict, c.verdictParams), t("repnote." + c.reputationNote));
    for (const d of Object.values(r.decisions)) if (d && typeof d === "object" && "distribution" in d) for (const o of (d as any).distribution) if (!r.competitors.some((c) => c.restaurant.name === o.option)) texts.push(t("dopt." + o.option));
    if (r.discovery) texts.push(t(r.discovery.code, paramsText(t, r.discovery.params)));
    for (const s of [r.digital!.reputation, r.digital!.visibility, r.digital!.ai, r.digital!.social]) { for (const c of s.checks) texts.push(t(c.key, c.params)); if (s.insight) texts.push(t(s.insight.code, s.insight.params)); }
    for (const c of [...r.competitors.map((x) => x.restaurant), r.target]) if (c.foodProfile) texts.push(t("cuisine." + c.foodProfile.primary), ...c.foodProfile.modifiers.map((m) => t("mod." + m.key)));
    const raw = texts.filter((x) => /\b(grp|dopt|evi|reason|cuisine|mod|verdict|repnote|measure|disc|planv3|rep|vis|ai|social|aishort|grpPraise)\.[A-Za-z_]/.test(x));
    ok(raw.length === 0, `${loc}: ${texts.length} rendered sentences, no raw i18n key${raw.length ? " -> " + raw.slice(0, 3).join(" | ") : ""}`);
  }

  console.log(fails ? `${fails} FAILED` : "all passed");
  process.exit(fails ? 1 : 0);
})();
