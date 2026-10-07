// Adapter boundary for Jev / TypeSafe. Swap the implementation, nothing else changes.
import { CONFIG } from "@/config";

type Rubric = string | Record<string, unknown> | unknown[];

export interface ChoiceRequest {
  id: string;
  question: string;
  options: string[];
  /** Short facts for logging / mock. */
  context: Record<string, unknown>;
  /** Structured facts the model judges against (sent as TypeSafe `state`). */
  state?: unknown;
  /** Option -> description. Every option should say what it means and what it is NOT. */
  criteria?: Record<string, Rubric>;
  /**
   * Heuristic scores 0..1 per option. ONLY read by the demo/mock provider so the
   * mock behaves plausibly. The real Jev adapter ignores this field.
   */
  mockScores?: Record<string, number>;
}

export interface BinaryRequest {
  id: string;
  question: string;
  context: Record<string, unknown>;
  state?: unknown;
  instructions?: Rubric;
  criteria?: { true?: Rubric; false?: Rubric };
  mockProbability?: number; // mock only
}

export interface ChoiceResponse {
  choice: string;
  confidence: number; // 0..1 raw
  distribution: { option: string; probability: number }[];
}
export interface BinaryResponse { probability: number; confidence: number; }

export interface DecisionProvider {
  readonly engine: "jev" | "jev-demo";
  choose(req: ChoiceRequest): Promise<ChoiceResponse>;
  binary(req: BinaryRequest): Promise<BinaryResponse>;
  /** Many independent yes/no questions over ONE shared state, in a single request. */
  binaryBatch(state: unknown, reqs: BinaryRequest[]): Promise<Record<string, BinaryResponse>>;
  /** Many independent choice questions over ONE shared state, in a single request (they cannot see each other's answers). */
  chooseBatch(state: unknown, reqs: ChoiceRequest[]): Promise<Record<string, ChoiceResponse>>;
}

/** Deterministic stand-in used in demo mode. Labeled "jev-demo" everywhere in the UI. */
export class MockDecisionProvider implements DecisionProvider {
  readonly engine = "jev-demo" as const;
  private k = 6;

  async choose(req: ChoiceRequest): Promise<ChoiceResponse> {
    const scores = req.mockScores ?? {};
    const exps = req.options.map((o) => Math.exp(this.k * (scores[o] ?? 0)));
    const sum = exps.reduce((a, b) => a + b, 0);
    const distribution = req.options
      .map((option, i) => ({ option, probability: exps[i] / sum }))
      .sort((a, b) => b.probability - a.probability);
    // Confidence rewards a high top score AND a clear margin over the runner-up.
    const sorted = req.options.map((o) => scores[o] ?? 0).sort((a, b) => b - a);
    const top = sorted[0] ?? 0;
    const second = sorted[1] ?? 0;
    const confidence = Math.min(0.96, Math.max(0.2, 0.2 + 0.5 * top + 1.0 * (top - second)));
    const best = req.options.reduce((a, b) => ((scores[b] ?? 0) > (scores[a] ?? 0) ? b : a), req.options[0]);
    return { choice: best, confidence, distribution };
  }

  async binary(req: BinaryRequest): Promise<BinaryResponse> {
    const p = req.mockProbability ?? 0.5;
    return { probability: p, confidence: Math.min(0.97, 0.5 + Math.abs(p - 0.5)) };
  }

  async chooseBatch(_state: unknown, reqs: ChoiceRequest[]) {
    const out: Record<string, ChoiceResponse> = {};
    for (const r of reqs) out[r.id] = await this.choose(r);
    return out;
  }

  async binaryBatch(_state: unknown, reqs: BinaryRequest[]) {
    const out: Record<string, BinaryResponse> = {};
    for (const r of reqs) out[r.id] = await this.binary(r);
    return out;
  }
}

export function tierFor(confidence: number): "STRONG" | "TEST" | "INSUFFICIENT" {
  if (confidence >= CONFIG.confidence.strong) return "STRONG";
  if (confidence >= CONFIG.confidence.test) return "TEST";
  return "INSUFFICIENT";
}
