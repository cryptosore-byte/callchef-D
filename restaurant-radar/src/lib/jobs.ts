// In-memory scan jobs: POST starts a scan and returns at once, the client polls progress.
// Works on a long-running Node server (next start, Docker). Serverless hosts need a shared
// store (Phase 8 DB) because each poll may hit another instance.
import { randomUUID } from "crypto";
import type { RadarInput, RadarResult } from "@/types";
import type { Locale } from "@/i18n";
import { runRadar, type RadarPartial } from "@/lib/pipeline";
import { STAGES, type Stage } from "@/lib/stages";

export interface Job {
  id: string;
  status: "running" | "done" | "error";
  stage: Stage;
  stageIndex: number;
  stageCount: number;
  partial: RadarPartial;
  result?: RadarResult;
  error?: unknown;
  startedAt: number;
  updatedAt: number;
}
/** What the client sees: errors are mapped to a localized message by the route. */
export type JobView = Omit<Job, "error"> & { error?: string; code?: string };

const TTL_MS = 30 * 60_000;
const MAX_JOBS = 200;
const g = globalThis as unknown as { __rrJobs?: Map<string, Job> };
const jobs = (g.__rrJobs ??= new Map());

function sweep() {
  const now = Date.now();
  for (const [id, j] of jobs) if (now - j.updatedAt > TTL_MS) jobs.delete(id);
  while (jobs.size >= MAX_JOBS) jobs.delete(jobs.keys().next().value as string);
}

export function startJob(input: RadarInput, locale: Locale, run: typeof runRadar = runRadar): Job {
  sweep();
  const now = Date.now();
  const job: Job = { id: randomUUID(), status: "running", stage: STAGES[0], stageIndex: 0, stageCount: STAGES.length, partial: { demo: !!input.demo }, startedAt: now, updatedAt: now };
  jobs.set(job.id, job);
  run(input, locale, {
    onProgress: ({ stage, partial }) => {
      if (job.status !== "running") return;
      Object.assign(job, { stage, stageIndex: STAGES.indexOf(stage), partial, updatedAt: Date.now() });
    },
  })
    .then((result) => Object.assign(job, { status: "done", result, stageIndex: STAGES.length, updatedAt: Date.now() }))
    .catch((error) => Object.assign(job, { status: "error", error, updatedAt: Date.now() }));
  return job;
}

export function getJob(id: string): Job | undefined {
  const j = jobs.get(id);
  if (j && Date.now() - j.updatedAt > TTL_MS) { jobs.delete(id); return undefined; }
  return j;
}
