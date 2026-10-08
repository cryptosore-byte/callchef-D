import { runRadar } from "../src/lib/pipeline";
(async () => {
  const r = await runRadar({ name: "Maison Brasero", address: "Marseille", radiusM: 1000, demo: true });
  const fp = r.target.foodProfile;
  console.log("target", r.target.name, fp?.primary, fp?.level, fp?.modifiers.map((m) => m.key).join(","), "| adj", r.targetReputation?.adjustedRating);
  console.log("nearby", r.nearby.map((n) => `${n.restaurant.name}:${n.relevance.toFixed(0)}`).join(" | "));
  console.log("competitors", r.competitors.map((c) => `${c.restaurant.name} p=${c.competitorProbability.toFixed(2)} threat=${c.threatLevel} bench=${c.benchmarkLevel} verdict=${r.competitorCards?.[c.restaurant.id]?.verdict}`).join(" | "));
  console.log("roles", JSON.stringify(r.roles));
  console.log("health", r.digital?.overview.map((o) => `${o.key}=${o.score ?? "n/a"}`).join(" "));
  console.log("evidence", r.evidence?.map((e) => `${e.id}:${e.kind}:${e.strength}`).join(" "));
  console.log("discovery", JSON.stringify(r.discovery));
  const d = r.decisions;
  for (const k of ["focus10h", "invest500", "learnFrom", "whatToLearn", "dontTouch", "bestTest"] as const) {
    const x = d[k]; if (!x) { console.log(k, "-"); continue; }
    console.log(k, x.choice, x.tier, "| raw", (x.rawConfidence * 100).toFixed(0), "| evidence", x.supportingEvidenceIds.join(","), "| top3", x.distribution.slice(0, 3).map((y) => `${y.option}:${(y.probability * 100).toFixed(0)}`).join(","));
  }
  console.log("owner", d.owner?.action.choice, "/ not", d.owner?.notDo.choice, "| why", d.owner?.why.join(","));
  console.log("plan", JSON.stringify(r.plan));
  const b = Object.values(r.battles)[0]; console.log("battle", b.competitorName, b.dimensions.map((x) => `${x.key}:${x.you}/${x.them}:${x.verdict}`).join(" "), "|", b.howToWin);
  console.log("warnings", r.warnings);
})();
