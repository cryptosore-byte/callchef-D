"use client";
import { useEffect, useState } from "react";
import type { RadarInput, RadarResult } from "@/types";
import type { JobView } from "@/lib/jobs";
import { useLocale } from "@/i18n/client";
import { pendingJob, pollScan, startScan, type PendingJob } from "@/lib/scanJob";

export const STORAGE_KEY = "rr:result";
const DEFAULT_INPUT: RadarInput = { name: "Maison Brasero", address: "Marseille", radiusM: 1000, demo: true };

/**
 * Loads the last radar result, or follows the running scan job (progress + partial data).
 * If the UI language changed since it was generated, the result is regenerated in the new
 * language (server-written sentences are localized). Live mode reuses the 24h Apify cache.
 */
export function useRadarResult() {
  const { locale } = useLocale();
  const [result, setResult] = useState<RadarResult | null>(null);
  const [job, setJob] = useState<JobView | null>(null);
  const [startedAt, setStartedAt] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);
  useEffect(() => {
    let cancelled = false;
    const follow = (p: PendingJob) => {
      setStartedAt(p.startedAt);
      pollScan(p, (v) => setJob(v), () => cancelled)
        .then((d) => {
          sessionStorage.setItem(STORAGE_KEY, JSON.stringify(d));
          setResult(d); setJob(null);
        })
        .catch((e: Error) => !cancelled && setError(e.message));
    };
    const running = pendingJob();
    if (running && running.locale === locale) { follow(running); return () => { cancelled = true; }; }

    let base: RadarResult | null = null;
    try { base = JSON.parse(sessionStorage.getItem(STORAGE_KEY) ?? "null"); } catch { base = null; }
    if (base && base.locale === locale) { setResult(base); return; }
    if (base) setResult(base); // keep showing the previous language while we regenerate
    startScan({ ...(running?.input ?? base?.input ?? DEFAULT_INPUT), locale })
      .then((p) => !cancelled && follow(p))
      .catch(() => !cancelled && setError("network"));
    return () => { cancelled = true; };
  }, [locale]);
  return { result, job, startedAt, error };
}
