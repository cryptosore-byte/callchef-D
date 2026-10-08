// Continuous intelligence: persisted per restaurant. Compact on purpose (no full payloads in snapshots).
import type { Restaurant, Review, Theme } from "@/types";
import type { ScanMode } from "@/services/ProviderBudgetService";

export interface PlaceSnap {
  id: string; name: string; rating: number; reviewCount: number;
  weekendClose?: string; dailyClose?: string; distanceM?: number; cuisine?: string; closed?: boolean;
}

export interface MarketSnapshot {
  at: string;                     // ISO
  mode: ScanMode;
  target: PlaceSnap;
  competitors: PlaceSnap[];       // confirmed direct competitors
  nearby: PlaceSnap[];            // all places within the radius (market context)
  /** Negative and positive mentions per 100 reviews in the last 90 days, per theme (null when the sample is too small). */
  themes: Partial<Record<Theme, { neg100: number; pos100: number; reviews: number }>>;
  deliveryAvg?: number | null;
  instagram?: { followers: number; posts?: number; er?: number } | null;
  visibility?: number | null;
  searchRanks?: { query: string; rank: number | null }[];
}

export type TimelineKind = "INITIAL_SCAN" | "DEEP_SCAN" | "CHANGE" | "EXPERIMENT_STARTED" | "EXPERIMENT_MIDPOINT" | "EXPERIMENT_COMPLETED";
export interface TimelineEvent { at: string; kind: TimelineKind; code: string; params?: Record<string, string | number>; }

export type ExperimentType =
  | "EXTEND_WEEKEND_HOURS" | "TEST_NEW_PACKAGING" | "RUN_REVIEW_GENERATION_TEST" | "TEST_VALUE_BUNDLE"
  | "IMPROVE_GOOGLE_PROFILE" | "UPDATE_POSITIONING" | "TEST_INSTAGRAM_CONTENT_PLAN" | "TEST_MENU_RESTRUCTURE";
export type ExperimentStatus = "PLANNED" | "ACTIVE" | "COMPLETED" | "INCONCLUSIVE";
export type ExperimentResultLabel = "PROMISING" | "NO_CLEAR_EFFECT" | "NEGATIVE" | "INCONCLUSIVE";

export interface Measurement { metric: string; value: number | null; unit: string; sample?: number; source: "reviews" | "google" | "owner" | "visibility" | "instagram"; }

export interface Experiment {
  id: string;
  restaurantId: string;
  type: ExperimentType;
  /** Localized: `exp.hyp.<type>`, `exp.measure.<type>`. */
  startDate: string;
  endDate: string;
  baseline: Measurement;
  current?: Measurement;
  costLevel: "LOW" | "MEDIUM" | "HIGH";
  riskLevel: "LOW" | "MEDIUM" | "HIGH";
  reversible: boolean;
  status: ExperimentStatus;
  /** Owner-entered values (sales during the extra hour, bundles sold...). Never estimated by us. */
  ownerEntries: { at: string; value: number }[];
  result?: { label: ExperimentResultLabel; before: Measurement; after: Measurement; decidedBy: "rule" | "jev" | "jev-demo" };
  midpointLogged?: boolean;
}

export interface Financials { aov?: number; weeklyOrders?: number; foodCostPct?: number; extraOrdersLow?: number; extraOrdersHigh?: number; }

export interface StoredReview extends Review { hash: string; }

export interface RestaurantRecord {
  id: string;
  name: string;
  input: { name: string; address: string; radiusM: number; demo?: boolean };
  createdAt: string;
  lastDeepAt?: string;
  lastMonthlyAt?: string;
  lastRefreshAt?: string;
  /** Latest known public profiles (reviews stored separately), keyed by place id. */
  places: Record<string, Restaurant>;
  targetId: string;
  confirmedIds: string[];
  /** Reviews by place id then by stable hash: classified once, reused forever. */
  reviews: Record<string, Record<string, StoredReview>>;
  snapshots: MarketSnapshot[];
  timeline: TimelineEvent[];
  experiments: Experiment[];
  financials?: Financials;
}
