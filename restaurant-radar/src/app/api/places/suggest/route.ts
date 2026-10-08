import { NextResponse } from "next/server";
import { isLive } from "@/lib/pipeline";
import { DemoSuggestProvider, PhotonSuggestProvider, type PlaceSuggestion } from "@/providers/PlaceSuggestProvider";

export const runtime = "nodejs";

// Cheap by design: free geocoder, 7-day in-memory cache per query (kept out of the paid-provider disk cache),
// client debounce, and a per-IP cap for fair use.
const TTL_MS = 7 * 86_400_000, MAX_ENTRIES = 2000;
const cache = new Map<string, { at: number; v: PlaceSuggestion[] }>();
async function cached(key: string, fn: () => Promise<PlaceSuggestion[]>) {
  const c = cache.get(key);
  if (c && Date.now() - c.at < TTL_MS) return c.v;
  const v = await fn();
  if (cache.size >= MAX_ENTRIES) cache.delete(cache.keys().next().value!);
  cache.set(key, { at: Date.now(), v });
  return v;
}
const WINDOW_MS = 60_000, MAX_PER_WINDOW = 40;
const hits = new Map<string, { n: number; at: number }>();
function limited(ip: string) {
  const now = Date.now(), h = hits.get(ip);
  if (!h || now - h.at > WINDOW_MS) { hits.set(ip, { n: 1, at: now }); return false; }
  return ++h.n > MAX_PER_WINDOW;
}

export async function GET(req: Request) {
  const u = new URL(req.url);
  const q = (u.searchParams.get("q") ?? "").trim().replace(/\s+/g, " ").slice(0, 80);
  const lang = u.searchParams.get("lang") === "fr" ? "fr" : "en";
  const scope = u.searchParams.get("scope") === "compare" ? "compare" : "target";
  const demo = u.searchParams.get("demo") === "1" || !isLive();
  if (q.length < 2) return NextResponse.json({ suggestions: [], demo });
  if (demo) return NextResponse.json({ suggestions: await new DemoSuggestProvider().suggest(q, lang, scope), demo });
  if (limited(req.headers.get("x-forwarded-for")?.split(",")[0].trim() || "local")) return NextResponse.json({ suggestions: [], demo, limited: true }, { status: 429 });
  try {
    const suggestions = await cached(`${lang}:${q.toLowerCase()}`, () => new PhotonSuggestProvider().suggest(q, lang));
    return NextResponse.json({ suggestions, demo });
  } catch {
    // Autocomplete is a convenience: the owner can still type the name and city and launch the scan.
    return NextResponse.json({ suggestions: [], demo, unavailable: true });
  }
}
