// TTL cache for paid Apify calls. Memory + a JSON file so restarts don't re-bill.
// Phase 8 replaces this with the database-backed scan cache.
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "fs";
import { tmpdir } from "os";
import { join } from "path";

type Entry = { exp: number; value: unknown };
const dir = process.env.CACHE_DIR ?? join(tmpdir(), "restaurant-radar");
const file = join(dir, "apify-cache.json");
let store: Map<string, Entry> | null = null;

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
  if (!hit) return undefined;
  if (hit.exp < Date.now()) { load().delete(key); return undefined; }
  return hit.value as T;
}
export function cacheSet(key: string, value: unknown, ttlHours: number) {
  load().set(key, { exp: Date.now() + ttlHours * 3600_000, value });
  persist();
}
export function cacheClear() { load().clear(); persist(); }
