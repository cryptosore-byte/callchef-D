// SIMULATION, NOT A FORECAST. Uses only owner-provided financial values; never invents an average ticket.
import type { ExperimentType, Financials } from "./types";

export interface Simulation {
  type: ExperimentType;
  /** "money" = monthly gross sales range from owner inputs; "operational" = no money figure (missing inputs). */
  kind: "money" | "operational";
  low?: number; high?: number;
  assumptions: Record<string, number>;
  missing: string[];
}

const WEEKS_PER_MONTH = 4.33;

export function simulate(type: ExperimentType, f: Financials | undefined): Simulation | null {
  if (type === "EXTEND_WEEKEND_HOURS") {
    // Extra orders per extra evening: the owner's own scenario (no default market figure is presented as fact).
    const missing = [f?.aov ? "" : "aov", f?.extraOrdersLow !== undefined && f?.extraOrdersHigh !== undefined ? "" : "extraOrders"].filter(Boolean);
    if (missing.length) return { type, kind: "operational", assumptions: {}, missing };
    const evenings = 2; // Friday + Saturday
    const low = Math.round(f!.extraOrdersLow! * evenings * WEEKS_PER_MONTH * f!.aov!);
    const high = Math.round(f!.extraOrdersHigh! * evenings * WEEKS_PER_MONTH * f!.aov!);
    return { type, kind: "money", low, high, assumptions: { aov: f!.aov!, extraOrdersLow: f!.extraOrdersLow!, extraOrdersHigh: f!.extraOrdersHigh!, evenings }, missing: [] };
  }
  if (type === "TEST_VALUE_BUNDLE") {
    const missing = [f?.aov ? "" : "aov", f?.extraOrdersLow !== undefined && f?.extraOrdersHigh !== undefined ? "" : "extraOrders"].filter(Boolean);
    if (missing.length) return { type, kind: "operational", assumptions: {}, missing };
    const low = Math.round(f!.extraOrdersLow! * WEEKS_PER_MONTH * f!.aov!);
    const high = Math.round(f!.extraOrdersHigh! * WEEKS_PER_MONTH * f!.aov!);
    return { type, kind: "money", low, high, assumptions: { aov: f!.aov!, extraOrdersLow: f!.extraOrdersLow!, extraOrdersHigh: f!.extraOrdersHigh! }, missing: [] };
  }
  return null; // other tests are measured operationally (reviews, visibility...), never in euros
}
