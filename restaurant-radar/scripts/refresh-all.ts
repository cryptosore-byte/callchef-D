// Weekly monitoring: refresh every followed restaurant in "auto" mode (CACHE / LIGHT / MONTHLY decided by age).
// Run by cron on the server, e.g. every Monday 06:12:  12 6 * * 1  cd /opt/restaurant-radar && npx tsx scripts/refresh-all.ts
import { readdirSync } from "fs";
import { join } from "path";
import { DATA_DIR } from "../src/lib/store";
import { loadRecord } from "../src/services/continuous/RestaurantStore";
import { runScan } from "../src/lib/orchestrator";

(async () => {
  let ids: string[] = [];
  try { ids = readdirSync(join(DATA_DIR, "restaurants")).filter((f) => f.endsWith(".json")).map((f) => f.replace(/\.json$/, "")); } catch { /* nothing followed yet */ }
  let total = 0;
  for (const id of ids) {
    const rec = loadRecord(id);
    if (!rec || rec.input.demo) continue;
    try {
      const r = await runScan(rec.input, "fr", { mode: "auto" });
      total += r.cost?.estimatedUsd ?? 0;
      console.log(`${rec.name}: ${r.continuous?.mode}, ~$${r.cost?.estimatedUsd}, ${r.continuous?.changes.length ?? 0} change(s)${r.cost?.warnings.length ? ", warnings " + r.cost.warnings.join(",") : ""}`);
    } catch (e) { console.log(`${rec.name}: failed (${(e as Error).message})`); }
  }
  console.log(`done: ${ids.length} restaurant(s), estimated total ~$${total.toFixed(3)}`);
})();
