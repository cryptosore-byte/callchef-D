// Persistent JSON store (no DB yet). One file per key under DATA_DIR (default ./.data).
// Phase 8 swaps this for Postgres; callers only use get/put.
import { existsSync, mkdirSync, readFileSync, renameSync, writeFileSync } from "fs";
import { createHash } from "crypto";
import { join } from "path";

export const DATA_DIR = process.env.DATA_DIR ?? join(process.cwd(), ".data");
const safe = (k: string) => k.replace(/[^a-zA-Z0-9_.-]+/g, "_").slice(0, 180);

export function storeGet<T>(ns: string, key: string): T | undefined {
  const f = join(DATA_DIR, ns, safe(key) + ".json");
  try { return existsSync(f) ? (JSON.parse(readFileSync(f, "utf8")) as T) : undefined; } catch { return undefined; }
}

export function storePut(ns: string, key: string, value: unknown) {
  const dir = join(DATA_DIR, ns);
  try {
    mkdirSync(dir, { recursive: true });
    const f = join(dir, safe(key) + ".json");
    writeFileSync(f + ".tmp", JSON.stringify(value));
    renameSync(f + ".tmp", f); // atomic replace
  } catch { /* read-only FS: data is simply not persisted */ }
}

export const hash = (v: unknown) => createHash("sha1").update(typeof v === "string" ? v : JSON.stringify(v)).digest("hex").slice(0, 16);
