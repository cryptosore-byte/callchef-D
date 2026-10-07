// 30-day plan V3: TO PROTECT / TO TEST / TO EXPLOIT / NOT A PRIORITY.
// Each item says WHAT, WHY (evidence ids), and for the test: HOW (duration) and what to MEASURE.
import type { ConfidenceTier, Reason } from "@/types";
import type { DecisionSetV3 } from "./BusinessDecisionService";
import { NONE } from "./BusinessDecisionService";
import type { Evidence, Opportunity } from "./EvidenceService";
import type { CompetitorCard, CompetitorRoles } from "./CompetitorInsightService";

export interface PlanItemV3 {
  what: Reason;            // localized: `planv3.<code>` / option labels
  why: string[];           // evidence ids
  weeks?: number;          // TEST only
  measure?: string;        // TEST only: localized `measure.<experiment>`
  tier: ConfidenceTier;
}
export interface PlanV3 { protect: PlanItemV3; test: PlanItemV3; exploit: PlanItemV3; notPriority: PlanItemV3; }

export function buildPlanV3(d: DecisionSetV3, evidence: Evidence[], opportunities: Opportunity[], cards: Record<string, CompetitorCard>, roles: CompetitorRoles): PlanV3 | undefined {
  if (!d.available || !d.dontTouch || !d.bestTest || !d.owner) return undefined;
  const none = (x: string) => Object.values(NONE).includes(x);

  const protect: PlanItemV3 = none(d.dontTouch.choice)
    ? { what: { code: "protect.none" }, why: [], tier: "INSUFFICIENT" }
    : { what: { code: "keep", params: { opt: d.dontTouch.choice } }, why: d.dontTouch.supportingEvidenceIds, tier: d.dontTouch.tier };

  const opp = opportunities.find((o) => o.experiment === d.bestTest!.choice);
  const test: PlanItemV3 = none(d.bestTest.choice)
    ? { what: { code: "test.none" }, why: [], tier: "INSUFFICIENT" }
    : { what: { code: "exp", params: { opt: d.bestTest.choice } }, why: d.bestTest.supportingEvidenceIds, weeks: opp?.weeksToTest ?? 4, measure: d.bestTest.choice, tier: d.bestTest.tier };

  // Exploit: an advantage the owner already has, in order of usefulness. Code only, from observed facts.
  const pick = (kind: string) => evidence.find((e) => e.kind === kind);
  const notComm = pick("strengthNotCommunicated");
  const later = pick("youOpenLater");
  const social = pick("socialStrength");
  const card = roles.topThreatId ? cards[roles.topThreatId] : undefined;
  const edge = card?.youDoBetter[0];
  const exploit: PlanItemV3 = notComm ? { what: { code: "exploit.communicate", params: { theme: notComm.params.theme } }, why: [notComm.id], tier: "TEST" }
    : later ? { what: { code: "exploit.later", params: later.params }, why: [later.id], tier: "TEST" }
    : social ? { what: { code: "exploit.social", params: social.params }, why: [social.id], tier: "TEST" }
    : edge ? { what: { code: "exploit.edge", params: { reason: edge.code, ...(edge.params ?? {}) } }, why: [], tier: "TEST" }
    : { what: { code: "exploit.none" }, why: [], tier: "INSUFFICIENT" };

  const notPriority: PlanItemV3 = !none(d.owner.notDo.choice)
    ? { what: { code: "not", params: { opt: d.owner.notDo.choice } }, why: d.owner.notDo.supportingEvidenceIds, tier: d.owner.notDo.tier }
    // No collected menu data: we can honestly say nothing points to the menu being the problem.
    : { what: { code: "not.menu" }, why: [], tier: "TEST" };

  return { protect, test, exploit, notPriority };
}
