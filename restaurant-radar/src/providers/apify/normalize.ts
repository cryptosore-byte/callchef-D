// ALL actor-specific OUTPUT parsing lives here. The rest of the app only sees our own Restaurant type.
import type { DayHours, FoodType, OpeningHours, Restaurant, RestaurantFormat, Review } from "@/types";

/* eslint-disable @typescript-eslint/no-explicit-any */
type Raw = Record<string, any>;

const str = (v: unknown) => (typeof v === "string" && v.trim() ? v.trim() : undefined);
const num = (v: unknown) => {
  if (typeof v === "number" && isFinite(v)) return v;
  if (typeof v === "string") { const n = Number(v.replace(",", ".")); if (isFinite(n)) return n; }
  return undefined;
};

// ---- food type / format ----------------------------------------------------
const FOOD_PATTERNS: [FoodType, RegExp][] = [
  ["burger", /burger/i], ["pizza", /pizz/i], ["sushi", /sushi|japanese|japonais/i],
  ["kebab", /kebab|d[oö]ner|gyro|shawarma|turkish|grec/i], ["fried_chicken", /fried chicken|chicken|poulet/i],
  ["tacos", /taco|mexican|mexicain/i], ["asian_street", /asian|indian|indien|thai|vietnam|chinese|chinois|ramen|noodle|bao|korean|cor[ée]en/i],
  ["bakery", /bakery|boulangerie|p[âa]tisserie/i], ["dessert", /dessert|ice cream|glacier|cr[êe]p|pastry/i],
  ["coffee", /coffee|caf[ée]|tea room|brunch/i], ["bistro", /bistro|french|brasserie|fine dining|gastronom|seafood|mediterranean|italian|steak/i],
];
export function foodTypeFrom(categories: string[], name = ""): FoodType {
  for (const c of categories) for (const [t, re] of FOOD_PATTERNS) if (re.test(c)) return t;
  // Google often only says "Restaurant": fall back to the name ("MBURGERS", "La Casa del Burger")
  for (const [t, re] of FOOD_PATTERNS) if (re.test(name)) return t;
  return "other";
}

const NON_FOOD = /supermarket|gas station|fuel|grocery|convenience store|general store|cosmetics|beverage distributor|janitorial|tobacco shop$/i;
/** False for supermarkets, petrol stations... that Google also tags with a "fast food" category. */
export const isFoodPlace = (categories: string[]) => !categories.some((c) => NON_FOOD.test(c));
export function formatFrom(food: FoodType, categories: string[], price: number): RestaurantFormat {
  if (food === "bakery") return "bakery";
  if (food === "coffee") return "coffee";
  if (food === "dessert") return "dessert";
  const joined = categories.join(" ");
  if (price >= 4 || /fine dining|gastronom/i.test(joined)) return "premium";
  if (/fast food|takeaway|take-out|delivery|snack|sandwich/i.test(joined) || (["burger", "kebab", "tacos", "fried_chicken"].includes(food) && price <= 2)) return "fast_food";
  return "casual_dining";
}

// ---- price ------------------------------------------------------------------
export function priceLevelFrom(raw: Raw): 1 | 2 | 3 | 4 {
  const p = raw.price ?? raw.priceLevel;
  if (typeof p === "number" && p >= 1 && p <= 4) return Math.round(p) as 1 | 2 | 3 | 4;
  const s = str(p);
  if (!s) return 2;
  if (/^[€$£]{1,4}$/.test(s)) return s.length as 1 | 2 | 3 | 4;
  const nums = (s.match(/\d+(?:[.,]\d+)?/g) ?? []).map((x) => Number(x.replace(",", ".")));
  if (!nums.length) return 2;
  const avg = nums.reduce((a, b) => a + b, 0) / nums.length;
  // Google convention: $ < 10, $$ ~ 10-20, $$$ ~ 20-30, $$$$ 30+
  return avg < 10 ? 1 : avg < 20 ? 2 : avg < 30 ? 3 : 4;
}

// ---- opening hours ----------------------------------------------------------
const TIME_RE = /(\d{1,2})(?:[:h.](\d{2}))?\s*(am|pm)?/gi;
const to24 = (h: number, m: number, mer?: string) => {
  let hh = h;
  if (mer === "pm" && h < 12) hh += 12;
  if (mer === "am" && h === 12) hh = 0;
  return `${String(hh % 24).padStart(2, "0")}:${String(m).padStart(2, "0")}`;
};

/** "11 AM to 10 PM" | "11:30 AM to 2 AM" | "11:30-22:00" | "Open 24 hours". Split shifts -> first open, last close. */
export function parseHoursRange(s: string): OpeningHours | null {
  const t = s.toLowerCase();
  if (/closed|ferm/.test(t) && !/\d/.test(t)) return null;
  if (/24 hours|24h|24\/7|ouvert 24/.test(t)) return { open: "00:00", close: "00:00" };
  const shifts = t.split(/,|;/).map((part) => {
    const m = [...part.matchAll(TIME_RE)];
    if (m.length < 2) return null;
    const [a, b] = m;
    const h1 = Number(a[1]), h2 = Number(b[1]);
    let mer1 = a[3]?.toLowerCase(), mer2 = b[3]?.toLowerCase();
    if (!mer1 && mer2) mer1 = h1 <= h2 || h1 === 12 ? mer2 : mer2 === "pm" ? "am" : "pm";
    return { open: to24(h1, Number(a[2] ?? 0), mer1), close: to24(h2, Number(b[2] ?? 0), mer2) };
  }).filter(Boolean) as OpeningHours[];
  if (!shifts.length) return null;
  return { open: shifts[0].open, close: shifts[shifts.length - 1].close };
}

export function openingHoursFrom(raw: unknown): OpeningHours | undefined {
  if (!Array.isArray(raw)) return undefined;
  const counts = new Map<string, { n: number; h: OpeningHours }>();
  for (const e of raw) {
    const text = typeof e === "string" ? e : str((e as Raw)?.hours);
    const h = text ? parseHoursRange(text) : null;
    if (!h) continue;
    const k = `${h.open}-${h.close}`;
    counts.set(k, { n: (counts.get(k)?.n ?? 0) + 1, h });
  }
  return [...counts.values()].sort((a, b) => b.n - a.n)[0]?.h;
}

const DAYS: Record<string, number> = {
  monday: 0, tuesday: 1, wednesday: 2, thursday: 3, friday: 4, saturday: 5, sunday: 6,
  lundi: 0, mardi: 1, mercredi: 2, jeudi: 3, vendredi: 4, samedi: 5, dimanche: 6,
};
/** Per-day hours, so weekend closing times can be compared. Closed days are omitted. */
export function weeklyHoursFrom(raw: unknown): DayHours[] | undefined {
  if (!Array.isArray(raw)) return undefined;
  const out: DayHours[] = [];
  for (const e of raw) {
    const day = DAYS[(str((e as Raw)?.day) ?? "").toLowerCase()];
    const text = str((e as Raw)?.hours);
    const h = day !== undefined && text ? parseHoursRange(text) : null;
    if (h && day !== undefined) out.push({ day, ...h });
  }
  return out.length ? out.sort((a, b) => a.day - b.day) : undefined;
}

/** True flags of Google's "additional info" block: { "Offerings": [{ "Halal food": true }], ... }. */
export function attributesFrom(raw: unknown): string[] | undefined {
  if (!raw || typeof raw !== "object") return undefined;
  const out: string[] = [];
  for (const group of Object.values(raw as Raw)) {
    if (!Array.isArray(group)) continue;
    for (const item of group) if (item && typeof item === "object") for (const [k, v] of Object.entries(item)) if (v === true) out.push(k);
  }
  return out.length ? out : undefined;
}

const hasPrice = (raw: Raw) => {
  const p = raw.price ?? raw.priceLevel;
  return (typeof p === "number" && p >= 1 && p <= 4) || !!(str(p) && /[€$£]|\d/.test(str(p)!));
};

// ---- reviews ----------------------------------------------------------------
export function normalizeReviews(raw: unknown, restaurantId: string, max: number, nowIso: string): Review[] {
  if (!Array.isArray(raw)) return [];
  const out: Review[] = [];
  for (const r of raw as Raw[]) {
    const text = str(r.text) ?? str(r.textTranslated);
    if (!text) continue;
    out.push({
      id: str(r.reviewId) ?? `${restaurantId}-r${out.length}`,
      text,
      rating: num(r.stars) ?? num(r.rating) ?? 3,
      date: str(r.publishedAtDate) ?? str(r.publishAt) ?? nowIso,
      authorName: undefined, // not stored: no unnecessary personal data
      source: "apify:google-maps",
    });
    if (out.length >= max) break;
  }
  return out;
}

// ---- place ------------------------------------------------------------------
export function normalizePlace(raw: Raw, retrievedAt: string, maxReviews = 0): Restaurant | null {
  const name = str(raw.title) ?? str(raw.name);
  const latitude = num(raw.location?.lat) ?? num(raw.latitude);
  const longitude = num(raw.location?.lng) ?? num(raw.location?.lon) ?? num(raw.longitude);
  if (!name || latitude === undefined || longitude === undefined) return null;

  const categories = Array.isArray(raw.categories) ? raw.categories.filter((c: unknown) => typeof c === "string") as string[] : [];
  const cn = str(raw.categoryName);
  if (cn && !categories.includes(cn)) categories.unshift(cn);

  const id = str(raw.placeId) ?? str(raw.cid) ?? str(raw.url) ?? `${name}|${str(raw.address) ?? ""}`;
  const priceLevel = priceLevelFrom(raw);
  const primaryFoodType = foodTypeFrom(categories, name);
  const reviews = normalizeReviews(raw.reviews, id, maxReviews, retrievedAt);

  return {
    id, name, address: str(raw.address) ?? [raw.street, raw.city].filter(Boolean).join(", "),
    latitude, longitude, categories, primaryFoodType,
    format: formatFrom(primaryFoodType, categories, priceLevel),
    rating: num(raw.totalScore) ?? num(raw.rating) ?? 0,
    reviewCount: num(raw.reviewsCount) ?? num(raw.reviewCount) ?? reviews.length,
    priceLevel, openingHours: openingHoursFrom(raw.openingHours), website: str(raw.website),
    source: { provider: "apify:google-maps", retrievedAt, url: str(raw.url), attribution: "Google Maps (via Apify)" },
    reviews,
    priceKnown: hasPrice(raw),
    description: str(raw.description),
    attributes: attributesFrom(raw.additionalInfo),
    phone: str(raw.phone) ?? str(raw.phoneUnformatted),
    menuUrl: str(raw.menu) ?? str(raw.menuUrl),
    imagesCount: num(raw.imagesCount),
    weeklyHours: weeklyHoursFrom(raw.openingHours),
    searchRanks: str(raw.searchString) && num(raw.rank) ? [{ query: str(raw.searchString)!, rank: num(raw.rank)! }] : undefined,
  };
}

// ---- name matching ------------------------------------------------------------
const tokens = (s: string) => new Set(s.normalize("NFD").replace(/\p{M}/gu, "").toLowerCase().split(/[^a-z0-9]+/).filter(Boolean));
export function nameSimilarity(a: string, b: string): number {
  const A = tokens(a), B = tokens(b);
  const inter = [...A].filter((x) => B.has(x)).length;
  return inter / (A.size + B.size - inter || 1);
}

/** Search terms used to find restaurants that compete with this one (same cuisine / same format). */
export function competitorKeywords(food: FoodType, format: RestaurantFormat, profileQueries: string[] = []): string[] {
  // V3: queries from the detected profile ("burger", "burger gourmet", "burger halal") double as local search tests.
  if (profileQueries.length) return profileQueries;
  const byFood: Partial<Record<FoodType, string>> = {
    burger: "burger", pizza: "pizzeria", sushi: "sushi", kebab: "kebab", fried_chicken: "fried chicken", tacos: "tacos",
    asian_street: "asian food", bakery: "boulangerie", coffee: "coffee shop", dessert: "dessert",
  };
  const out: string[] = [];
  if (byFood[food]) out.push(byFood[food]!);
  if (format === "fast_food") out.push("fast food");
  return out;
}
