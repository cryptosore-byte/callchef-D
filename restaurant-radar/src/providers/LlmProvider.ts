import type { Review, ThemeMention } from "@/types";
/** Optional. Used ONLY for review classification and short explanations - never for decisions. */
export interface LlmProvider {
  readonly available: boolean;
  classifyReviews(reviews: Review[]): Promise<Record<string, ThemeMention[]>>; // structured JSON only
  explain(facts: Record<string, unknown>): Promise<string | null>;
}
export class NoopLlmProvider implements LlmProvider {
  readonly available = false;
  async classifyReviews() { return {}; }
  async explain() { return null; }
}
