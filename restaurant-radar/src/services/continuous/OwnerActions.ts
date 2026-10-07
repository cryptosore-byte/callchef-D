// Owner actions on the stored record: start / log / stop a test, save financial inputs. Validation lives here.
import { loadRecord, saveRecord, storedReviews } from "./RestaurantStore";
import { EXPERIMENTS, startExperiment } from "./ExperimentService";
import type { ExperimentType, Financials } from "./types";

export class OwnerActionError extends Error { constructor(public code: "not_found" | "invalid" | "busy") { super(code); } }

const num = (v: unknown, max: number) => { const n = Number(v); return isFinite(n) && n >= 0 && n <= max ? n : undefined; };

export function ownerStartTest(restaurantId: string, type: string, now = Date.now()) {
  const rec = loadRecord(restaurantId);
  if (!rec) throw new OwnerActionError("not_found");
  if (!(type in EXPERIMENTS)) throw new OwnerActionError("invalid");
  // One test at a time: a second one would blur the measurement of the first.
  if (rec.experiments.some((e) => e.status === "ACTIVE")) throw new OwnerActionError("busy");
  const target = { ...rec.places[rec.targetId], reviews: storedReviews(rec, rec.targetId) };
  const exp = startExperiment(rec, type as ExperimentType, target, now);
  rec.timeline.push({ at: new Date(now).toISOString(), kind: "EXPERIMENT_STARTED", code: "tl.started", params: { type } });
  saveRecord(rec);
  return exp;
}

export function ownerLogValue(restaurantId: string, experimentId: string, value: unknown, now = Date.now()) {
  const rec = loadRecord(restaurantId);
  const e = rec?.experiments.find((x) => x.id === experimentId && x.status === "ACTIVE");
  const v = num(value, 1_000_000);
  if (!rec || !e) throw new OwnerActionError("not_found");
  if (v === undefined) throw new OwnerActionError("invalid");
  e.ownerEntries.push({ at: new Date(now).toISOString(), value: v });
  saveRecord(rec);
  return e;
}

export function ownerStopTest(restaurantId: string, experimentId: string, now = Date.now()) {
  const rec = loadRecord(restaurantId);
  const e = rec?.experiments.find((x) => x.id === experimentId && x.status === "ACTIVE");
  if (!rec || !e) throw new OwnerActionError("not_found");
  e.status = "INCONCLUSIVE"; // stopped early: never presented as a result
  e.endDate = new Date(now).toISOString();
  e.result = { label: "INCONCLUSIVE", before: e.baseline, after: e.current ?? e.baseline, decidedBy: "rule" };
  rec.timeline.push({ at: e.endDate, kind: "EXPERIMENT_COMPLETED", code: "tl.stopped", params: { type: e.type } });
  saveRecord(rec);
  return e;
}

export function ownerSaveFinancials(restaurantId: string, body: Record<string, unknown>) {
  const rec = loadRecord(restaurantId);
  if (!rec) throw new OwnerActionError("not_found");
  const f: Financials = {
    aov: num(body.aov, 500), weeklyOrders: num(body.weeklyOrders, 100_000), foodCostPct: num(body.foodCostPct, 100),
    extraOrdersLow: num(body.extraOrdersLow, 1000), extraOrdersHigh: num(body.extraOrdersHigh, 1000),
  };
  if (f.extraOrdersLow !== undefined && f.extraOrdersHigh !== undefined && f.extraOrdersLow > f.extraOrdersHigh) [f.extraOrdersLow, f.extraOrdersHigh] = [f.extraOrdersHigh, f.extraOrdersLow];
  rec.financials = f;
  saveRecord(rec);
  return f;
}
