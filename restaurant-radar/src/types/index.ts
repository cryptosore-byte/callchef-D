// ---------------------------------------------------------------------------
// Internal domain types. The rest of the app NEVER depends on provider JSON.
// ---------------------------------------------------------------------------

export type FoodType =
  | "burger" | "pizza" | "sushi" | "kebab" | "fried_chicken" | "tacos"
  | "asian_street" | "bakery" | "dessert" | "coffee" | "bistro" | "other";

export type RestaurantFormat =
  | "fast_food" | "casual_dining" | "premium" | "bakery" | "coffee" | "dessert";

export type Theme =
  | "FOOD_QUALITY" | "TASTE" | "FRIES" | "BURGER" | "CHICKEN" | "PIZZA"
  | "PORTION" | "VALUE_FOR_MONEY" | "PRICE" | "WAITING_TIME"
  | "DELIVERY_EXPERIENCE" | "PACKAGING" | "SERVICE" | "CLEANLINESS"
  | "ORDER_ACCURACY" | "MISSING_ITEMS" | "TEMPERATURE" | "TEXTURE"
  | "ATMOSPHERE" | "CONSISTENCY";

export type Sentiment = "positive" | "neutral" | "negative";
export type Severity = "low" | "medium" | "high";

export interface ThemeMention {
  theme: Theme;
  sentiment: Sentiment;
  severity: Severity;
  product?: string;
  reason?: string; // short signal word(s), e.g. "cold", "soggy"
}

export interface Review {
  id: string;
  text: string;
  rating: number;
  date: string; // ISO
  authorName?: string;
  source: string;
  mentions?: ThemeMention[];
}

export interface OpeningHours {
  open: string;  // "HH:MM" - MVP assumes one daily schedule
  close: string; // "HH:MM" - may be past midnight ("02:00")
}

/** Normalized cuisine taxonomy (V3). The coarse `FoodType` above is kept for search keywords and legacy code. */
export type CuisineType =
  | "BURGER" | "SMASH_BURGER" | "GOURMET_BURGER" | "FRIED_CHICKEN" | "CHICKEN" | "KEBAB" | "TACOS_FR"
  | "PIZZA" | "SUSHI" | "JAPANESE" | "THAI" | "VIETNAMESE" | "INDIAN" | "PAKISTANI" | "LEBANESE"
  | "MEDITERRANEAN" | "HEALTHY" | "POKE" | "BRUNCH" | "BAKERY" | "DESSERT" | "COFFEE"
  | "CASUAL_DINING" | "FINE_DINING" | "STREET_FOOD" | "OTHER";

export type CuisineModifier =
  | "HALAL" | "VEGETARIAN" | "VEGAN" | "PREMIUM" | "VALUE" | "FAST_FOOD" | "FAST_CASUAL"
  | "LATE_NIGHT" | "DELIVERY_FOCUSED" | "FAMILY" | "TRENDY";

export type EvidenceSource = "category" | "name" | "description" | "reviews" | "attributes" | "website" | "price" | "hours";
export interface Signal { source: EvidenceSource; text: string; }
export type Level3 = "HIGH" | "MEDIUM" | "LOW";

export interface FoodProfile {
  primary: CuisineType;
  secondary?: CuisineType;
  modifiers: { key: CuisineModifier; evidence: Signal[] }[];
  confidence: number; // 0..1
  level: Level3;      // LOW = shown as "uncertain", never silently trusted
  evidence: Signal[];
}

export interface DayHours { day: number; open: string; close: string } // day: 0 = Monday ... 6 = Sunday

export interface SourceMeta {
  provider: string;       // "demo" | "apify:google-maps" ...
  retrievedAt: string;    // ISO
  url?: string;
  attribution?: string;
}

export interface Restaurant {
  id: string;
  name: string;
  address: string;
  latitude: number;
  longitude: number;
  categories: string[];
  primaryFoodType: FoodType;
  format: RestaurantFormat;
  rating: number;
  reviewCount: number;
  priceLevel: 1 | 2 | 3 | 4;
  openingHours?: OpeningHours;
  website?: string;
  source: SourceMeta;
  reviews: Review[];
  // ---- V3 observable fields (all optional: missing = unknown, never zero) ----
  /** false when the provider returned no price: priceLevel is then a placeholder and must not be used for claims. */
  priceKnown?: boolean;
  description?: string;
  /** Google "additional info" flags that are true, e.g. "Halal food", "Delivery", "Good for kids". */
  attributes?: string[];
  phone?: string;
  menuUrl?: string;
  imagesCount?: number;
  weeklyHours?: DayHours[];
  /** Position of this place in a provider search, when the provider exposes it. */
  searchRanks?: { query: string; rank: number }[];
  foodProfile?: FoodProfile;
}

// ---- Competitors -----------------------------------------------------------

export interface RelevanceBreakdown {
  foodType: number; occasion: number; proximity: number; price: number;
  reviewVolume: number; hours: number; format: number; // each 0..1
  priceKnown: boolean; // false = price unknown on either side, `price` is a neutral 0.5
}

/** Bayesian-smoothed reputation. Raw rating is shown publicly; adjusted rating is used internally. */
export interface Reputation {
  rawRating: number;
  reviewCount: number;
  adjustedRating: number;
  reputationConfidence: Level3;
  marketAverage: number; // C in the formula
}

export type BenchmarkLevel = "STRONG" | "MEDIUM" | "WEAK";
/** Structured reason, localized in the UI: `reason.<code>` with params. */
export interface Reason { code: string; params?: Record<string, string | number>; }

export interface CompetitorCandidate {
  restaurant: Restaurant;
  distanceM: number;
  relevance: number; // 0..100 Competitor Relevance Score V2
  breakdown: RelevanceBreakdown;
  reputation: Reputation;
  /** Likelihood of capturing the same customers (0..100). Review volume is not an input. */
  threatPotential: number;
  threatLevel: Level3;
  threatReasons: Reason[];
  /** How reliably we can learn from this place (0..100). Review volume is central. */
  benchmarkQuality: number;
  benchmarkLevel: BenchmarkLevel;
  benchmarkReasons: Reason[];
  /** Debug: why this place was not kept as a direct competitor. */
  rejectionReasons?: Reason[];
}

export interface Competitor extends CompetitorCandidate {
  competitorProbability: number; // from Jev yes/no decision
  competitorConfidence: number;
  threatScore: number;           // 0..100 (code feature, input to Decision A)
}

// ---- Review intelligence ---------------------------------------------------

export interface ThemeStat {
  theme: Theme;
  mentions: number;
  positive: number;
  neutral: number;
  negative: number;
  positiveRate: number; // 0..1 of AVAILABLE mentions
  negativeRate: number;
  highSeverity: number;
  signals: { word: string; count: number }[];
  recentTrend: "improving" | "worsening" | "stable" | "unknown";
  /** Negative mentions per 100 analyzed reviews: last 90 days vs the previous 90 days (null = sample too small). */
  recency?: { recentPer100: number; previousPer100: number; recentReviews: number; previousReviews: number } | null;
}

export type RootCauseKey =
  | "PRODUCT_RECIPE" | "PACKAGING" | "DELIVERY_HOLDING" | "KITCHEN_SPEED"
  | "SERVICE" | "PRICE_POSITIONING" | "PORTION_SIZE" | "ORDER_ACCURACY"
  | "MENU_STRUCTURE";

export interface RootCause {
  key: RootCauseKey;
  label: string;
  confidence: number; // 0..1, always a hypothesis
  evidence: string[];
}

export interface ReviewSummary {
  restaurantId: string;
  reviewsAnalyzed: number;
  totalMentions: number;
  positiveMentions: number;
  negativeMentions: number;
  netSentiment: number; // -1..1
  stats: ThemeStat[];
  rootCauses: RootCause[];
}

// ---- Market ---------------------------------------------------------------

export interface MarketFeatures {
  targetRestaurant: Restaurant;
  localMarket: {
    restaurantsDetected: number;
    avgRating: number;
    ratingPercentile: number;
    reviewCountPercentile: number;
    sameFoodTypeCount: number;
    foodTypeDensity: number;
    lateNightCount: number;
  };
  competitors: {
    count: number;
    avgRating: number;
    avgPriceLevel: number;
    ratingGap: number; // target - competitor avg
  };
  reviewSignals: Record<string, ReviewSummary>;
  priceSignals: { targetLevel: number; competitorAvgLevel: number; priceThemeNegRate: number | null };
  availabilitySignals: {
    targetCloses: string;
    latestCompetitorCloses: string;
    extraCompetitorHours: number;
    targetLateNight: boolean;
  };
}

// ---- Decisions -------------------------------------------------------------

export type ConfidenceTier = "STRONG" | "TEST" | "INSUFFICIENT";

export interface EvidenceItem { label: string; value: string; }

export interface DecisionResult {
  id: string;
  question: string;
  choice: string;       // chosen option (or "YES"/"NO")
  confidence: number;   // 0..1 AFTER data-quality adjustment
  rawConfidence: number;
  distribution: { option: string; probability: number }[];
  tier: ConfidenceTier;
  evidence: EvidenceItem[];
  conclusion: string;
  engine: "jev" | "jev-demo"; // "jev-demo" = deterministic mock standing in for Jev
}

export interface PrioritySignal { score: 0 | 1 | 2 | 3 | 4 | 5; label: string; }

export interface DecisionSet {
  available: boolean;
  unavailableReason?: string;
  biggestThreat?: DecisionResult;
  whyTheyWin?: DecisionResult;
  advantage?: DecisionResult;
  weakness?: DecisionResult;
  shouldAct?: DecisionResult;
  nextAction?: DecisionResult;
  priority?: PrioritySignal;
}

// ---- Radar score -----------------------------------------------------------

export interface RadarScore {
  total: number;
  dimensions: { key: string; label: string; score: number; formula: string; lowEvidence?: boolean }[];
}

// ---- Battle / plan --------------------------------------------------------

export type BattleVerdict = "YOU_WIN" | "COMPETITOR_WINS" | "TOO_CLOSE";

export interface BattleDimension {
  key: string; label: string;
  you: number; them: number; // 0..100
  verdict: BattleVerdict;
  note: string;
}

export interface BattleResult {
  competitorId: string;
  competitorName: string;
  dimensions: BattleDimension[];
  verdictCounts: Record<BattleVerdict, number>;
  battleground?: DecisionResult;
  howToWin: string;
}

export interface PlanItem { title: string; detail: string; }
export interface BattlePlan { defend: PlanItem; fix: PlanItem; attack: PlanItem; ignore: PlanItem; }

// ---- Data quality ---------------------------------------------------------

export type DataQualityLevel = "HIGH" | "MEDIUM" | "LOW";
export interface DataQuality {
  level: DataQualityLevel;
  reviewsAnalyzed: number;
  competitorsAnalyzed: number;
  restaurantsDetected: number;
  refreshedAt: string;
  notes: string[];
}

// ---- Final payload --------------------------------------------------------

export interface RadarInput { name: string; address: string; radiusM: number; demo?: boolean; }

export interface RadarResult {
  id: string;
  demo: boolean;
  locale: "en" | "fr";
  input: RadarInput;
  target: Restaurant;
  nearby: CompetitorCandidate[];
  competitors: Competitor[];
  summaries: Record<string, ReviewSummary>;
  market: MarketFeatures;
  decisions: import("@/services/BusinessDecisionService").DecisionSetV3;
  radarScore: RadarScore;
  battles: Record<string, BattleResult>;
  plan?: import("@/services/PlanService").PlanV3;
  dataQuality: DataQuality;
  sources: SourceMeta[];
  generatedAt: string;
  warnings: string[];
  // ---- V3 ----
  targetReputation?: Reputation;
  competitorCards?: Record<string, import("@/services/CompetitorInsightService").CompetitorCard>;
  roles?: import("@/services/CompetitorInsightService").CompetitorRoles;
  digital?: import("@/services/DigitalHealthRunner").DigitalHealth;
  evidence?: import("@/services/EvidenceService").Evidence[];
  opportunities?: import("@/services/EvidenceService").Opportunity[];
  discovery?: import("@/services/EvidenceService").Discovery | null;
}
