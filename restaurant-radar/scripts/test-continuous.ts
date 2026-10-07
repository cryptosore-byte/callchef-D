// Continuous intelligence, end to end on SIMULATED Apify responses (fictional places):
// deep scan -> same-day cache -> weekly LIGHT_REFRESH with market changes -> experiment -> monthly refresh.
import { mkdtempSync } from "fs";
import { tmpdir } from "os";
import { join } from "path";
process.env.DATA_DIR = mkdtempSync(join(tmpdir(), "rr-data-"));
process.env.CACHE_DIR = mkdtempSync(join(tmpdir(), "rr-cache-"));
process.env.APIFY_API_TOKEN = "test-token";
delete process.env.TYPESAFE_API_KEY;

/* eslint-disable @typescript-eslint/no-explicit-any */
const DAY = 86_400_000;
const T0 = Date.UTC(2026, 9, 7, 12);
let now = T0;
const realNow = Date.now;
Date.now = () => now;

const hours = (h: string) => ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday", "Sunday"].map((day) => ({ day, hours: h }));
const P = (id: string, title: string, lat: number, cats: string[], score: number, n: number, h: string) => ({
  placeId: id, title, address: `${title}, Marseille`, location: { lat, lng: 5.3745 }, categories: cats, categoryName: cats[0], totalScore: score, reviewsCount: n,
  price: "€10–20", url: `https://maps.test/place/${id}`, openingHours: hours(h),
});
const world: Record<string, any> = {
  T1: P("T1", "Burger Bastide", 43.2951, ["Burger restaurant"], 4.4, 540, "11:30 AM to 10 PM"),
  C1: P("C1", "Smash Quartier", 43.2958, ["Burger restaurant"], 4.5, 1100, "11:30 AM to 2 AM"),
  C2: P("C2", "Le Comptoir Burger", 43.2940, ["Burger restaurant"], 4.2, 480, "12 to 11 PM"),
  C3: P("C3", "Poulet Roi", 43.2985, ["Fried chicken takeaway"], 4.0, 700, "11 AM to 1 AM"),
  N1: P("N1", "Pizzeria Luna", 43.2932, ["Pizza restaurant"], 4.3, 900, "12 PM to 11:30 PM"),
};
const TEXTS = ["Burger top mais frites froides", "Service aimable, portions généreuses", "Super burger", "Emballage pas terrible", "Délicieux, personnel sympa", "Attente très longue, déçu"];
let reviewSeq = 0;
const reviewsFor = (id: string, n: number, newestDay = now) => Array.from({ length: n }, (_, i) => ({ reviewId: `${id}-r${reviewSeq++}`, text: TEXTS[i % TEXTS.length], stars: 4, publishedAtDate: new Date(newestDay - i * 2 * DAY).toISOString() }));
// Reviews are stable per place: the same ids come back unless new ones were "written".
const pool: Record<string, any[]> = {};
const reviewsOf = (id: string, n: number) => { pool[id] ??= reviewsFor(id, 200, T0); return pool[id].slice(0, n); };

const calls: any[] = [];
globalThis.fetch = (async (_u: any, init: any) => {
  const body = JSON.parse(init.body); calls.push(body);
  const json = (x: any) => new Response(JSON.stringify(x), { status: 200 });
  if (body.startUrls) {
    return json(body.startUrls.map((s: any) => { const id = s.url.split("/").pop(); return { ...world[id], reviews: reviewsOf(id, body.maxReviews) }; }).filter((x: any) => x.placeId));
  }
  if (body.customGeolocation) return json(Object.values(world).map((p: any, i: number) => ({ ...p, searchString: body.searchStringsArray[0], rank: i + 1 })));
  return json([{ ...world.T1, reviews: reviewsOf("T1", body.maxReviews) }]);
}) as any;

let fails = 0;
const ok = (c: boolean, m: string) => { console.log(c ? "PASS" : "FAIL", m); if (!c) fails++; };
const input = { name: "Burger Bastide", address: "Marseille", radiusM: 1000 };

(async () => {
  const { runScan } = await import("../src/lib/orchestrator");
  const { loadRecord } = await import("../src/services/continuous/RestaurantStore");
  const { startExperiment } = await import("../src/services/continuous/ExperimentService");
  const { saveRecord } = await import("../src/services/continuous/RestaurantStore");

  // ---- Day 0: DEEP_SCAN
  const r0 = await runScan(input, "fr");
  const deepCalls = calls.length;
  ok(r0.continuous?.mode === "DEEP_SCAN" && r0.continuous.isFirstScan, `day 0: DEEP_SCAN (${deepCalls} provider calls, ~$${r0.cost?.estimatedUsd})`);
  ok(calls.some((c) => c.searchStringsArray?.[0]?.includes("Burger Bastide") && c.maxReviews === 200), "deep scan reads 200 target reviews");
  ok(r0.continuous!.changes.length === 0, "first scan: no 'what changed' yet");
  const rec0 = loadRecord(r0.continuous!.restaurantId)!;
  ok(Object.keys(rec0.reviews.T1 ?? {}).length === 200 && rec0.snapshots.length === 1, "record stored: 200 reviews, 1 snapshot");

  // ---- Same day, page reload: CACHE, zero provider call
  calls.length = 0;
  const r1 = await runScan(input, "en");
  ok(r1.continuous?.mode === "CACHE" && calls.length === 0, `same day / language change: served from store, ${calls.length} provider calls`);
  ok(r1.cost!.reviewsNew === 0 && r1.cost!.reviewsReused === 0, "no review re-analysed on a cache view");

  // ---- Day 7: the market moves
  now = T0 + 7 * DAY;
  world.C1 = { ...world.C1, reviewsCount: 1140, totalScore: 4.6 };                      // +40 reviews
  world.T1 = { ...world.T1, reviewsCount: 548 };                                          // +8 reviews
  pool.T1 = [...reviewsFor("T1", 8, now).map((r) => ({ ...r, text: "Attente très longue, lent" })), ...pool.T1];
  pool.C1 = [...reviewsFor("C1", 10, now), ...(pool.C1 ?? reviewsFor("C1", 200, T0))];
  world.N9 = P("N9", "Burger Nouveau", 43.2962, ["Burger restaurant"], 4.8, 25, "12 PM to 1 AM");
  calls.length = 0;
  const r7 = await runScan(input, "fr");
  const c = r7.continuous!;
  ok(c.mode === "LIGHT_REFRESH", `day 7: LIGHT_REFRESH (${calls.length} provider calls, ~$${r7.cost?.estimatedUsd})`);
  ok(!calls.some((x) => x.maxReviews === 200 || x.maxReviews === 50), "light refresh never re-downloads deep review sets");
  ok(calls.some((x) => x.startUrls?.length === 1 && x.maxReviews === 20), "target: only the 20 newest reviews");
  ok(calls.some((x) => x.startUrls && x.maxReviews === 0), "competitors: ratings / counts / hours only");
  ok(calls.filter((x) => x.customGeolocation).every((x) => x.searchStringsArray.length === 1 && x.maxReviews === 0), "new places: one cheap search, no reviews");
  ok(calls.some((x) => x.startUrls?.some((s: any) => s.url.endsWith("/C1")) && x.maxReviews === 10) && !calls.some((x) => x.startUrls?.some((s: any) => s.url.endsWith("/C2")) && x.maxReviews > 0), "only the competitor whose review count moved gets new reviews");
  ok(r7.cost!.estimatedUsd <= r7.cost!.ceilingUsd && r7.cost!.estimatedUsd < r0.cost!.estimatedUsd / 3, `light refresh cost ~$${r7.cost!.estimatedUsd} vs deep ~$${r0.cost!.estimatedUsd}`);
  ok(r7.cost!.reviewsReused > 0 && r7.cost!.reviewsNew > 0 && r7.cost!.reviewsNew <= 20, `incremental reviews: ${r7.cost!.reviewsNew} new, ${r7.cost!.reviewsReused} reused (never re-classified)`);
  const types = c.changes.map((x) => x.type);
  ok(types.includes("COMPETITOR_REVIEW_GROWTH"), `what changed: ${types.join(", ")}`);
  ok(c.changes.length <= 3, "max 3 changes shown");
  ok(!c.changes.some((x) => x.type === "TARGET_REVIEW_GROWTH" && Number(x.params.n) < 5), "insignificant changes filtered");
  ok(!!r7.decisions.thisWeek && !!r7.decisions.watch, `V4 decisions: this week = ${r7.decisions.thisWeek?.choice}, watch = ${r7.decisions.watch?.choice}`);

  // ---- Owner starts the recommended packaging test; day 35: MONTHLY_REFRESH measures it
  const rec7 = loadRecord(c.restaurantId)!;
  const target = { ...rec7.places[rec7.targetId], reviews: Object.values(rec7.reviews[rec7.targetId]) };
  startExperiment(rec7, "RUN_REVIEW_GENERATION_TEST", target, now);
  saveRecord(rec7);
  calls.length = 0;
  const rT = await runScan(input, "fr", { mode: "cache" });
  ok(calls.length === 0 && rT.decisions.thisWeek?.choice === "CONTINUE_EXPERIMENT", `test running: this week = ${rT.decisions.thisWeek?.choice} (one test at a time), 0 provider calls`);
  now = T0 + 35 * DAY;
  world.T1 = { ...world.T1, reviewsCount: 600 };
  calls.length = 0;
  const r35 = await runScan(input, "fr");
  ok(r35.continuous?.mode === "MONTHLY_REFRESH", `day 35: MONTHLY_REFRESH (target reviews ${calls.find((x) => x.searchStringsArray?.[0]?.includes("Burger Bastide"))?.maxReviews})`);
  const fin = r35.continuous?.finished;
  ok(!!fin && ["COMPLETED", "INCONCLUSIVE"].includes(fin.status) && !!fin.result, `experiment measured: ${fin?.result?.before.value} -> ${fin?.result?.after.value} ${fin?.result?.after.unit} = ${fin?.result?.label}`);
  ok(r35.continuous!.timeline.some((e) => e.kind === "EXPERIMENT_COMPLETED"), "timeline records the result");
  ok(!!r35.continuous!.monthly, "monthly report available after a month of snapshots");

  // ---- Deep dive on ONE area: only that area is fetched
  calls.length = 0;
  const dd = await runScan(input, "fr", { area: "reviews" });
  ok(calls.length > 0 && !calls.some((x) => x.customGeolocation) && calls.some((x) => x.maxReviews === 200), `deep dive "reviews": ${calls.length} calls, target reviews only + benchmarks, no market rescan (~$${dd.cost?.estimatedUsd})`);
  calls.length = 0;
  await runScan(input, "fr", { area: "instagram" });
  ok(calls.length === 0, "deep dive on a non-connected source: no provider call");

  Date.now = realNow;
  console.log(fails ? `${fails} FAILED` : "all passed");
  process.exit(fails ? 1 : 0);
})();
