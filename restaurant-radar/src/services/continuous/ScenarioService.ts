// "Et si...?" Up to 3 contextual scenarios, each mapped to a supported experiment. Jev then labels each one.
import type { Opportunity } from "@/services/EvidenceService";
import { EXPERIMENTS } from "./ExperimentService";
import type { ExperimentType } from "./types";

export interface Scenario { experiment: ExperimentType; evidenceIds: string[]; cost: string; risk: string; reversible: boolean; weeks: number; }

export function scenarios(opps: Opportunity[], max = 3): Scenario[] {
  const seen = new Set<string>();
  const out: Scenario[] = [];
  for (const o of opps) {
    const exp = o.experiment as ExperimentType | undefined;
    if (!exp || !EXPERIMENTS[exp] || seen.has(exp)) continue;
    seen.add(exp);
    const d = EXPERIMENTS[exp];
    out.push({ experiment: exp, evidenceIds: o.evidenceIds, cost: d.cost, risk: d.risk, reversible: d.reversible, weeks: d.weeks });
    if (out.length >= max) break;
  }
  return out;
}
