import { runRadar } from "../src/lib/pipeline";
(async () => {
  const [name, address, radius] = [process.argv[2], process.argv[3], Number(process.argv[4] ?? 1000)];
  const t0 = Date.now();
  try {
    const sec = () => ((Date.now() - t0) / 1000).toFixed(1);
    const r = await runRadar({ name, address, radiusM: radius }, "fr", { onProgress: ({ stage, partial }) => console.log(`ÉTAPE ${stage} à ${sec()}s${stage === "reviews" ? ` (concurrents visibles: ${partial.competitors?.length ?? 0})` : ""}`) });
    console.log(`demo=${r.demo} en ${sec()}s`);
    const t = r.target;
    console.log("CIBLE", t.name, "|", t.address, "|", t.primaryFoodType, t.format, "| note", t.rating, `(${t.reviewCount})`, "| prix", t.priceLevel, "| horaires", JSON.stringify(t.openingHours), "| avis récupérés", t.reviews.length);
    console.log("VOISINS", r.nearby.length, "→", r.nearby.slice(0, 8).map((n) => `${n.restaurant.name}[${n.restaurant.primaryFoodType}] ${Math.round(n.distanceM)}m rel=${n.relevance.toFixed(0)}`).join(" | "));
    console.log("CONCURRENTS", r.competitors.map((c) => `${c.restaurant.name} p=${c.competitorProbability.toFixed(2)} avis=${c.restaurant.reviews.length}`).join(" | "));
    console.log("SCORE", r.radarScore.total, r.radarScore.dimensions.map((d) => `${d.key}=${d.score}`).join(" "), "| qualité", r.dataQuality.level);
    const s = r.summaries[t.id];
    console.log("THÈMES", s.stats.slice(0, 8).map((x) => `${x.theme} ${x.mentions} (+${x.positive}/-${x.negative})`).join(" | "));
    const d = r.decisions;
    if (d.available) for (const k of ["biggestThreat", "whyTheyWin", "advantage", "weakness", "nextAction"] as const) console.log(k, d[k]?.choice, Math.round((d[k]?.confidence ?? 0) * 100) + "%", d[k]?.tier);
    console.log("WARNINGS", r.warnings);
  } catch (e) { console.log("ERREUR", (e as Error).message); }
})();
