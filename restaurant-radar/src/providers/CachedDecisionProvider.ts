// Decorator: identical (state, questions) are never sent to the decision engine twice.
// The cache key ignores mock-only fields. Counts real requests and cache hits for the admin panel.
import { CONFIG } from "@/config";
import { cacheGet, cacheSet } from "@/lib/cache";
import { hash } from "@/lib/store";
import type { ProviderBudget } from "@/services/ProviderBudgetService";
import type { BinaryRequest, BinaryResponse, ChoiceRequest, ChoiceResponse, DecisionProvider } from "./DecisionProvider";

const strip = (r: ChoiceRequest | BinaryRequest) => {
  const { mockScores, mockProbability, context, ...rest } = r as ChoiceRequest & BinaryRequest; // eslint-disable-line @typescript-eslint/no-unused-vars
  return rest;
};

export class CachedDecisionProvider implements DecisionProvider {
  constructor(private inner: DecisionProvider, private budget?: ProviderBudget) {}
  get engine() { return this.inner.engine; }

  private async cached<T>(kind: string, payload: unknown, fn: () => Promise<T>): Promise<T> {
    const key = `decision:${this.inner.engine}:${kind}:${hash(payload)}`;
    const hit = cacheGet<T>(key);
    if (hit !== undefined) { if (this.budget) this.budget.counters.jevCached++; return hit; }
    if (this.budget) { this.budget.counters.jevRequests++; this.budget.spentUsd += CONFIG.budget.unit.jevRequest; }
    const v = await fn();
    cacheSet(key, v, CONFIG.cacheTtlHours.decisions);
    return v;
  }

  choose(req: ChoiceRequest): Promise<ChoiceResponse> { return this.cached("choose", strip(req), () => this.inner.choose(req)); }
  binary(req: BinaryRequest): Promise<BinaryResponse> { return this.cached("binary", strip(req), () => this.inner.binary(req)); }
  binaryBatch(state: unknown, reqs: BinaryRequest[]) { return this.cached("binaryBatch", { state, q: reqs.map(strip) }, () => this.inner.binaryBatch(state, reqs)); }
  chooseBatch(state: unknown, reqs: ChoiceRequest[]) { return this.cached("chooseBatch", { state, q: reqs.map(strip) }, () => this.inner.chooseBatch(state, reqs)); }
}
