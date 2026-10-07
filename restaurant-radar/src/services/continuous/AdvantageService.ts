// Unfair advantage (one defensible strength backed by several signals) and expectation gap
// (what the restaurant promises vs what customers actually talk about). Both say nothing without evidence.
import type { Restaurant, ReviewSummary } from "@/types";
import type { Evidence } from "@/services/EvidenceService";
import type { DigitalHealth } from "@/services/DigitalHealthRunner";

export type AdvantageKey = "PORTIONS" | "FOOD" | "SERVICE" | "VALUE" | "LATE_OPENING" | "HALAL" | "REPUTATION" | "SOCIAL";
export type Channel = "google" | "website" | "instagram";
export interface Advantage {
  key: AdvantageKey;
  evidenceIds: string[];
  /** true = mentioned, false = not mentioned, null = channel not readable (no claim). */
  channels: Record<Channel, boolean | null>;
  insight: "invisible" | "partlyVisible" | "visible";
}

const WORDS: Record<AdvantageKey, RegExp> = {
  PORTIONS: /portion|copieu|généreu|genereu|generous|xxl|gros(?:ses)? part/i,
  FOOD: /fait maison|homemade|frais|fresh|qualit|artisan/i,
  SERVICE: /accueil|service|équipe|equipe|friendly|staff/i,
  VALUE: /prix|petit prix|rapport qualit|value|abordable/i,
  LATE_OPENING: /tard|minuit|nuit|late|00h|1h|2h|night/i,
  HALAL: /halal/i,
  REPUTATION: /avis|note|★|stars|recommand/i,
  SOCIAL: /instagram|tiktok|@/i,
};

/** Pick ONE advantage: strongest evidence first, and only if backed by a HIGH fact or two signals. */
export function findAdvantage(target: Restaurant, evidence: Evidence[], digital: DigitalHealth | undefined): Advantage | null {
  const cands: { key: AdvantageKey; ids: string[]; weight: number }[] = [];
  const strength = (theme: string) => evidence.filter((e) => e.kind === "strength" && e.params.theme === theme);
  const push = (key: AdvantageKey, ev: Evidence[], extra = 0) => { if (ev.length) cands.push({ key, ids: ev.map((e) => e.id), weight: ev.reduce((s, e) => s + (e.strength === "HIGH" ? 1 : 0.6), 0) + extra }); };
  push("PORTIONS", strength("PORTION"), 0.2);
  push("FOOD", strength("FOOD"));
  push("SERVICE", strength("SERVICE"));
  push("VALUE", strength("VALUE_FOR_MONEY"));
  push("LATE_OPENING", evidence.filter((e) => e.kind === "youOpenLater"));
  push("SOCIAL", evidence.filter((e) => e.kind === "socialStrength"));
  // Halal counts only when the profile detected it from at least two independent sources.
  const halal = target.foodProfile?.modifiers.find((m) => m.key === "HALAL");
  if (halal && new Set(halal.evidence.map((e) => e.source)).size >= 2) cands.push({ key: "HALAL", ids: [], weight: 0.9 });
  const best = cands.filter((c) => c.weight >= 0.9 || c.ids.length >= 2).sort((a, b) => b.weight - a.weight)[0];
  if (!best) return null;
  const re = WORDS[best.key];
  const site = digital?.siteText;
  const ig = digital?.social.profile?.status === "CONNECTED" ? digital.social.profile.bio ?? "" : undefined;
  const channels: Advantage["channels"] = {
    google: target.description ? re.test(target.description) : null,
    website: site !== undefined ? re.test(site) : null,
    instagram: ig !== undefined ? re.test(ig) : null,
  };
  const known = Object.values(channels).filter((v) => v !== null);
  const said = known.filter(Boolean).length;
  const insight = !known.length ? "visible" : said === 0 ? "invisible" : said < known.length ? "partlyVisible" : "visible";
  return { key: best.key, evidenceIds: best.ids, channels, insight };
}

export type ClaimKey = "PREMIUM" | "FRESH" | "FAST" | "GENEROUS" | "CHEAP";
const CLAIMS: Record<ClaimKey, { re: RegExp; themes: string[] }> = {
  PREMIUM: { re: /premium|gourmet|haut de gamme|artisan|d'exception/i, themes: ["BURGER", "FOOD_QUALITY", "TASTE"] },
  FRESH: { re: /frais|fresh|fait maison|homemade/i, themes: ["FOOD_QUALITY", "TASTE"] },
  FAST: { re: /rapide|fast|minute|express/i, themes: ["WAITING_TIME"] },
  GENEROUS: { re: /généreu|genereu|copieu|xxl|generous/i, themes: ["PORTION"] },
  CHEAP: { re: /petit prix|pas cher|cheap|abordable/i, themes: ["PRICE", "VALUE_FOR_MONEY"] },
};
const THEME_GROUP: Record<string, string> = { BURGER: "FOOD", FOOD_QUALITY: "FOOD", TASTE: "FOOD", PORTION: "PORTION", VALUE_FOR_MONEY: "VALUE_FOR_MONEY", PRICE: "VALUE_FOR_MONEY", WAITING_TIME: "WAITING_TIME", SERVICE: "SERVICE" };

export interface ExpectationGap { claim: ClaimKey; claimShare: number; dominant: string; dominantShare: number; positives: number; }

/** Only when the brand makes a claim, customers barely talk about it, and another strength clearly dominates. */
export function expectationGap(target: Restaurant, summary: ReviewSummary | undefined, brandTexts: string[]): ExpectationGap | null {
  if (!summary || summary.positiveMentions < 30) return null;
  const text = brandTexts.join(" | ");
  const share = (themes: string[]) => summary.stats.filter((s) => themes.includes(s.theme)).reduce((a, s) => a + s.positive, 0) / summary.positiveMentions;
  const groups = new Map<string, number>();
  for (const s of summary.stats) { const g = THEME_GROUP[s.theme]; if (g) groups.set(g, (groups.get(g) ?? 0) + s.positive); }
  const dominant = [...groups.entries()].sort((a, b) => b[1] - a[1])[0];
  if (!dominant) return null;
  for (const [claim, c] of Object.entries(CLAIMS) as [ClaimKey, typeof CLAIMS[ClaimKey]][]) {
    if (!c.re.test(text)) continue;
    const cs = share(c.themes);
    const ds = dominant[1] / summary.positiveMentions;
    const claimGroup = THEME_GROUP[c.themes[0]];
    if (claimGroup !== dominant[0] && cs < 0.1 && ds >= 0.25) return { claim, claimShare: Number(cs.toFixed(2)), dominant: dominant[0], dominantShare: Number(ds.toFixed(2)), positives: summary.positiveMentions };
  }
  return null;
}
