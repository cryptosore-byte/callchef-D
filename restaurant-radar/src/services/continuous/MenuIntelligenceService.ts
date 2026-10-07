// Optional menu intelligence. Runs on deep scan, monthly, or on request; skipped when the menu fingerprint is unchanged.
// Compares NORMALIZED comparable items only (a premium double burger is not compared to a basic cheeseburger).
import { hash } from "@/lib/store";

export type MenuCategory = "MAIN" | "SIDE" | "DRINK" | "DESSERT" | "BUNDLE";
export type MainTier = "BASIC" | "STANDARD" | "PREMIUM";
export interface MenuItem { name: string; price: number; category: MenuCategory; tier?: MainTier; vegetarian?: boolean; hero?: boolean; }
export interface Menu { placeId: string; name: string; items: MenuItem[]; source: string; retrievedAt: string; }

export interface MenuInsight { code: string; params: Record<string, string | number>; supports: string[]; }

export const menuFingerprint = (m: Menu) => hash(m.items.map((i) => `${i.name}|${i.price}|${i.category}`).sort().join(";"));

const median = (xs: number[]) => { const s = [...xs].sort((a, b) => a - b); return s.length ? (s.length % 2 ? s[(s.length - 1) / 2] : (s[s.length / 2 - 1] + s[s.length / 2]) / 2) : NaN; };
const mainsOf = (m: Menu, tier: MainTier) => m.items.filter((i) => i.category === "MAIN" && (i.tier ?? "STANDARD") === tier);
const cheapestBundle = (m: Menu) => Math.min(...m.items.filter((i) => i.category === "BUNDLE").map((i) => i.price));

/** At most 3 insights, each with the decision options it supports. Needs the target menu and >= 2 competitor menus. */
export function menuInsights(target: Menu | undefined, competitors: Menu[], bundleThreshold = 20): MenuInsight[] {
  if (!target || competitors.length < 2) return [];
  const out: MenuInsight[] = [];
  // 1. Complete meal under a threshold
  const withBundle = competitors.filter((c) => cheapestBundle(c) < bundleThreshold);
  if (withBundle.length >= Math.ceil(competitors.length / 2) && !(cheapestBundle(target) < bundleThreshold)) {
    out.push({ code: "menu.bundleGap", params: { n: withBundle.length, total: competitors.length, p: bundleThreshold }, supports: ["MENU:TEST_VALUE_BUNDLE"] });
  }
  // 2. Menu complexity vs the median competitor
  const sizes = competitors.map((c) => c.items.length);
  const med = median(sizes);
  if (target.items.length >= 1.6 * med && target.items.length - med >= 10) out.push({ code: "menu.tooLong", params: { a: target.items.length, b: Math.round(med) }, supports: ["MENU:SIMPLIFY_MENU"] });
  // 3. Hero products: competitors flag signature items, the target does not
  const heroes = competitors.filter((c) => c.items.some((i) => i.hero)).length;
  if (heroes >= Math.ceil(competitors.length / 2) && !target.items.some((i) => i.hero)) out.push({ code: "menu.noHero", params: { n: heroes, total: competitors.length }, supports: ["MENU:PROMOTE_HERO_PRODUCT"] });
  // Price comparison only like-for-like (same tier), as a supporting fact
  for (const tier of ["STANDARD", "PREMIUM"] as MainTier[]) {
    const mine = median(mainsOf(target, tier).map((i) => i.price));
    const theirs = median(competitors.flatMap((c) => mainsOf(c, tier)).map((i) => i.price));
    if (isFinite(mine) && isFinite(theirs) && mine - theirs >= 2 && out.length < 3) out.push({ code: "menu.pricier", params: { tier, a: mine.toFixed(2), b: theirs.toFixed(2) }, supports: [] });
  }
  return out.slice(0, 3);
}
