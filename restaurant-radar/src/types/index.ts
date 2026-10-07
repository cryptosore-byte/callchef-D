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
}

// ---- Competitors -----------------------------------------------------------

export interface RelevanceBreakdown {
  foodType: number; proximity: number; price: number;
  reputation: number; hours: number; format: number; // each 0..1
}

export interface CompetitorCandidate {
  restaurant: Restaurant;
  distanceM: number;
  relevance: number; // 0..100
  breakdown: RelevanceBreakdown;
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
  decisions: DecisionSet;
  radarScore: RadarScore;
  battles: Record<string, BattleResult>;
  plan?: BattlePlan;
  dataQuality: DataQuality;
  sources: SourceMeta[];
  generatedAt: string;
  warnings: string[];
}
