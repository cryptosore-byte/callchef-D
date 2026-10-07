// Async scan jobs: progress order, competitors revealed before the end, errors surfaced, no invented data.
import { startJob, getJob } from "../src/lib/jobs";
import { runRadar, ApifyError } from "../src/lib/pipeline";
import { STAGES } from "../src/lib/stages";

let fails = 0;
const ok = (c: boolean, m: string) => { console.log(c ? "PASS" : "FAIL", m); if (!c) fails++; };
const wait = (ms: number) => new Promise((r) => setTimeout(r, ms));
const input = { name: "Maison Brasero", address: "Marseille", radiusM: 1000, demo: true };

(async () => {
  // 1. Real demo pipeline through the job
  const seen: string[] = [];
  let competitorsBeforeDone = false;
  const j = startJob(input, "fr", (i, l, o) => runRadar(i, l, { ...o, onProgress: (p) => { seen.push(p.stage); if (p.stage === "reviews" && p.partial.competitors?.length) competitorsBeforeDone = true; o?.onProgress?.(p); } }));
  ok(j.status === "running", "job starts running and returns at once");
  for (let i = 0; i < 100 && getJob(j.id)?.status === "running"; i++) await wait(50);
  const d = getJob(j.id)!;
  ok(d.status === "done" && !!d.result, "job completes with a result");
  ok(JSON.stringify(seen) === JSON.stringify(STAGES), `stages in order: ${seen.join(">")}`);
  ok(competitorsBeforeDone, "competitors revealed at the reviews stage");
  ok(d.stageIndex === STAGES.length, "progress reaches 100%");
  ok(d.partial.competitors?.every((c) => c.restaurant.reviews.length === 0) ?? false, "partial competitors carry no reviews (light payload)");
  ok(d.result!.competitors.length === (d.partial.competitors?.length ?? -1), "partial competitors = final competitors");

  // 2. Partial is visible while the slow part runs
  const slow = startJob(input, "en", async (i, l, o) => {
    o?.onProgress?.({ stage: "reviews", partial: { demo: true, competitors: [] } });
    await wait(200);
    return runRadar(i, l);
  });
  await wait(50);
  const mid = getJob(slow.id)!;
  ok(mid.status === "running" && mid.stage === "reviews" && Array.isArray(mid.partial.competitors), "partial readable mid-run");

  // 3. Provider error -> job error, nothing invented
  const bad = startJob(input, "fr", async () => { throw new ApifyError("rate_limit"); });
  await wait(20);
  const b = getJob(bad.id)!;
  ok(b.status === "error" && b.error instanceof ApifyError && !b.result, "provider error -> error status, no result");

  ok(getJob("nope") === undefined, "unknown job -> undefined");
  console.log(fails ? `${fails} FAILED` : "all passed");
  process.exit(fails ? 1 : 0);
})();
