import { runRadar } from "../src/lib/pipeline";
(async () => {
  const r = await runRadar({ name: "Maison Brasero", address: "Marseille", radiusM: 1000, demo: true });
  console.log("nearby", r.nearby.map((n) => `${n.restaurant.name}:${n.relevance.toFixed(0)}`).join(" | "));
  console.log("competitors", r.competitors.map((c) => `${c.restaurant.name} p=${c.competitorProbability.toFixed(2)} threat=${c.threatScore.toFixed(0)}`).join(" | "));
  console.log("score", r.radarScore.total, r.radarScore.dimensions.map((d) => `${d.key}=${d.score}`).join(" "));
  const d = r.decisions;
  for (const k of ["biggestThreat", "whyTheyWin", "advantage", "weakness", "shouldAct", "nextAction"] as const) {
    const x = d[k]!; console.log(k, x.choice, (x.confidence * 100).toFixed(0) + "%", x.tier, "| raw", (x.rawConfidence * 100).toFixed(0), "| top3", x.distribution.slice(0, 3).map((y) => `${y.option}:${(y.probability * 100).toFixed(0)}`).join(","));
  }
  console.log("priority", d.priority);
  console.log("rootCauses", r.summaries[r.target.id].rootCauses.map((c) => `${c.key}:${c.confidence.toFixed(2)}`));
  console.log("dq", r.dataQuality.level, r.dataQuality.reviewsAnalyzed);
  console.log("plan", JSON.stringify(r.plan, null, 1));
  const b = Object.values(r.battles)[0]; console.log("battle", b.competitorName, b.dimensions.map((x) => `${x.key}:${x.you}/${x.them}:${x.verdict}`).join(" "), "|", b.howToWin);
  console.log("warnings", r.warnings);
})();
