// ---------------------------------------------------------------------------
// DEMO DATA - 100% fictional. Marseille burger restaurant + invented neighbours.
// Reviews are generated deterministically from a seeded RNG so counts are exact
// and reproducible. Nothing here refers to real businesses or real customers.
// ---------------------------------------------------------------------------
import type {
  FoodType, Restaurant, RestaurantFormat, Review, Sentiment, Severity, Theme, ThemeMention,
} from "@/types";
import { mulberry32, shuffle } from "@/lib/util";

type Phrase = { signal: string; text: string; product?: string };
type Bank = Partial<Record<Theme, Partial<Record<Sentiment, Phrase[]>>>>;

const BANK: Bank = {
  BURGER: {
    positive: [
      { signal: "tasty", text: "The burger was properly tasty", product: "burger" },
      { signal: "good meat", text: "Good meat, cooked just right", product: "burger" },
      { signal: "generous", text: "Generous burger, well stacked", product: "burger" },
    ],
    neutral: [{ signal: "average", text: "Burger was fine, nothing special", product: "burger" }],
    negative: [{ signal: "dry", text: "Burger was a bit dry", product: "burger" }],
  },
  TASTE: {
    positive: [
      { signal: "flavourful", text: "Really flavourful sauces" },
      { signal: "delicious", text: "Delicious from the first bite" },
    ],
    neutral: [{ signal: "ok", text: "Taste was okay" }],
    negative: [{ signal: "bland", text: "A bit bland for the price" }],
  },
  FRIES: {
    positive: [{ signal: "crispy", text: "Crispy fries", product: "fries" }],
    neutral: [{ signal: "ok", text: "Fries were okay", product: "fries" }],
    negative: [
      { signal: "cold", text: "Fries arrived cold", product: "fries" },
      { signal: "soggy", text: "Soggy fries, sadly", product: "fries" },
      { signal: "soft", text: "Fries were soft and limp", product: "fries" },
    ],
  },
  PACKAGING: {
    positive: [{ signal: "well packed", text: "Everything was well packed" }],
    neutral: [{ signal: "standard", text: "Standard packaging" }],
    negative: [
      { signal: "steamed", text: "Packaging trapped steam, bag was wet" },
      { signal: "crushed", text: "Burger box arrived crushed" },
      { signal: "leaked", text: "Sauce leaked through the bag" },
    ],
  },
  WAITING_TIME: {
    positive: [{ signal: "fast", text: "Served fast" }],
    neutral: [{ signal: "normal", text: "Normal wait" }],
    negative: [
      { signal: "slow", text: "Waited far too long" },
      { signal: "late", text: "Order came late" },
    ],
  },
  PORTION: {
    positive: [{ signal: "generous", text: "Portions are generous" }],
    neutral: [{ signal: "fair", text: "Fair portions" }],
    negative: [{ signal: "small", text: "Portions felt small" }],
  },
  VALUE_FOR_MONEY: {
    positive: [{ signal: "worth it", text: "Great value for money" }],
    neutral: [{ signal: "fair price", text: "Fair for what you get" }],
    negative: [{ signal: "overpriced", text: "Pricey for what it is" }],
  },
  PRICE: {
    positive: [{ signal: "cheap", text: "Affordable prices" }],
    neutral: [{ signal: "average", text: "Prices are average" }],
    negative: [{ signal: "expensive", text: "Getting expensive" }],
  },
  SERVICE: {
    positive: [{ signal: "friendly", text: "Staff were friendly" }, { signal: "helpful", text: "Helpful team" }],
    neutral: [{ signal: "ok", text: "Service was fine" }],
    negative: [{ signal: "rude", text: "Counter staff were curt" }],
  },
  DELIVERY_EXPERIENCE: {
    positive: [{ signal: "on time", text: "Delivery arrived on time" }],
    neutral: [{ signal: "ok", text: "Delivery was alright" }],
    negative: [{ signal: "lukewarm", text: "Lukewarm by the time it arrived" }],
  },
  ORDER_ACCURACY: {
    positive: [{ signal: "correct", text: "Order was exactly right" }],
    neutral: [{ signal: "ok", text: "Order mostly right" }],
    negative: [{ signal: "wrong item", text: "Got the wrong item" }],
  },
  ATMOSPHERE: {
    positive: [{ signal: "cosy", text: "Lovely, lively atmosphere" }],
    neutral: [{ signal: "simple", text: "Simple room" }],
    negative: [{ signal: "noisy", text: "Too noisy" }],
  },
  CHICKEN: {
    positive: [{ signal: "crunchy", text: "Chicken was crunchy and juicy", product: "chicken" }],
    neutral: [{ signal: "ok", text: "Chicken was fine", product: "chicken" }],
    negative: [{ signal: "greasy", text: "Chicken was greasy", product: "chicken" }],
  },
};

type Profile = Partial<Record<Theme, { w: number; neg: number; neu: number; sev?: number }>>;

interface Spec {
  id: string; name: string; address: string; lat: number; lon: number;
  categories: string[]; food: FoodType; format: RestaurantFormat;
  rating: number; reviewCount: number; price: 1 | 2 | 3 | 4;
  open: string; close: string; profile?: Profile; seed: number;
  // V3 observable fields (fictional)
  weekendClose?: string; description?: string; attributes?: string[]; imagesCount?: number;
  phone?: string; website?: string; menuUrl?: string; priceKnown?: boolean;
}

const TARGET_ID = "demo-target";

const SPECS: Spec[] = [
  {
    id: TARGET_ID, name: "Maison Brasero", address: "14 rue Sainte, 13001 Marseille",
    lat: 43.2951, lon: 5.3745, categories: ["Burger restaurant", "Fast food", "Delivery"],
    food: "burger", format: "fast_food", rating: 4.4, reviewCount: 612, price: 2,
    open: "11:30", close: "22:00", seed: 11,
    description: "Burgers gourmet faits maison, viande halal, à emporter et en livraison.",
    attributes: ["Delivery", "Takeaway", "Halal food", "Dine-in"], imagesCount: 38, phone: "+33 4 00 00 00 00",
    profile: {
      BURGER: { w: 0.3, neg: 0.06, neu: 0.03 },
      TASTE: { w: 0.12, neg: 0.08, neu: 0.05 },
      FRIES: { w: 0.15, neg: 0.77, neu: 0.03, sev: 0.55 },
      PACKAGING: { w: 0.1, neg: 0.72, neu: 0.06, sev: 0.4 },
      WAITING_TIME: { w: 0.07, neg: 0.4, neu: 0.1 },
      PORTION: { w: 0.07, neg: 0.08, neu: 0.1 },
      VALUE_FOR_MONEY: { w: 0.06, neg: 0.25, neu: 0.3 },
      SERVICE: { w: 0.06, neg: 0.15, neu: 0.1 },
      DELIVERY_EXPERIENCE: { w: 0.05, neg: 0.6, neu: 0.1 },
      ORDER_ACCURACY: { w: 0.02, neg: 0.4, neu: 0.1 },
    },
  },
  {
    id: "demo-c1", name: "Smash District", address: "3 cours Julien, 13006 Marseille",
    lat: 43.2938, lon: 5.3799, categories: ["Burger restaurant", "Smash burger", "Late-night food"],
    food: "burger", format: "fast_food", rating: 4.5, reviewCount: 1284, price: 2,
    open: "11:30", close: "02:00", seed: 21,
    description: "Smash burgers et frites maison, ouvert tard.", attributes: ["Delivery", "Takeaway", "Late-night food"], imagesCount: 420,
    phone: "+33 4 00 00 00 01", website: "https://example.org/smash-district",
    profile: {
      BURGER: { w: 0.3, neg: 0.08, neu: 0.05 }, TASTE: { w: 0.12, neg: 0.08, neu: 0.05 },
      FRIES: { w: 0.12, neg: 0.2, neu: 0.1 }, PACKAGING: { w: 0.07, neg: 0.2, neu: 0.1 },
      WAITING_TIME: { w: 0.12, neg: 0.45, neu: 0.1 }, VALUE_FOR_MONEY: { w: 0.08, neg: 0.15, neu: 0.2 },
      DELIVERY_EXPERIENCE: { w: 0.08, neg: 0.15, neu: 0.1 }, SERVICE: { w: 0.06, neg: 0.2, neu: 0.1 },
      PRICE: { w: 0.05, neg: 0.3, neu: 0.2 },
    },
  },
  {
    id: "demo-c2", name: "Burger Lab 13", address: "27 rue Paradis, 13006 Marseille",
    lat: 43.2923, lon: 5.3768, categories: ["Burger restaurant", "Casual dining"],
    food: "burger", format: "casual_dining", rating: 4.2, reviewCount: 487, price: 2,
    open: "12:00", close: "23:00", seed: 31,
    profile: {
      BURGER: { w: 0.28, neg: 0.15, neu: 0.1 }, TASTE: { w: 0.1, neg: 0.15, neu: 0.1 },
      FRIES: { w: 0.12, neg: 0.35, neu: 0.1 }, SERVICE: { w: 0.1, neg: 0.3, neu: 0.1 },
      WAITING_TIME: { w: 0.1, neg: 0.5, neu: 0.1 }, VALUE_FOR_MONEY: { w: 0.1, neg: 0.35, neu: 0.2 },
      ATMOSPHERE: { w: 0.1, neg: 0.1, neu: 0.1 }, PORTION: { w: 0.1, neg: 0.2, neu: 0.1 },
    },
  },
  {
    id: "demo-c3", name: "Chez Tonton Grill", address: "9 rue Grignan, 13001 Marseille",
    lat: 43.2917, lon: 5.3722, categories: ["Burger restaurant", "Grill", "Casual dining"],
    food: "burger", format: "casual_dining", rating: 4.6, reviewCount: 311, price: 3,
    open: "12:00", close: "22:30", seed: 41,
    profile: {
      BURGER: { w: 0.32, neg: 0.04, neu: 0.04 }, TASTE: { w: 0.14, neg: 0.05, neu: 0.05 },
      SERVICE: { w: 0.14, neg: 0.08, neu: 0.1 }, ATMOSPHERE: { w: 0.12, neg: 0.05, neu: 0.1 },
      PRICE: { w: 0.1, neg: 0.5, neu: 0.2 }, VALUE_FOR_MONEY: { w: 0.1, neg: 0.3, neu: 0.2 },
      WAITING_TIME: { w: 0.08, neg: 0.35, neu: 0.1 },
    },
  },
  {
    id: "demo-c4", name: "Fried Republic", address: "41 boulevard Garibaldi, 13001 Marseille",
    lat: 43.2985, lon: 5.3801, categories: ["Fried chicken restaurant", "Fast food", "Late-night food"],
    food: "fried_chicken", format: "fast_food", rating: 4.0, reviewCount: 702, price: 1,
    open: "11:00", close: "01:00", seed: 51,
    profile: {
      CHICKEN: { w: 0.3, neg: 0.18, neu: 0.1 }, FRIES: { w: 0.15, neg: 0.3, neu: 0.1 },
      PRICE: { w: 0.15, neg: 0.05, neu: 0.1 }, VALUE_FOR_MONEY: { w: 0.15, neg: 0.08, neu: 0.1 },
      WAITING_TIME: { w: 0.1, neg: 0.35, neu: 0.1 }, SERVICE: { w: 0.08, neg: 0.35, neu: 0.1 },
      DELIVERY_EXPERIENCE: { w: 0.07, neg: 0.3, neu: 0.1 },
    },
  },
  {
    id: "demo-c5", name: "Tacos Canebière", address: "88 La Canebière, 13001 Marseille",
    lat: 43.2969, lon: 5.3769, categories: ["Tacos restaurant", "Fast food", "Late-night food"],
    food: "tacos", format: "fast_food", rating: 3.9, reviewCount: 1530, price: 1,
    open: "11:00", close: "03:00", seed: 61,
    profile: {
      TASTE: { w: 0.25, neg: 0.2, neu: 0.1 }, PORTION: { w: 0.2, neg: 0.05, neu: 0.1 },
      PRICE: { w: 0.15, neg: 0.05, neu: 0.1 }, WAITING_TIME: { w: 0.15, neg: 0.4, neu: 0.1 },
      SERVICE: { w: 0.1, neg: 0.4, neu: 0.1 }, CLEANLINESS: { w: 0.1, neg: 0.4, neu: 0.1 },
    },
  },
  {
    id: "demo-c6", name: "Smash Corner", address: "6 rue Glandevès, 13001 Marseille",
    lat: 43.2940, lon: 5.3760, categories: ["Hamburger restaurant"], food: "burger", format: "fast_food",
    rating: 5.0, reviewCount: 12, price: 2, open: "11:30", close: "23:00", weekendClose: "00:00", seed: 81,
    description: "Nouveau smash burger, halal.", attributes: ["Takeaway", "Delivery", "Halal food"], imagesCount: 9,
    profile: { BURGER: { w: 0.5, neg: 0, neu: 0.1 }, TASTE: { w: 0.3, neg: 0, neu: 0.1 }, SERVICE: { w: 0.2, neg: 0, neu: 0.1 } },
  },
  { id: "demo-n1", name: "Pizzeria Cacao", address: "5 place Thiars, 13001 Marseille", lat: 43.2932, lon: 5.3712, categories: ["Pizza restaurant"], food: "pizza", format: "casual_dining", rating: 4.3, reviewCount: 905, price: 2, open: "12:00", close: "23:30", seed: 71 },
  { id: "demo-n2", name: "Sushi Nami", address: "17 rue Saint-Saëns, 13001 Marseille", lat: 43.2941, lon: 5.3737, categories: ["Sushi restaurant"], food: "sushi", format: "casual_dining", rating: 4.1, reviewCount: 366, price: 3, open: "12:00", close: "22:00", seed: 72 },
  { id: "demo-n3", name: "La Table de Mathilde", address: "2 rue Fort-Notre-Dame, 13007 Marseille", lat: 43.2907, lon: 5.3742, categories: ["French restaurant", "Fine dining"], food: "bistro", format: "premium", rating: 4.7, reviewCount: 244, price: 4, open: "19:00", close: "23:00", seed: 73 },
  { id: "demo-n4", name: "Kebab du Prado", address: "120 avenue du Prado, 13008 Marseille", lat: 43.2889, lon: 5.3846, categories: ["Kebab shop", "Fast food"], food: "kebab", format: "fast_food", rating: 3.8, reviewCount: 410, price: 1, open: "11:00", close: "00:00", seed: 74 },
  { id: "demo-n5", name: "Café du Port", address: "6 quai de Rive Neuve, 13007 Marseille", lat: 43.2931, lon: 5.3698, categories: ["Coffee shop", "Brunch"], food: "coffee", format: "coffee", rating: 4.2, reviewCount: 520, price: 2, open: "07:30", close: "18:00", seed: 75 },
  { id: "demo-n6", name: "Boulangerie Saint-Victor", address: "11 rue Sainte, 13007 Marseille", lat: 43.2934, lon: 5.3731, categories: ["Bakery"], food: "bakery", format: "bakery", rating: 4.5, reviewCount: 198, price: 1, open: "06:30", close: "19:30", seed: 76 },
  { id: "demo-n7", name: "Bao Street", address: "33 rue Breteuil, 13006 Marseille", lat: 43.2899, lon: 5.3795, categories: ["Asian street food"], food: "asian_street", format: "fast_food", rating: 4.3, reviewCount: 275, price: 2, open: "11:30", close: "21:30", seed: 77 },
];

function genReviews(spec: Spec, count: number, nowMs: number): Review[] {
  if (!spec.profile || count <= 0) return [];
  const rnd = mulberry32(spec.seed);
  const totalMentions = Math.round(count * 1.6);
  const themes = Object.keys(spec.profile) as Theme[];
  const wSum = themes.reduce((s, t) => s + spec.profile![t]!.w, 0);

  // exact mention counts per theme and sentiment
  const mentions: ThemeMention[] = [];
  const phraseFor = new Map<ThemeMention, Phrase>();
  for (const t of themes) {
    const p = spec.profile[t]!;
    const n = Math.round((totalMentions * p.w) / wSum);
    const nNeg = Math.round(n * p.neg);
    const nNeu = Math.round(n * p.neu);
    const nPos = Math.max(0, n - nNeg - nNeu);
    const plan: [Sentiment, number][] = [["negative", nNeg], ["neutral", nNeu], ["positive", nPos]];
    for (const [sentiment, k] of plan) {
      const bank = BANK[t]?.[sentiment] ?? [];
      for (let i = 0; i < k; i++) {
        const phrase = bank.length ? bank[Math.floor(rnd() * bank.length)] : { signal: sentiment, text: `${t.toLowerCase().replace(/_/g, " ")}: ${sentiment}` };
        const severity: Severity =
          sentiment !== "negative" ? "low" : rnd() < (p.sev ?? 0.2) ? "high" : rnd() < 0.5 ? "medium" : "low";
        const m: ThemeMention = { theme: t, sentiment, severity, product: phrase.product, reason: phrase.signal };
        mentions.push(m);
        phraseFor.set(m, phrase);
      }
    }
  }

  const pool = shuffle(mentions, rnd);
  const reviews: Review[] = [];
  let i = 0;
  let idx = 0;
  while (i < pool.length && reviews.length < count) {
    const remainingReviews = count - reviews.length;
    const remainingMentions = pool.length - i;
    const take = Math.min(3, Math.max(1, Math.round(remainingMentions / remainingReviews)));
    const group = pool.slice(i, i + take);
    i += take;
    const neg = group.filter((m) => m.sentiment === "negative").length;
    const pos = group.filter((m) => m.sentiment === "positive").length;
    const rating = Math.max(1, Math.min(5, Math.round(3 + (pos - neg * 1.4) * 1.1 + (rnd() - 0.5))));
    const daysAgo = Math.floor(rnd() * 365);
    reviews.push({
      id: `${spec.id}-r${idx++}`,
      text: group.map((m) => phraseFor.get(m)!.text).join(". ") + ".",
      rating,
      date: new Date(nowMs - daysAgo * 86400000).toISOString(),
      source: "demo",
      mentions: group,
    });
  }
  return reviews;
}

export interface DemoMarket {
  target: Restaurant;
  nearby: Restaurant[];
  retrievedAt: string;
  targetRanks?: { query: string; rank: number }[];
}

export function buildDemoMarket(limits: { target: number; competitor: number }, nowMs = Date.now()): DemoMarket {
  const retrievedAt = new Date(nowMs).toISOString();
  const all: Restaurant[] = SPECS.map((s) => ({
    id: s.id, name: s.name, address: s.address, latitude: s.lat, longitude: s.lon,
    categories: s.categories, primaryFoodType: s.food, format: s.format,
    rating: s.rating, reviewCount: s.reviewCount, priceLevel: s.price,
    openingHours: { open: s.open, close: s.close },
    weeklyHours: [0, 1, 2, 3, 4, 5, 6].map((day) => ({ day, open: s.open, close: day >= 4 && day <= 5 && s.weekendClose ? s.weekendClose : s.close })),
    source: { provider: "demo", retrievedAt, attribution: "Fictional demo data" },
    reviews: genReviews(s, Math.min(s.reviewCount, s.id === TARGET_ID ? limits.target : limits.competitor), nowMs),
    priceKnown: s.priceKnown ?? true,
    description: s.description, attributes: s.attributes, imagesCount: s.imagesCount,
    phone: s.phone, website: s.website, menuUrl: s.menuUrl,
  }));
  return {
    target: all.find((r) => r.id === TARGET_ID)!, nearby: all.filter((r) => r.id !== TARGET_ID), retrievedAt,
    targetRanks: [{ query: "burger", rank: 4 }, { query: "fast food", rank: 11 }],
  };
}
