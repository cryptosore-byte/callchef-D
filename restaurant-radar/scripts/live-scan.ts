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
    const fp = t.foodProfile;
    console.log("TYPE", fp?.primary, fp?.level, fp?.confidence, "| modificateurs", fp?.modifiers.map((m) => m.key).join(","), "| preuves", fp?.evidence.map((e) => `${e.source}:${e.text}`).join(" ; "));
    for (const c of r.competitors) console.log("  ", c.restaurant.name, `${c.restaurant.rating}★/${c.restaurant.reviewCount}`, "ajustée", c.reputation.adjustedRating, "menace", c.threatLevel, Math.round(c.threatPotential), "référence", c.benchmarkLevel, Math.round(c.benchmarkQuality), "|", r.competitorCards?.[c.restaurant.id]?.verdict);
    console.log("SANTÉ", r.digital?.overview.map((o) => `${o.key}=${o.score ?? "n/a"}`).join(" "), "| recherches", JSON.stringify(r.digital?.visibility.search.results));
    console.log("PREUVES"); for (const e of r.evidence ?? []) console.log("  ", e.id, e.strength, e.fact);
    console.log("DÉCOUVERTE", JSON.stringify(r.discovery));
    const d = r.decisions;
    if (d.available) for (const k of ["focus10h", "invest500", "learnFrom", "whatToLearn", "dontTouch", "bestTest"] as const) {
      const x = d[k]; if (!x) { console.log(k, "non posé (preuves insuffisantes)"); continue; }
      console.log(k, x.choice, x.tier, "brut", Math.round(x.rawConfidence * 100) + "%", "| preuves", x.supportingEvidenceIds.join(","), "| top3", x.distribution.slice(0, 3).map((y) => `${y.option}:${Math.round(y.probability * 100)}`).join(","), "|", x.engine);
    }
    if (d.owner) console.log("SI NOUS GÉRIONS", d.owner.action.choice, "/ PAS", d.owner.notDo.choice, "| pourquoi", d.owner.why.join(","));
    console.log("WARNINGS", r.warnings);
  } catch (e) { console.log("ERREUR", (e as Error).message); }
})();
