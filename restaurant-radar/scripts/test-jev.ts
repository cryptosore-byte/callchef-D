// Simulated TypeSafe API shaped like https://docs.typesafe.ai/api.md. Validates OUR request/response handling.
// It does NOT validate Jev's actual answers: that needs a real key.
import { runRadar } from "../src/lib/pipeline";
import { TypeSafeDecisionProvider, JevError } from "../src/providers/TypeSafeDecisionProvider";

let reqs: any[] = []; let mode: "ok" | "429once" | "401" | "down" = "ok"; let hits429 = 0;
const realFetch = globalThis.fetch;
globalThis.fetch = (async (url: any, init: any) => {
  const body = JSON.parse(init.body);
  reqs.push({ url: String(url), auth: init.headers.Authorization, body });
  if (mode === "down") throw new TypeError("fetch failed");
  if (mode === "401") return new Response("{}", { status: 401 });
  if (mode === "429once" && hits429++ === 0) return new Response("{}", { status: 429 });
  const answers: any = {};
  for (const [id, q] of Object.entries<any>(body.questions)) {
    if (q.type === "noul") answers[id] = { type: "noul", noul: 0.9 };
    else {
      const opts = Object.keys(q.criteria);
      const probs: any = Object.fromEntries(opts.map((o, i) => [o, i === 0 ? 0.7 : 0.3 / (opts.length - 1)]));
      answers[id] = { type: "choice", choice: opts[0], probabilities: probs, confidence: 0.82 };
    }
  }
  return new Response(JSON.stringify({ model: "jev-1.13.0", answers, usage: { input_tokens: 1, output_tokens: 1 } }), { status: 200 });
}) as any;

const ok = (c: boolean, m: string) => { console.log(c ? "PASS" : "FAIL", m); if (!c) process.exitCode = 1; };
(async () => {
  const jev = new TypeSafeDecisionProvider("test-key");
  const r = await runRadar({ name: "x", address: "y", radiusM: 1000, demo: true }, "en", { decider: jev });
  const calls = reqs.length;
  ok(r.decisions.available && r.decisions.bestTest?.engine === "jev", "decisions come from the real provider (engine = jev)");
  ok(reqs.every((x) => x.url === "https://api.typesafe.ai/v1/systemone" && x.auth === "Bearer test-key"), "endpoint + Bearer auth");
  ok(reqs.every((x) => x.body.model === "jev-latest"), 'model = "jev-latest"');
  const batch = reqs.find((x) => Object.keys(x.body.questions).length > 1);
  ok(!!batch && Object.values<any>(batch.body.questions).every((q) => q.type === "noul" && q.criteria?.true && q.criteria?.false), "competitor yes/no sent as ONE batched request of Noul questions with true/false criteria");
  ok(!!batch && Array.isArray(batch.body.state.candidates) && !!batch.body.state.target?.name, "batch state carries target + candidates as structured JSON");
  const choice = reqs.find((x) => x.body.questions.FOCUS_10H);
  const cq: any = choice?.body.questions.FOCUS_10H;
  ok(cq?.criteria && Object.keys(cq.criteria).length >= 2 && typeof Object.values(cq.criteria)[0] === "string", "choice questions carry per-option criteria");
  ok(choice.body.state.target.themes.length > 0 && choice.body.state.competitors.length > 0, "state includes review themes and competitors (facts, not opinions)");
  ok(["FOCUS_10H", "BEST_TEST", "DONT_TOUCH", "OWNER_DO", "OWNER_NOT"].every((k) => choice.body.questions[k]), "V3 business decisions asked together in ONE request");
  ok(Array.isArray(choice.body.state.facts) && choice.body.state.facts.every((f: any) => /^E\d+$/.test(f.id) && f.fact), "state carries numbered facts (evidence ids)");
  ok(Object.values<any>(choice.body.questions).every((q) => Object.entries<any>(q.criteria).every(([o, c]) => /^NO_/.test(o) || /Supported by facts E\d+/.test(c) || q.criteria[o].includes("in `competitors`"))), "every non-empty option cites the facts that support it");
  ok(!JSON.stringify(reqs).includes("mockScores") && !JSON.stringify(reqs).includes("mockProbability"), "mock-only fields never sent to Jev");
  ok(r.decisions.bestTest?.confidence !== undefined && (r.decisions.bestTest?.distribution.length ?? 0) > 1, "probabilities + confidence parsed");
  ok((r.decisions.bestTest?.supportingEvidenceIds.length ?? 0) > 0 && r.decisions.bestTest!.supportingEvidenceIds.every((id) => r.evidence!.some((e) => e.id === id)), "decision cites existing evidence ids only");
  console.log("  requests for one full radar:", calls);

  // retry on 429
  reqs = []; mode = "429once"; hits429 = 0;
  const res = await jev.binary({ id: "q", question: "?", context: {} });
  ok(res.probability === 0.9 && reqs.length === 2, "429 -> retried with backoff -> success");

  // unauthorized -> decisions unavailable, market data still returned
  mode = "401";
  const r2 = await runRadar({ name: "x", address: "y", radiusM: 1000, demo: true }, "en", { decider: jev });
  ok(!r2.decisions.available && r2.decisions.unavailableReason === "Decision Intelligence temporarily unavailable.", "401 -> 'Decision Intelligence temporarily unavailable.'");
  ok(r2.market.localMarket.restaurantsDetected > 0 && r2.radarScore.total > 0 && r2.competitors.length > 0, "market data + radar score still shown");
  ok(r2.warnings.some((w) => w.includes("not confirmed")), "competitors flagged as unconfirmed");
  ok(!r2.decisions.bestTest && !r2.decisions.owner, "no decision invented");

  // network down
  mode = "down";
  const r3 = await runRadar({ name: "x", address: "y", radiusM: 1000, demo: true }, "fr", { decider: jev });
  ok(!r3.decisions.available && !!r3.decisions.unavailableReason?.includes("indisponible"), "network down -> French unavailable message");
  try { await jev.binary({ id: "q", question: "?", context: {} }); ok(false, "should throw"); } catch (e) { ok(e instanceof JevError && e.code === "network", "network error typed as JevError"); }
  globalThis.fetch = realFetch;
})();
