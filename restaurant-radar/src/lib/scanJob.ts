"use client";
import type { RadarInput, RadarResult } from "@/types";
import type { JobView } from "@/lib/jobs";

export const JOB_KEY = "rr:job";
const POLL_MS = 1000;
const MAX_NET_ERRORS = 5;

export interface PendingJob { id: string; input: RadarInput; locale: string; startedAt: number; }

// One in-flight start per request body: React StrictMode runs effects twice and a scan costs money.
const inflight = new Map<string, Promise<PendingJob>>();

export function startScan(body: RadarInput & { locale: string }): Promise<PendingJob> {
  const key = JSON.stringify(body);
  let p = inflight.get(key);
  if (!p) {
    p = create(body).finally(() => setTimeout(() => inflight.delete(key), 5000));
    inflight.set(key, p);
  }
  return p;
}

async function create(body: RadarInput & { locale: string }): Promise<PendingJob> {
  const res = await fetch("/api/radar/jobs", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
  const d = await res.json();
  if (!res.ok || !d.id) throw new Error(d.error || "start");
  const { locale, ...input } = body;
  const job: PendingJob = { id: d.id, input, locale, startedAt: Date.now() };
  sessionStorage.setItem(JOB_KEY, JSON.stringify(job));
  return job;
}

export function pendingJob(): PendingJob | null {
  try { return JSON.parse(sessionStorage.getItem(JOB_KEY) ?? "null"); } catch { return null; }
}

/** Polls until the job ends. Resolves with the result, rejects with a localized server message (or "network"). */
export function pollScan(job: PendingJob, onUpdate: (v: JobView) => void, isCancelled: () => boolean): Promise<RadarResult> {
  return new Promise((resolve, reject) => {
    let netErrors = 0;
    const tick = async () => {
      if (isCancelled()) return;
      try {
        const res = await fetch(`/api/radar/jobs/${job.id}?locale=${job.locale}`, { cache: "no-store" });
        const v = (await res.json()) as JobView;
        netErrors = 0;
        if (isCancelled()) return;
        if (!res.ok || v.status === "error") { sessionStorage.removeItem(JOB_KEY); reject(new Error(v.error || "network")); return; }
        onUpdate(v);
        if (v.status === "done" && v.result) { sessionStorage.removeItem(JOB_KEY); resolve(v.result); return; }
      } catch {
        if (++netErrors >= MAX_NET_ERRORS) { reject(new Error("network")); return; }
      }
      setTimeout(tick, POLL_MS);
    };
    tick();
  });
}
