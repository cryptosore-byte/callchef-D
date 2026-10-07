// Food type detection V3: all observable signals, a normalized taxonomy, a confidence and the evidence.
// Deterministic. Never relies on the Google primary category alone; never trusts a LOW-confidence guess silently.
import { CONFIG } from "@/config";
import type { CuisineModifier, CuisineType, FoodProfile, FoodType, Level3, Restaurant, Signal } from "@/types";
import { interval } from "@/lib/util";

type Rule = { type: CuisineType; re: RegExp };
// Order matters only for ties: more specific types first.
const RULES: Rule[] = [
  { type: "SMASH_BURGER", re: /smash/i },
  { type: "GOURMET_BURGER", re: /gourmet|burger (?:artisanal|maison)|artisan(?:al)? burger|burgers? fait(?:s)? maison|premium burger|craft burger/i },
  { type: "BURGER", re: /burger|hamburger/i },
  { type: "FRIED_CHICKEN", re: /fried chicken|poulet frit|chicken wings|tenders|crispy chicken/i },
  { type: "CHICKEN", re: /chicken|poulet|rotisserie|rôtisserie/i },
  { type: "KEBAB", re: /kebab|d[oö]ner|gyros?\b|shawarma|grec\b|turkish|turc/i },
  { type: "TACOS_FR", re: /tacos|french tacos|o'tacos/i },
  { type: "PIZZA", re: /pizz/i },
  { type: "POKE", re: /pok[eé]/i },
  { type: "SUSHI", re: /sushi|maki|california roll/i },
  { type: "JAPANESE", re: /japan|japonais|ramen|izakaya|udon/i },
  { type: "THAI", re: /\bthai|tha[iï]landais/i },
  { type: "VIETNAMESE", re: /vietnam|\bpho\b|banh mi|bo bun/i },
  { type: "PAKISTANI", re: /pakistan/i },
  { type: "INDIAN", re: /indian|indien|curry|tandoori|naan/i },
  { type: "LEBANESE", re: /leban|liban/i },
  { type: "MEDITERRANEAN", re: /mediterran|méditerran|greek|grecque/i },
  { type: "HEALTHY", re: /healthy|salad bar|bowl|salades?\b/i },
  { type: "BRUNCH", re: /brunch/i },
  { type: "BAKERY", re: /bakery|boulangerie|p[âa]tisserie/i },
  { type: "DESSERT", re: /dessert|ice cream|glacier|cr[êe]pe|gaufre|waffle/i },
  { type: "COFFEE", re: /coffee|caf[ée]\b|espresso|tea room|salon de th[ée]/i },
  { type: "FINE_DINING", re: /fine dining|gastronom|étoilé|michelin/i },
  { type: "STREET_FOOD", re: /street food|food truck|snack\b|sandwich/i },
  { type: "CASUAL_DINING", re: /brasserie|bistro|french restaurant|restaurant français|traditionnel/i },
];

/** Generic parent used as `secondary` and for similarity families. */
export const PARENT: Partial<Record<CuisineType, CuisineType>> = {
  SMASH_BURGER: "BURGER", GOURMET_BURGER: "BURGER", FRIED_CHICKEN: "CHICKEN", SUSHI: "JAPANESE", POKE: "HEALTHY", PAKISTANI: "INDIAN",
};

/** Coarse legacy food type, still used for search keywords and the battle mode. */
export const COARSE: Record<CuisineType, FoodType> = {
  BURGER: "burger", SMASH_BURGER: "burger", GOURMET_BURGER: "burger", FRIED_CHICKEN: "fried_chicken", CHICKEN: "fried_chicken",
  KEBAB: "kebab", TACOS_FR: "tacos", PIZZA: "pizza", SUSHI: "sushi", JAPANESE: "sushi", THAI: "asian_street", VIETNAMESE: "asian_street",
  INDIAN: "asian_street", PAKISTANI: "asian_street", LEBANESE: "other", MEDITERRANEAN: "bistro", HEALTHY: "other", POKE: "other",
  BRUNCH: "coffee", BAKERY: "bakery", DESSERT: "dessert", COFFEE: "coffee", CASUAL_DINING: "bistro", FINE_DINING: "bistro",
  STREET_FOOD: "other", OTHER: "other",
};

// Evidence weights per source (sum of agreeing sources = raw score, capped at 1).
const W: Record<Signal["source"], number> = { category: 0.5, name: 0.3, description: 0.15, attributes: 0.1, reviews: 0.25, website: 0.1, price: 0.1, hours: 0.1 };
const MIN_REVIEW_SHARE = 0.08; // a cuisine word must appear in >= 8% of reviews to count as review evidence

const levelOf = (c: number): Level3 => (c >= CONFIG.foodType.high ? "HIGH" : c >= CONFIG.foodType.medium ? "MEDIUM" : "LOW");

function reviewShare(r: Restaurant, re: RegExp): number {
  if (!r.reviews.length) return 0;
  return r.reviews.filter((x) => re.test(x.text)).length / r.reviews.length;
}

function scoreTypes(r: Restaurant) {
  const scores = new Map<CuisineType, { score: number; evidence: Signal[] }>();
  const add = (type: CuisineType, source: Signal["source"], text: string, weight = W[source]) => {
    const cur = scores.get(type) ?? { score: 0, evidence: [] };
    if (cur.evidence.some((e) => e.source === source)) return; // one vote per source
    cur.score += weight; cur.evidence.push({ source, text });
    scores.set(type, cur);
  };
  for (const rule of RULES) {
    const cat = r.categories.find((c) => rule.re.test(c));
    if (cat) add(rule.type, "category", cat);
    if (rule.re.test(r.name)) add(rule.type, "name", r.name);
    if (r.description && rule.re.test(r.description)) add(rule.type, "description", r.description.slice(0, 120));
    const share = reviewShare(r, rule.re);
    if (share >= MIN_REVIEW_SHARE) add(rule.type, "reviews", `${Math.round(share * 100)}% of ${r.reviews.length} reviews`, W.reviews * Math.min(1, share / 0.3));
  }
  // Price is a weak positioning signal for gourmet vs regular burger, only when known.
  if (r.priceKnown !== false && r.priceLevel >= 3 && [...scores.keys()].some((k) => k === "BURGER" || k === "GOURMET_BURGER")) {
    add("GOURMET_BURGER", "price", "€".repeat(r.priceLevel));
  }
  return scores;
}

function detectModifiers(r: Restaurant, primary: CuisineType): FoodProfile["modifiers"] {
  const out: FoodProfile["modifiers"] = [];
  const attrs = r.attributes ?? [];
  const text = [r.name, r.description ?? "", ...r.categories].join(" | ");
  const add = (key: CuisineModifier, evidence: Signal[]) => { if (evidence.length) out.push({ key, evidence }); };
  const attr = (re: RegExp) => attrs.filter((a) => re.test(a)).map((a) => ({ source: "attributes" as const, text: a }));
  const inText = (re: RegExp, source: Signal["source"] = "description") => (re.test(text) ? [{ source, text: (text.match(re) ?? [""])[0] }] : []);
  const inReviews = (re: RegExp, min = 2) => {
    const n = r.reviews.filter((x) => re.test(x.text)).length;
    return n >= min ? [{ source: "reviews" as const, text: `${n} reviews` }] : [];
  };
  add("HALAL", [...attr(/halal/i), ...inText(/halal/i), ...inReviews(/halal/i)]);
  add("VEGAN", [...inText(/\bvegan|végan/i), ...attr(/^vegan/i)]);
  add("VEGETARIAN", [...inText(/v[ée]g[ée]tarien|vegetarian/i)]);
  const priceKnown = r.priceKnown !== false;
  add("PREMIUM", [...(priceKnown && r.priceLevel >= 3 ? [{ source: "price" as const, text: "€".repeat(r.priceLevel) }] : []), ...inText(/gourmet|premium|artisan|haut de gamme/i), ...(primary === "GOURMET_BURGER" || primary === "FINE_DINING" ? [{ source: "category" as const, text: primary }] : [])]);
  add("VALUE", [...(priceKnown && r.priceLevel === 1 ? [{ source: "price" as const, text: "€" }] : []), ...inReviews(/pas cher|petit prix|cheap|bon march/i, 3)]);
  add("FAST_FOOD", inText(/fast food|restauration rapide/i, "category"));
  add("FAST_CASUAL", [...inText(/fast casual|counter service/i, "category"), ...(primary === "GOURMET_BURGER" || primary === "SMASH_BURGER" || primary === "POKE" ? [{ source: "category" as const, text: primary }] : [])]);
  const late = r.openingHours ? interval(r.openingHours.open, r.openingHours.close)[1] >= 24 * 60 : false;
  add("LATE_NIGHT", [...(late ? [{ source: "hours" as const, text: `→ ${r.openingHours!.close}` }] : []), ...inText(/late.night|nocturne/i, "category")]);
  const deliveryReviews = r.reviews.length ? r.reviews.filter((x) => /livr|deliver|uber|deliveroo/i.test(x.text)).length / r.reviews.length : 0;
  add("DELIVERY_FOCUSED", [...(deliveryReviews >= 0.15 ? [{ source: "reviews" as const, text: `${Math.round(deliveryReviews * 100)}% of reviews mention delivery` }] : []), ...inText(/dark kitchen|delivery only|livraison uniquement/i, "category")]);
  add("FAMILY", attr(/good for kids|kids|enfants|family|famille/i));
  add("TRENDY", attr(/trendy|tendance/i));
  return out;
}

/** Detect the normalized food profile of a restaurant. */
export function detectFoodType(r: Restaurant): FoodProfile {
  const scores = scoreTypes(r);
  // A specific subtype inherits the evidence of its parent (a "smash" place found via "Burger restaurant" is a burger place).
  for (const [type, v] of scores) {
    const parent = PARENT[type];
    const p = parent && scores.get(parent);
    if (p) for (const e of p.evidence) if (!v.evidence.some((x) => x.source === e.source)) { v.score += W[e.source] * 0.8; v.evidence.push(e); }
  }
  const ranked = [...scores.entries()].sort((a, b) => b[1].score - a[1].score);
  if (!ranked.length) return { primary: "OTHER", modifiers: detectModifiers(r, "OTHER"), confidence: 0, level: "LOW", evidence: [] };
  // A subtype with its OWN direct evidence (not only inherited) is more precise than its parent: promote it.
  const direct = (t: CuisineType) => (scores.get(t)?.evidence ?? []).filter((e) => !(scores.get(PARENT[t]!)?.evidence ?? []).includes(e));
  const child = ranked.find(([t]) => PARENT[t] === ranked[0][0] && direct(t).length > 0);
  if (child) ranked.splice(ranked.indexOf(child), 1), ranked.unshift(child);
  const [primary, best] = ranked[0];
  // Competing unrelated families lower the confidence.
  const rival = ranked.find(([t]) => t !== primary && PARENT[t] !== primary && PARENT[primary] !== t);
  const confidence = Math.min(1, best.score) * (rival ? 1 - 0.4 * Math.min(1, rival[1].score / best.score) : 1);
  const secondary = PARENT[primary] ?? ranked.find(([t]) => t !== primary && PARENT[t] !== primary)?.[0];
  return {
    primary, secondary, modifiers: detectModifiers(r, primary),
    confidence: Number(confidence.toFixed(2)), level: levelOf(confidence), evidence: best.evidence,
  };
}

/** Attach the profile and align the coarse legacy type when the detection is trustworthy. */
export function withFoodProfile(r: Restaurant): Restaurant {
  const foodProfile = detectFoodType(r);
  const primaryFoodType = foodProfile.level !== "LOW" ? COARSE[foodProfile.primary] : r.primaryFoodType;
  return { ...r, foodProfile, primaryFoodType };
}

// ---- similarity -------------------------------------------------------------------
const FAMILY_PAIRS: [CuisineType, CuisineType, number][] = [
  ["BURGER", "FRIED_CHICKEN", 0.55], ["BURGER", "CHICKEN", 0.5], ["BURGER", "TACOS_FR", 0.5], ["BURGER", "KEBAB", 0.45],
  ["BURGER", "STREET_FOOD", 0.5], ["BURGER", "PIZZA", 0.3], ["KEBAB", "TACOS_FR", 0.6], ["FRIED_CHICKEN", "TACOS_FR", 0.5],
  ["FRIED_CHICKEN", "KEBAB", 0.5], ["PIZZA", "KEBAB", 0.35], ["PIZZA", "TACOS_FR", 0.35], ["JAPANESE", "THAI", 0.4],
  ["JAPANESE", "VIETNAMESE", 0.4], ["THAI", "VIETNAMESE", 0.6], ["INDIAN", "LEBANESE", 0.3], ["LEBANESE", "MEDITERRANEAN", 0.6],
  ["HEALTHY", "JAPANESE", 0.3], ["BRUNCH", "COFFEE", 0.6], ["COFFEE", "BAKERY", 0.5], ["BAKERY", "DESSERT", 0.5],
  ["COFFEE", "DESSERT", 0.4], ["CASUAL_DINING", "MEDITERRANEAN", 0.4], ["CASUAL_DINING", "FINE_DINING", 0.4], ["STREET_FOOD", "KEBAB", 0.5],
];
const root = (t: CuisineType) => PARENT[t] ?? t;

/** 0..1. Same subtype = 1, same family (smash vs gourmet burger) = 0.85, related families per table, else 0.1. */
export function cuisineSimilarity(a: CuisineType, b: CuisineType): number {
  if (a === b) return 1;
  const ra = root(a), rb = root(b);
  if (ra === rb) return 0.85;
  const hit = FAMILY_PAIRS.find(([x, y]) => (x === ra && y === rb) || (x === rb && y === ra));
  return hit ? hit[2] : 0.1;
}

/** Customer-occasion similarity from modifiers (late night, delivery, fast food, family, premium). 0..1, 0.5 when unknown. */
const OCCASION: CuisineModifier[] = ["LATE_NIGHT", "DELIVERY_FOCUSED", "FAST_FOOD", "FAST_CASUAL", "FAMILY", "PREMIUM", "VALUE"];
export function occasionSimilarity(a?: FoodProfile, b?: FoodProfile): number {
  if (!a || !b) return 0.5;
  const A = new Set(a.modifiers.map((m) => m.key).filter((k) => OCCASION.includes(k)));
  const B = new Set(b.modifiers.map((m) => m.key).filter((k) => OCCASION.includes(k)));
  if (!A.size && !B.size) return 0.5;
  const inter = [...A].filter((x) => B.has(x)).length;
  return inter / (A.size + B.size - inter);
}

/** Regex that recognises the detected cuisine in free text (site audit, category check). */
export function cuisineRegex(type: CuisineType): RegExp | null {
  const own = RULES.find((r) => r.type === type)?.re;
  const parent = PARENT[type] && RULES.find((r) => r.type === PARENT[type])?.re;
  const rs = [own, parent].filter(Boolean) as RegExp[];
  return rs.length ? new RegExp(rs.map((r) => r.source).join("|"), "i") : null;
}

const QUERY_WORD: Partial<Record<CuisineType, string>> = {
  BURGER: "burger", SMASH_BURGER: "smash burger", GOURMET_BURGER: "burger gourmet", FRIED_CHICKEN: "fried chicken", CHICKEN: "poulet",
  KEBAB: "kebab", TACOS_FR: "tacos", PIZZA: "pizzeria", SUSHI: "sushi", JAPANESE: "restaurant japonais", THAI: "restaurant thai",
  VIETNAMESE: "restaurant vietnamien", INDIAN: "restaurant indien", PAKISTANI: "restaurant pakistanais", LEBANESE: "restaurant libanais",
  MEDITERRANEAN: "restaurant méditerranéen", HEALTHY: "healthy", POKE: "poke bowl", BRUNCH: "brunch", BAKERY: "boulangerie",
  DESSERT: "dessert", COFFEE: "coffee shop", FINE_DINING: "restaurant gastronomique", STREET_FOOD: "street food",
};
const MOD_WORD: Partial<Record<CuisineModifier, string>> = { HALAL: "halal", VEGAN: "vegan", VEGETARIAN: "végétarien" };

/**
 * Local search queries derived from the detected profile (max 3), e.g. "burger", "burger gourmet", "burger halal".
 * Only built from MEDIUM/HIGH detections, so we never search irrelevant keywords. The area comes from the geolocation.
 */
export function searchQueries(p?: FoodProfile): string[] {
  if (!p || p.level === "LOW") return [];
  const base = QUERY_WORD[PARENT[p.primary] ?? p.primary];
  const specific = PARENT[p.primary] ? QUERY_WORD[p.primary] : undefined;
  const mod = p.modifiers.map((m) => MOD_WORD[m.key]).find(Boolean);
  return [base, specific, base && mod ? `${base} ${mod}` : undefined].filter((x): x is string => !!x).slice(0, 3);
}
