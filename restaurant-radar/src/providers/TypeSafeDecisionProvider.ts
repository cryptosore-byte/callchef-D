// Real Jev adapter. Contract: https://docs.typesafe.ai/api.md
//   POST https://api.typesafe.ai/v1/systemone  (Authorization: Bearer <key>)
//   { state, model: "jev-latest", questions: { id: { type: "choice"|"noul", instructions, criteria } } }
import type { BinaryRequest, BinaryResponse, ChoiceRequest, ChoiceResponse, DecisionProvider } from "./DecisionProvider";

export type JevErrorCode = "unauthorized" | "rate_limit" | "invalid" | "timeout" | "network" | "server" | "bad_response";
export class JevError extends Error {
  constructor(public code: JevErrorCode, detail?: string) { super(detail ? `${code}: ${detail}` : code); }
}

const ENDPOINT = process.env.TYPESAFE_API_URL ?? "https://api.typesafe.ai/v1/systemone";
const MODEL = "jev-latest";
const TIMEOUT_MS = 20_000;
const MAX_RETRIES = 2; // on 429 / 529 only, exponential backoff as the docs recommend

type Q = { type: "choice" | "noul"; instructions: unknown; criteria?: unknown };
/* eslint-disable @typescript-eslint/no-explicit-any */

export class TypeSafeDecisionProvider implements DecisionProvider {
  readonly engine = "jev" as const;
  constructor(private apiKey = process.env.TYPESAFE_API_KEY) {}
  static isConfigured() { return !!process.env.TYPESAFE_API_KEY; }

  private async evaluate(state: unknown, questions: Record<string, Q>): Promise<Record<string, any>> {
    for (let attempt = 0; ; attempt++) {
      const ctrl = new AbortController();
      const timer = setTimeout(() => ctrl.abort(), TIMEOUT_MS);
      let res: Response;
      try {
        res = await fetch(ENDPOINT, {
          method: "POST",
          headers: { "Content-Type": "application/json", Authorization: `Bearer ${this.apiKey}` },
          body: JSON.stringify({ state, model: MODEL, questions }),
          signal: ctrl.signal,
        });
      } catch (e) {
        if ((e as Error).name === "AbortError") throw new JevError("timeout");
        throw new JevError("network", (e as Error).message);
      } finally { clearTimeout(timer); }

      if ((res.status === 429 || res.status === 529) && attempt < MAX_RETRIES) {
        await new Promise((r) => setTimeout(r, 400 * 2 ** attempt));
        continue;
      }
      if (res.status === 401) throw new JevError("unauthorized");
      if (res.status === 429 || res.status === 529) throw new JevError("rate_limit", String(res.status));
      if (res.status === 422) throw new JevError("invalid", await res.text().catch(() => ""));
      if (!res.ok) throw new JevError("server", `HTTP ${res.status}`);
      const body = await res.json().catch(() => null);
      if (!body?.answers || typeof body.answers !== "object") throw new JevError("bad_response");
      return body.answers;
    }
  }

  private toChoiceQ(req: ChoiceRequest): Q {
    return { type: "choice", instructions: req.question, criteria: req.criteria ?? Object.fromEntries(req.options.map((o) => [o, null])) };
  }
  private toChoice(a: any, id: string): ChoiceResponse {
    if (a?.type !== "choice" || typeof a.choice !== "string" || !a.probabilities) throw new JevError("bad_response", id);
    const distribution = Object.entries(a.probabilities as Record<string, number>)
      .map(([option, probability]) => ({ option, probability }))
      .sort((x, y) => y.probability - x.probability);
    return { choice: a.choice, confidence: Number(a.confidence) || 0, distribution };
  }

  async choose(req: ChoiceRequest): Promise<ChoiceResponse> {
    const answers = await this.evaluate(req.state ?? req.context, { [req.id]: this.toChoiceQ(req) });
    return this.toChoice(answers[req.id], req.id);
  }

  async chooseBatch(state: unknown, reqs: ChoiceRequest[]): Promise<Record<string, ChoiceResponse>> {
    if (!reqs.length) return {};
    const answers = await this.evaluate(state, Object.fromEntries(reqs.map((r) => [r.id, this.toChoiceQ(r)])));
    return Object.fromEntries(reqs.map((r) => [r.id, this.toChoice(answers[r.id], r.id)]));
  }

  private toQ(r: BinaryRequest): Q {
    return { type: "noul", instructions: r.instructions ?? r.question, ...(r.criteria ? { criteria: r.criteria } : {}) };
  }
  private toBinary(a: any, id: string): BinaryResponse {
    if (a?.type !== "noul" || typeof a.noul !== "number") throw new JevError("bad_response", id);
    // Noul has no separate confidence in the API: use distance from 0.5.
    return { probability: a.noul, confidence: Math.max(a.noul, 1 - a.noul) };
  }

  async binary(req: BinaryRequest): Promise<BinaryResponse> {
    const answers = await this.evaluate(req.state ?? req.context, { [req.id]: this.toQ(req) });
    return this.toBinary(answers[req.id], req.id);
  }

  async binaryBatch(state: unknown, reqs: BinaryRequest[]): Promise<Record<string, BinaryResponse>> {
    const answers = await this.evaluate(state, Object.fromEntries(reqs.map((r) => [r.id, this.toQ(r)])));
    return Object.fromEntries(reqs.map((r) => [r.id, this.toBinary(answers[r.id], r.id)]));
  }
}
