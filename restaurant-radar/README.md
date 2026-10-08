# Restaurant Radar

Know your market. Know what to do next.

## Run it (demo mode, no keys)

    npm install
    npm run dev        # http://localhost:3000
    npm run selftest   # prints the full pipeline output in the terminal
    npx tsx scripts/test-apify.ts   # 24 checks of the live path against SIMULATED Apify responses
    npx tsx scripts/test-jev.ts     # 16 checks of the Jev adapter against SIMULATED TypeSafe responses
    npx tsx scripts/checki18n.ts    # every EN/FR key exists

Click "See the demo" or run any search: without keys the app uses fictional Marseille data, clearly labeled DEMO DATA.

## Architecture

    Apify / public data -> normalization -> review intelligence -> Jev decision engine -> optional LLM -> UI

- `src/providers`  : swappable adapters (Apify places, reviews, decision, LLM, future marketplace).
- `src/services`   : deterministic logic (competitor scoring, review aggregation, market features, radar score) and the Jev decision layer.
- `src/config`     : every weight, threshold and limit.
- `src/lib/pipeline.ts` : the single entry point `runRadar()`.
- Decisions go through `DecisionProvider`. Demo mode uses `MockDecisionProvider` (labeled "demo engine standing in for Jev" in the UI). `TypeSafeDecisionProvider` is a stub until Phase 5 so no endpoint is invented.

## Environment variables (copy .env.example to .env.local)

| Variable | Needed from | Where to get it |
|---|---|---|
| APIFY_API_TOKEN | Phase 2 | console.apify.com > Settings > Integrations. Setting it switches the app from demo to live data |
| APIFY_GOOGLE_MAPS_ACTOR_ID | Phase 2 (optional) | Defaults to `compass~crawler-google-places` |
| TYPESAFE_API_KEY | Phase 5 | console.typesafe.ai (Jev is in early access). Setting it switches live decisions from the demo engine to Jev. Endpoint `https://api.typesafe.ai/v1/systemone`, model `jev-latest` (override URL with `TYPESAFE_API_URL`) |
| OPTIONAL_LLM_API_KEY | Phase 4 (optional) | Your LLM provider |
| DATABASE_URL | Phase 8 | Supabase or any PostgreSQL |
| MAX_NEARBY_RESTAURANTS, MAX_REVIEWS_TARGET, MAX_REVIEWS_PER_COMPETITOR, MAX_COMPETITORS_ANALYZED, SCAN_CACHE_HOURS | optional | cost limits (defaults 30 / 200 / 50 / 5 / 24) |

## Status

- Phase 1 (types, demo mode, full clickable UI): done.
- Phases 3-4 logic (competitor scoring, review aggregation, root causes, radar score, battle mode, plan): implemented and running on demo data.
- Phase 2 (Apify): implemented (target search, nearby search, reviews for confirmed competitors only, in-memory 24h cache, typed errors). Tested against simulated responses only: run once with a real token and compare against the actor's Input/Output tabs. Actor-specific shapes live in `src/providers/apify/inputs.ts` and `normalize.ts` only.
- Reviews in live mode are classified by a rough French/English keyword classifier until Phase 4 adds the LLM.
- Phase 5 (Jev): adapter implemented from the live API docs (batched Noul for competitors, Choice with per-option criteria, structured fact state, retry on 429/529, graceful fallback). Tested against simulated responses only: needs a real key to validate actual answers and to calibrate thresholds.
- Phase 8 (database, persistent cache, analytics): not yet connected.
