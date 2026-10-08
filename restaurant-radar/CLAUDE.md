# Restaurant Radar: project context for Claude Code

Public SaaS for restaurant owners. Owner enters name/address/radius -> app finds the restaurant, scans nearby places, picks true competitors, reads reviews, and returns ONE next action for 30 days. Tagline: "Know your market. Know what to do next."

## Principles (non-negotiable)
- Apify = what exists. Code = what the data says. LLM = language understanding only (optional). **Jev (TypeSafe) = decisions.** A generic LLM never makes business decisions.
- Never invent data, reviews or decisions. If a provider fails, show market data and "Decision Intelligence temporarily unavailable".
- Confidence policy: >=80% strong, 60-79% worth testing, <60% "not enough evidence" (never force a recommendation).
- Say "X% of available mentions", never "X% of customers". Always show sample size.
- Radar Score is computed by code only (formulas in `src/config`, shown in UI).
- No Deliveroo/Uber Eats/Instagram scraping code. Their providers (`src/providers/DigitalProviders.ts`) return NOT_CONNECTED until an APPROVED source is configured, its output mapping validated, and the user has approved the cost. NO DATA = NO CLAIM: a missing source gives no score and no sentence.
- Jev only chooses among options backed by numbered evidence (`EvidenceService`); every decision returns `supportingEvidenceIds`. Nothing supported = "no supported action", never a forced answer.
- Owners see "Preuves solides / Signal à confirmer / Données insuffisantes", not raw percentages (raw values only in `?debug=1`).
- API keys server-side only. Never write tokens in files, logs or commits.
- The user is French, wants short answers and wants things BUILT. UI must work in EN and FR.

## Stack and commands
Next.js 14 (app router) + TypeScript + Tailwind. No DB yet.
    npm install && npm run dev                 # http://localhost:3000
    npx tsc --noEmit                           # typecheck
    npx tsx scripts/selftest.ts                # demo pipeline output
    npx tsx scripts/test-apify.ts              # 25 checks, SIMULATED Apify responses
    npx tsx scripts/test-jev.ts                # 20 checks, SIMULATED TypeSafe responses
    npx tsx scripts/test-jobs.ts               # async scan job: stage order, competitors revealed early, errors
    npx tsx scripts/test-v3.ts                 # V3: food type, Bayesian rating, threat vs benchmark, no-data-no-claim, no raw i18n keys
    npx tsx scripts/test-continuous.ts         # deep -> cache -> light (+market changes) -> test -> monthly, costs and incremental reviews
    npx tsx scripts/test-home.ts               # homepage: autocomplete (no paid call), compare matching
    npx tsx scripts/check-keys.ts              # on the server: Apify key valid? credit left? actor reachable? (never prints keys)
    npx tsx scripts/checki18n.ts               # every t("key") exists in en + fr, placeholders match
    npx tsx scripts/live-scan.ts "Name" "City" 2000   # REAL scan (costs money; needs APIFY_API_TOKEN)
Run all checks after any change. Use `CACHE_DIR=/tmp/x` when running test-apify to avoid cache bleed.

## Layout
- `src/lib/pipeline.ts` single entry `runRadar(input, locale, {decider?})`. Demo mode (no keys) uses fictional Marseille data + `MockDecisionProvider` (labelled "jev-demo" in UI).
- `src/providers/`: `ApifyPlacesProvider` (+ `apify/inputs.ts` and `apify/normalize.ts` hold ALL actor-specific shapes; default actor `compass~crawler-google-places`), `TypeSafeDecisionProvider` (real Jev), `DecisionProvider` (interface + mock), `LlmProvider` (noop), `MarketplaceDataProvider` (empty).
- `src/services/` (V3 flow): `FoodTypeDetectionService` (taxonomy + modifiers + confidence + evidence, search queries) -> `CompetitorDetectionService` (relevance V2, threat potential vs benchmark quality, Jev yes/no) + `ReputationService` (Bayesian adjusted rating, m=50, C=local average) -> `CompetitorInsightService` (human cards, roles) -> `ReviewIntelligenceService` (themes, root causes, 90-day vs previous 90-day per 100 reviews) -> `DigitalHealthRunner/Service` (reputation index, visibility, AI discoverability, social) -> `EvidenceService` (numbered evidence, opportunities, discovery insight) -> `BusinessDecisionService` (6 Jev decisions in ONE batched request, speculative fan-out for "what to learn") -> `PlanService` (protect / test / exploit / not a priority). `BattleModeService` = detailed comparison modal. `jevQuestions.ts` = factual state builders. All weights/thresholds in `src/config`.
- `src/i18n/`: `en.ts`, `fr.ts`, `index.ts` (`makeT`), `client.tsx` (provider + switch). Server-written sentences are localized by passing `t` through services; changing language regenerates the result (re-fetch).
- `src/lib/cache.ts`: 24h disk+memory cache for paid Apify calls (temp dir, or `CACHE_DIR`).
- `src/lib/jobs.ts` in-memory scan jobs (TTL 30 min). `runRadar` emits `onProgress` per stage (`src/lib/stages.ts`) with real partial data (target, nearby count, confirmed competitors). Client: `src/lib/scanJob.ts` (start + 1s polling), `ScanProgress` shows competitors first, then the full result.
- UI: `/radar` answers 6 questions (where you stand, who to watch, what customers think, where weak online, what to test, what not to touch) + discovery insight + "if we owned it". `?debug=1` shows the admin/debug panel. Components: `WarRoom` (competitor cards), `DigitalHealth`, `V3.tsx` (decisions, plan, debug), `ShareCard` (3 takeaways + test of the month).
- `src/app/`: `/` landing, `/radar` dashboard, `/report` shareable card, `/api/radar` (sync), `/api/radar/jobs` (POST start) + `/api/radar/jobs/[id]` (GET progress).

## Homepage (360°)
ONE SEARCH. FOUR DIMENSIONS. ONE CLEAR DECISION. `src/app/page.tsx` + `src/components/home/` (PlaceSearch, Pillars + DecisionStatement, Preview + RadarRings).
- Autocomplete: `/api/places/suggest` -> `PlaceSuggestProvider` (Photon/OSM, free; demo = fictional places). 300 ms debounce, 7-day in-memory cache, per-IP cap. NEVER Apify on this page: the paid scan starts only after the owner confirms the restaurant (identity card).
- "Comparer deux restaurants": `RadarInput.compareWith`, matched by name among places already scanned (`matchPlace`, no extra paid call), forced into competitors, battle opens on /radar. Not found = said so (`result.compare` without id), never guessed.
- Website / Instagram are resolved from the Google listing and the site HTML; nothing to fill before the first scan.
- Preview = fictional demo restaurant, labelled DEMONSTRATION DATA; its lines must stay consistent with the demo scan output.
- Copy rules: GEO = readiness, never a claimed AI ranking; followers are not sales; no social score without a connected source.

## Results page (/radar)
Hero (identity + 4 headline numbers + the test) -> sticky chapter nav -> "what changed" (only if any) -> 5 chapters in `src/components/report/Chapters.tsx`: 01 competition (rating dot plot + review volume bars + watch/benchmark cards), 02 reputation (your themes as diverging bars, you vs competitors dumbbell on complaint share, what customers love about them), 03 SEO & AI (two gauges + checks), 04 social (stats or explicit NOT CONNECTED), 05 action plan (the test + why + protect/test/exploit/not a priority). Each chapter opens with ONE sentence computed by code. Everything else under "Suivi, historique et tous les détails". Motion: `report/motion.tsx` (animate on scroll, reduced-motion safe).

## Env vars (see `.env.example`)
APIFY_API_TOKEN (enables live data), SITE_PASSWORD (optional basic auth for self-hosting), APIFY_GOOGLE_MAPS_ACTOR_ID (optional), TYPESAFE_API_KEY (enables real Jev), TYPESAFE_API_URL (optional), MAX_NEARBY_RESTAURANTS / MAX_REVIEWS_TARGET / MAX_REVIEWS_PER_COMPETITOR / MAX_COMPETITORS_ANALYZED / SCAN_CACHE_HOURS, OPTIONAL_LLM_API_KEY, DATABASE_URL.

## TypeSafe / Jev
Use the `typesafe-ai` skill and read live docs before touching the integration: https://docs.typesafe.ai/llms.txt and https://docs.typesafe.ai/api.md (Install: `claude plugin marketplace add typesafe-ai/skills` then `claude plugin install typesafe@typesafe-ai`.) Console: https://console.typesafe.ai/
Rules: atomic questions, structured `state` of facts only, per-option criteria, ask independent questions together, route on confidence. `mockScores` / `mockProbability` exist ONLY for the demo mock and must never be sent to Jev (a test enforces this).

## Status
Done: types, demo mode, full UI (EN/FR), deterministic competitor scoring, review intelligence, radar score, battle mode, 30-day plan, share card (PNG download), data-quality badges, Apify provider (validated ONCE on a real scan: Barlou Burger Marseille, 73 reviews, 3 real competitors, ~77s cold, ~0.2 USD), Jev adapter (validated only against simulated responses).
NOT validated: real Jev answers (no key yet). Mock confidences are overconfident; thresholds must be calibrated on real Jev output.

## Continuous intelligence (cost-first)
- `src/lib/orchestrator.ts` `runScan(input, locale, {mode, area})` is THE entry for the app (API + jobs). Modes: DEEP_SCAN (first time / >90 days / explicit), MONTHLY_REFRESH (>30 days, 50 target reviews), LIGHT_REFRESH (weekly: 20 newest target reviews, competitor counts/hours, one cheap new-places search, reviews only for competitors whose count moved), CACHE (<6 days or owner action: zero provider call). Deep dive (`area`) refreshes ONE area only.
- Persistence: `DATA_DIR` (default ./.data, gitignored): restaurant records (places, reviews by stable hash with their classification, snapshots, timeline, experiments, owner financials) + provider cache. Reviews are classified ONCE.
- `ProviderBudget` estimates each paid call (unit prices in CONFIG.budget, env-overridable: ceilings, not invoices), skips optional calls over the ceiling, reports cache hits / reviews reused / Jev requests. `CachedDecisionProvider`: identical Jev state+questions are never re-sent.
- `src/services/continuous/`: snapshots, MarketChangeService (significance thresholds, max 3), timeline, ExperimentService (one test at a time, auto or owner-measured, conservative verdict, never causal), OpportunitySimulator (owner numbers only, labelled SIMULATION), MenuIntelligence (provider not connected live; demo only), Advantage + ExpectationGap, Scenarios, MonthlyReport, OwnerActions (+ `/api/restaurants/[id]/experiments|financials`).
- Jev V4 (same batch): THIS_WEEK, WATCH, EXPERIMENT_RESULT (only if the rule says the sample is sufficient), SCENARIO:<test>, MENU_ACTION. Jev gets `state.summary` (small normalized numbers) + numbered facts, never raw reviews.
- Owner page: Today (3 facts, 1 insight, 1 test + "why this test") / What changed / Next move / Customers / Main competitors (1 watch + 1 benchmark) / Digital presence (labels). Everything else under "Plus de détails". `?debug=1` shows cost metrics.
- Demo: `src/data/demoHistory.ts` seeds a FICTIONAL history (previous snapshots, a finished and a running test) so the demo shows the loop.

## V3 status
Done (validated on demo + simulated providers only): steps 1-15 of the V3 brief. NOT validated live: food type and threat/benchmark on the real Barlou scan, website audit on real sites, Jev answers to the V3 questions. Uber Eats / Deliveroo / Instagram: abstraction only (NOT_CONNECTED). Local search ranks rely on Apify `rank`/`searchString` fields (unverified on a real run: if absent, the module is skipped). Nearby scan now runs up to 3 profile queries + "restaurant" (was 2 + 1): ~+30% Apify cost per cold scan.

## Known issues / next steps (priority order)
1. Add real `TYPESAFE_API_KEY`, run `live-scan.ts`, inspect each decision's state/answer, tune questions and thresholds. Record cases where Jev disagrees with common sense.
2. Async job + progressive reveal DONE (decisions and battles now run in parallel). NOT measured live: run `live-scan.ts` (prints per-stage times) to confirm competitors appear <60s. Job store is in-memory: fine on `next start`/Docker, NOT on Vercel serverless (needs shared store, Phase 8, + waitUntil).
3. Phase 4: LLM review classification behind `LlmProvider` (structured JSON only, keyword classifier stays as fallback).
4. Phase 8: Postgres/Supabase (restaurants, scans, competitors, reviews, reviewThemes, marketFeatures, decisions, reports), replace file cache, shareable report links, basic analytics.
5. Google often returns no price: `priceLevel` defaults to 2. Track "unknown" instead of defaulting.
6. Self-host on a VPS: `sudo bash deploy/setup-vps.sh` (Node 20 + pm2, keys prompted hidden into .env.local, `SITE_PASSWORD` basic auth via `src/middleware.ts`). Vercel needs a shared job store first. Revoke any token that was ever pasted in chat.
7. Polish: radar sweep animation clipping, mobile check of Battle Mode, a11y pass.
