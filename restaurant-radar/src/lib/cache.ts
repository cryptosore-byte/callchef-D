// TTL cache for paid calls (Apify, Jev, website audits). Memory + a persistent JSON file under DATA_DIR,
// so restarts never re-bill. Every lookup is counted for the admin cost panel.
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "fs";
import { join } from "path";
import { DATA_DIR } from "./store";

type Entry = { exp: number; value: unknown; at: number };
const dir = process.env.CACHE_DIR ?? join(DATA_DIR, "cache");
const file = join(dir, "provider-cache.json");
let store: Map<string, Entry> | null = null;

export const cacheStats = { hits: 0, misses: 0 };

function load(): Map<string, Entry> {
  if (store) return store;
  store = new Map();
  try { if (existsSync(file)) for (const [k, v] of Object.entries(JSON.parse(readFileSync(file, "utf8")) as Record<string, Entry>)) store.set(k, v); } catch { /* corrupt cache: start empty */ }
  return store;
}
function persist() {
  try { mkdirSync(dir, { recursive: true }); writeFileSync(file, JSON.stringify(Object.fromEntries(load()))); } catch { /* read-only FS: memory only */ }
}

export function cacheGet<T>(key: string): T | undefined {
  const hit = load().get(key);
  if (!hit || hit.exp < Date.now()) { if (hit) load().delete(key); cacheStats.misses++; return undefined; }
  cacheStats.hits++;
  return hit.value as T;
}
export function cacheSet(key: string, value: unknown, ttlHours: number) {
  load().set(key, { exp: Date.now() + ttlHours * 3600_000, value, at: Date.now() });
  persist();
}
export function cacheClear() { load().clear(); persist(); }

/** Return the cached value or compute, store and return it. */
export async function memo<T>(key: string, ttlHours: number, fn: () => Promise<T>): Promise<T> {
  const hit = cacheGet<T>(key);
  if (hit !== undefined) return hit;
  const v = await fn();
  cacheSet(key, v, ttlHours);
  return v;
}
