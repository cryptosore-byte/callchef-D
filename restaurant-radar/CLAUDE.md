# Restaurant Radar: project context for Claude Code

Public SaaS for restaurant owners. Owner enters name/address/radius -> app finds the restaurant, scans nearby places, picks true competitors, reads reviews, and returns ONE next action for 30 days. Tagline: "Know your market. Know what to do next."

## Principles (non-negotiable)
- Apify = what exists. Code = what the data says. LLM = language understanding only (optional). **Jev (TypeSafe) = decisions.** A generic LLM never makes business decisions.
- Never invent data, reviews or decisions. If a provider fails, show market data and "Decision Intelligence temporarily unavailable".
- Confidence policy: >=80% strong, 60-79% worth testing, <60% "not enough evidence" (never force a recommendation).
- Say "X% of available mentions", never "X% of customers". Always show sample size.
- Radar Score is computed by code only (formulas in `src/config`, shown in UI).
- No Deliveroo/Uber Eats scraping. `MarketplaceDataProvider` stays an empty interface.
- API keys server-side only. Never write tokens in files, logs or commits.
- The user is French, wants short answers and wants things BUILT. UI must work in EN and FR.

## Stack and commands
Next.js 14 (app router) + TypeScript + Tailwind. No DB yet.
    npm install && npm run dev                 # http://localhost:3000
    npx tsc --noEmit                           # typecheck
    npx tsx scripts/selftest.ts                # demo pipeline output
    npx tsx scripts/test-apify.ts              # 25 checks, SIMULATED Apify responses
    npx tsx scripts/test-jev.ts                # 16 checks, SIMULATED TypeSafe responses
    npx tsx scripts/test-jobs.ts               # async scan job: stage order, competitors revealed early, errors
    npx tsx scripts/checki18n.ts               # every t("key") exists in en + fr, placeholders match
    npx tsx scripts/live-scan.ts "Name" "City" 2000   # REAL scan (costs money; needs APIFY_API_TOKEN)
Run all checks after any change. Use `CACHE_DIR=/tmp/x` when running test-apify to avoid cache bleed.

## Layout
- `src/lib/pipeline.ts` single entry `runRadar(input, locale, {decider?})`. Demo mode (no keys) uses fictional Marseille data + `MockDecisionProvider` (labelled "jev-demo" in UI).
- `src/providers/`: `ApifyPlacesProvider` (+ `apify/inputs.ts` and `apify/normalize.ts` hold ALL actor-specific shapes; default actor `compass~crawler-google-places`), `TypeSafeDecisionProvider` (real Jev), `DecisionProvider` (interface + mock), `LlmProvider` (noop), `MarketplaceDataProvider` (empty).
- `src/services/`: competitor prefilter + Jev yes/no, review intelligence (keyword FR/EN classifier + aggregation + root causes), market features, radar score, `JevDecisionService` (decisions A-G), `BattleModeService` (duel + 30-day plan), `jevQuestions.ts` (rubrics + factual state builders).
- `src/i18n/`: `en.ts`, `fr.ts`, `index.ts` (`makeT`), `client.tsx` (provider + switch). Server-written sentences are localized by passing `t` through services; changing language regenerates the result (re-fetch).
- `src/lib/cache.ts`: 24h disk+memory cache for paid Apify calls (temp dir, or `CACHE_DIR`).
- `src/lib/jobs.ts` in-memory scan jobs (TTL 30 min). `runRadar` emits `onProgress` per stage (`src/lib/stages.ts`) with real partial data (target, nearby count, confirmed competitors). Client: `src/lib/scanJob.ts` (start + 1s polling), `ScanProgress` shows competitors first, then the full result.
- `src/app/`: `/` landing, `/radar` dashboard, `/report` shareable card, `/api/radar` (sync), `/api/radar/jobs` (POST start) + `/api/radar/jobs/[id]` (GET progress).

## Env vars (see `.env.example`)
APIFY_API_TOKEN (enables live data), SITE_PASSWORD (optional basic auth for self-hosting), APIFY_GOOGLE_MAPS_ACTOR_ID (optional), TYPESAFE_API_KEY (enables real Jev), TYPESAFE_API_URL (optional), MAX_NEARBY_RESTAURANTS / MAX_REVIEWS_TARGET / MAX_REVIEWS_PER_COMPETITOR / MAX_COMPETITORS_ANALYZED / SCAN_CACHE_HOURS, OPTIONAL_LLM_API_KEY, DATABASE_URL.

## TypeSafe / Jev
Use the `typesafe-ai` skill and read live docs before touching the integration: https://docs.typesafe.ai/llms.txt and https://docs.typesafe.ai/api.md (Install: `claude plugin marketplace add typesafe-ai/skills` then `claude plugin install typesafe@typesafe-ai`.) Console: https://console.typesafe.ai/
Rules: atomic questions, structured `state` of facts only, per-option criteria, ask independent questions together, route on confidence. `mockScores` / `mockProbability` exist ONLY for the demo mock and must never be sent to Jev (a test enforces this).

## Status
Done: types, demo mode, full UI (EN/FR), deterministic competitor scoring, review intelligence, radar score, battle mode, 30-day plan, share card (PNG download), data-quality badges, Apify provider (validated ONCE on a real scan: Barlou Burger Marseille, 73 reviews, 3 real competitors, ~77s cold, ~0.2 USD), Jev adapter (validated only against simulated responses).
NOT validated: real Jev answers (no key yet). Mock confidences are overconfident; thresholds must be calibrated on real Jev output.

## Known issues / next steps (priority order)
1. Add real `TYPESAFE_API_KEY`, run `live-scan.ts`, inspect each decision's state/answer, tune questions and thresholds. Record cases where Jev disagrees with common sense.
2. Async job + progressive reveal DONE (decisions and battles now run in parallel). NOT measured live: run `live-scan.ts` (prints per-stage times) to confirm competitors appear <60s. Job store is in-memory: fine on `next start`/Docker, NOT on Vercel serverless (needs shared store, Phase 8, + waitUntil).
3. Phase 4: LLM review classification behind `LlmProvider` (structured JSON only, keyword classifier stays as fallback).
4. Phase 8: Postgres/Supabase (restaurants, scans, competitors, reviews, reviewThemes, marketFeatures, decisions, reports), replace file cache, shareable report links, basic analytics.
5. Google often returns no price: `priceLevel` defaults to 2. Track "unknown" instead of defaulting.
6. Self-host on a VPS: `sudo bash deploy/setup-vps.sh` (Node 20 + pm2, keys prompted hidden into .env.local, `SITE_PASSWORD` basic auth via `src/middleware.ts`). Vercel needs a shared job store first. Revoke any token that was ever pasted in chat.
7. Polish: radar sweep animation clipping, mobile check of Battle Mode, a11y pass.
