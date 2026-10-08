// Digital restaurant health: reputation index, online visibility, AI discoverability, social power.
// All scores are computed by code from OBSERVED signals. Unknown signals are excluded (never counted as zero),
// and a section with no usable data returns score = null: NO DATA = NO CLAIM.
import { CONFIG } from "@/config";
import type { Level3, Reason, Restaurant } from "@/types";
import { clamp, mean } from "@/lib/util";
import type { InstagramProfile, LocalSearchResult, PlatformReputation, SourceStatus, WebsiteAudit } from "@/providers/DigitalProviders";

export type CheckStatus = "OK" | "WEAK" | "MISSING" | "UNKNOWN";
export interface Check { key: string; status: CheckStatus; weight: number; params?: Record<string, string | number>; }

export interface Section {
  score: number | null;       // 0..100, null = not enough data to score
  dataConfidence: Level3;
  checks: Check[];
  insight?: Reason;
}

const VAL: Record<CheckStatus, number> = { OK: 1, WEAK: 0.5, MISSING: 0, UNKNOWN: 0 };
function scoreChecks(checks: Check[]): number | null {
  const known = checks.filter((c) => c.status !== "UNKNOWN");
  const w = known.reduce((s, c) => s + c.weight, 0);
  if (!known.length || w === 0) return null;
  return Math.round((100 * known.reduce((s, c) => s + c.weight * VAL[c.status], 0)) / w);
}
const knownShare = (checks: Check[]) => (checks.length ? checks.filter((c) => c.status !== "UNKNOWN").length / checks.length : 0);
const daysSince = (iso: string | undefined, now: number) => (iso ? (now - new Date(iso).getTime()) / 86_400_000 : Infinity);

// ---- 1. Online reputation index ------------------------------------------------------------

export interface ReputationSection extends Section {
  platforms: PlatformReputation[];
  deliveryAverage: number | null;
  /** Reputation of the delivery platforms only, 0..100, null when none is connected. */
  deliveryScore: number | null;
}

const ratingTo01 = (r: number) => clamp((r - 3.5) / 1.5); // 3.5 stars = 0, 5.0 = 1

export function reputationSection(target: Restaurant, adjustedRating: number, platforms: PlatformReputation[], nowMs = Date.now()): ReputationSection {
  const g = platforms.find((p) => p.platform === "GOOGLE" && p.status === "CONNECTED");
  const delivery = platforms.filter((p) => p.platform !== "GOOGLE" && p.status === "CONNECTED" && typeof p.rating === "number");
  const deliveryAverage = delivery.length ? mean(delivery.map((p) => p.rating!)) : null;
  const latest = target.reviews.map((r) => r.date).sort().pop();
  const age = daysSince(latest, nowMs);

  // Each dimension 0..1 with a weight; missing platforms are dropped and the rest reweighted.
  const dims: { key: string; v: number; w: number }[] = [];
  if (g) {
    dims.push({ key: "googleAdjusted", v: ratingTo01(adjustedRating), w: 0.35 });
    dims.push({ key: "googleVolume", v: clamp(Math.log10((g.ratingCount ?? 0) + 1) / 3), w: 0.15 });
  }
  if (deliveryAverage !== null) {
    dims.push({ key: "delivery", v: ratingTo01(deliveryAverage), w: 0.3 });
    if (g?.rating) dims.push({ key: "consistency", v: 1 - clamp(Math.abs(g.rating - deliveryAverage)), w: 0.1 });
  }
  if (target.reviews.length && isFinite(age)) dims.push({ key: "recency", v: age <= 30 ? 1 : age <= 90 ? 0.6 : 0.2, w: 0.1 });
  const W = dims.reduce((s, d) => s + d.w, 0);
  const score = W ? Math.round((100 * dims.reduce((s, d) => s + d.w * d.v, 0)) / W) : null;

  let insight: Reason | undefined;
  if (g?.rating && deliveryAverage !== null) {
    const gap = g.rating - deliveryAverage;
    insight = gap >= 0.4 ? { code: "rep.deliveryGap", params: { g: g.rating, d: deliveryAverage.toFixed(1) } }
      : gap <= -0.4 ? { code: "rep.deliveryStronger", params: { g: g.rating, d: deliveryAverage.toFixed(1) } }
      : { code: "rep.consistent", params: { g: g.rating, d: deliveryAverage.toFixed(1) } };
  } else if (g) {
    insight = { code: adjustedRating >= 4.4 ? "rep.googleStrong" : adjustedRating >= 4.1 ? "rep.googleSolid" : "rep.googleWeak", params: { g: g.rating ?? 0, n: g.ratingCount ?? 0 } };
  }
  const n = g?.ratingCount ?? 0;
  const dataConfidence: Level3 = n >= CONFIG.reputation.highMinReviews && delivery.length ? "HIGH" : n >= CONFIG.reputation.mediumMinReviews ? "MEDIUM" : "LOW";
  return {
    score, dataConfidence, checks: dims.map((d) => ({ key: "rep." + d.key, status: d.v >= 0.75 ? "OK" : d.v >= 0.45 ? "WEAK" : "MISSING", weight: d.w })),
    insight, platforms, deliveryAverage, deliveryScore: deliveryAverage === null ? null : Math.round(100 * ratingTo01(deliveryAverage)),
  };
}

// ---- 2. Online visibility (observable, not Google's private ranking) -----------------------

export interface VisibilitySection extends Section { search: { status: SourceStatus; results: LocalSearchResult[]; topN: number }; }

export function visibilitySection(t: Restaurant, cuisineMatchesCategory: boolean, search: VisibilitySection["search"], site: WebsiteAudit, nowMs = Date.now()): VisibilitySection {
  const checks: Check[] = [];
  const add = (key: string, status: CheckStatus, weight: number, params?: Check["params"]) => checks.push({ key, status, weight, params });
  add("vis.primaryCategory", !t.categories.length ? "MISSING" : cuisineMatchesCategory ? "OK" : "WEAK", 2, { c: t.categories[0] ?? "" });
  add("vis.secondaryCategories", t.categories.length >= 3 ? "OK" : t.categories.length === 2 ? "WEAK" : "MISSING", 1, { n: Math.max(0, t.categories.length - 1) });
  add("vis.rating", !t.reviewCount ? "MISSING" : t.rating >= 4.3 ? "OK" : t.rating >= 4.0 ? "WEAK" : "MISSING", 1.5, { r: t.rating });
  add("vis.reviewVolume", t.reviewCount >= 200 ? "OK" : t.reviewCount >= 50 ? "WEAK" : "MISSING", 1.5, { n: t.reviewCount });
  const latest = t.reviews.map((r) => r.date).sort().pop();
  const age = daysSince(latest, nowMs);
  add("vis.reviewFreshness", !t.reviews.length ? "UNKNOWN" : age <= 14 ? "OK" : age <= 60 ? "WEAK" : "MISSING", 1.5, { d: isFinite(age) ? Math.round(age) : 0 });
  add("vis.photos", t.imagesCount === undefined ? "UNKNOWN" : t.imagesCount >= 50 ? "OK" : t.imagesCount >= 15 ? "WEAK" : "MISSING", 1, { n: t.imagesCount ?? 0 });
  add("vis.hours", t.openingHours ? "OK" : "MISSING", 1.5);
  add("vis.website", t.website ? "OK" : "MISSING", 1.5);
  add("vis.menu", t.menuUrl || site.hasMenuText ? "OK" : site.status === "ERROR" ? "UNKNOWN" : "MISSING", 1);
  add("vis.phone", t.phone ? "OK" : "MISSING", 1);
  add("vis.description", t.description ? "OK" : "MISSING", 1);
  if (search.status === "CONNECTED" && search.results.length) {
    const best = search.results.map((r) => r.rank).filter((r): r is number => r !== null).sort((a, b) => a - b)[0];
    add("vis.search", best === undefined ? "MISSING" : best <= 3 ? "OK" : best <= 10 ? "WEAK" : "MISSING", 2, { r: best ?? 0 });
  } else add("vis.search", "UNKNOWN", 2);

  // Opportunity insight: visible on one query, much less on another.
  let insight: Reason | undefined;
  const ranked = search.results.filter((r) => r.rank !== null).sort((a, b) => a.rank! - b.rank!);
  const missing = search.results.filter((r) => r.rank === null);
  if (ranked.length && missing.length) insight = { code: "vis.gapQuery", params: { good: ranked[0].query, r: ranked[0].rank!, bad: missing[0].query, n: search.topN } };
  else if (ranked.length >= 2 && ranked[ranked.length - 1].rank! - ranked[0].rank! >= 5) insight = { code: "vis.gapRank", params: { good: ranked[0].query, r: ranked[0].rank!, bad: ranked[ranked.length - 1].query, r2: ranked[ranked.length - 1].rank! } };
  else {
    const firstMissing = checks.find((c) => c.status === "MISSING" && c.weight >= 1.5);
    if (firstMissing) insight = { code: "vis.fix", params: { what: firstMissing.key } };
  }
  const share = knownShare(checks);
  return { score: scoreChecks(checks), dataConfidence: share >= 0.85 ? "HIGH" : share >= 0.6 ? "MEDIUM" : "LOW", checks, insight, search };
}

// ---- 3. AI discoverability / AI readiness --------------------------------------------------

const digits = (s?: string) => (s ?? "").replace(/\D/g, "").slice(-9);

export function aiSection(t: Restaurant, cuisineRe: RegExp | null, dietary: string[], site: WebsiteAudit, instagramFound: boolean): Section {
  const checks: Check[] = [];
  const add = (key: string, status: CheckStatus, weight: number, params?: Check["params"]) => checks.push({ key, status, weight, params });
  const fetched = site.status === "CONNECTED";
  const noSite = !t.website;
  // Site-dependent signals: MISSING when there is no site at all, UNKNOWN when the site could not be read.
  const siteCheck = (ok: boolean) => (noSite ? "MISSING" : !fetched ? "UNKNOWN" : ok ? "OK" : "MISSING");
  add("ai.website", noSite ? "MISSING" : "OK", 2);
  add("ai.schema", siteCheck(site.schemaTypes.some((x) => /restaurant|localbusiness|foodestablishment/i.test(x))), 2);
  const cuisineOnSite = !!cuisineRe && (cuisineRe.test(site.textSample) || (!!site.schemaCuisine && cuisineRe.test(site.schemaCuisine)));
  add("ai.cuisine", cuisineRe ? siteCheck(cuisineOnSite) : "UNKNOWN", 1.5);
  for (const d of dietary) add("ai.dietary", siteCheck(new RegExp(d === "HALAL" ? "halal" : d === "VEGAN" ? "vegan|végan" : "végétarien|vegetarian", "i").test(site.textSample)), 1, { d });
  add("ai.hours", siteCheck(site.schemaHours || /\b\d{1,2}\s?h\s?\d{0,2}\b|\b\d{1,2}:\d{2}\b/.test(site.textSample)), 1);
  add("ai.menu", siteCheck(site.hasMenuText), 1.5);
  const phoneOk = !!t.phone && (site.textSample.replace(/\D/g, "").includes(digits(t.phone)) || digits(site.schemaPhone) === digits(t.phone));
  const nameOk = site.textSample.includes(t.name.toLowerCase());
  add("ai.nap", !t.phone ? "UNKNOWN" : siteCheck(phoneOk && nameOk), 1.5);
  add("ai.googleDescription", t.description ? "OK" : "MISSING", 1);
  add("ai.social", site.instagramUrl || instagramFound ? "OK" : fetched || noSite ? "MISSING" : "UNKNOWN", 1);
  add("ai.meta", siteCheck(!!site.metaDescription), 0.5);

  const ok = (k: string) => checks.find((c) => c.key === k)?.status === "OK";
  let insight: Reason | undefined;
  if (noSite) insight = { code: "ai.noSite" };
  else if (!fetched) insight = { code: "ai.unreadable" };
  else if (ok("ai.nap") && (!ok("ai.cuisine") || checks.some((c) => c.key === "ai.dietary" && c.status !== "OK"))) insight = { code: "ai.identityButPositioning" };
  else if (!ok("ai.schema")) insight = { code: "ai.noSchema" };
  else if (!ok("ai.menu")) insight = { code: "ai.noMenu" };
  else insight = { code: "ai.clear" };
  return { score: scoreChecks(checks), dataConfidence: fetched ? "HIGH" : noSite ? "MEDIUM" : "LOW", checks, insight };
}

// ---- 4. Social power (Instagram) -----------------------------------------------------------

export interface SocialSection extends Section { profile?: InstagramProfile; engagementRate?: number; }

export function engagementRate(p: InstagramProfile): number | undefined {
  const posts = (p.recentPosts ?? []).filter((x) => x.likes !== undefined);
  if (!p.followers || !posts.length) return undefined;
  return mean(posts.map((x) => ((x.likes ?? 0) + (x.comments ?? 0)) / p.followers!));
}

export function socialSection(me: InstagramProfile, others: { name: string; profile: InstagramProfile }[], nowMs = Date.now()): SocialSection {
  if (me.status !== "CONNECTED" || !me.followers || !(me.recentPosts?.length)) {
    return { score: null, dataConfidence: "LOW", checks: [], profile: me };
  }
  const er = engagementRate(me) ?? 0;
  const posts = me.recentPosts!;
  const last30 = posts.filter((x) => daysSince(x.date, nowMs) <= 30).length;
  const lastPost = Math.min(...posts.map((x) => daysSince(x.date, nowMs)));
  const peers = others.filter((o) => o.profile.status === "CONNECTED" && o.profile.followers);
  const maxF = Math.max(me.followers, ...peers.map((o) => o.profile.followers!));
  const per = posts.map((x) => ((x.likes ?? 0) + (x.comments ?? 0)) / me.followers!);
  const cv = per.length > 1 && mean(per) > 0 ? Math.sqrt(mean(per.map((v) => (v - mean(per)) ** 2))) / mean(per) : 0;
  const w = CONFIG.socialWeights;
  const dims: { key: string; v: number; w: number; params?: Record<string, string | number> }[] = [
    { key: "social.engagement", v: clamp(er / 0.03), w: w.engagement, params: { p: (er * 100).toFixed(1) } },
    { key: "social.consistency", v: clamp(last30 / 8), w: w.consistency, params: { n: last30 } },
    { key: "social.audience", v: peers.length ? me.followers / maxF : 0.5, w: w.audience, params: { n: me.followers } },
    { key: "social.freshness", v: lastPost <= 3 ? 1 : lastPost <= 14 ? 0.6 : lastPost <= 30 ? 0.3 : 0, w: w.freshness, params: { d: Math.round(lastPost) } },
    { key: "social.profile", v: [me.bio, me.website, me.username].filter(Boolean).length / 3, w: w.profile },
    { key: "social.performance", v: clamp(1 - cv / 1.5), w: w.performance },
  ];
  const score = Math.round(100 * dims.reduce((s, d) => s + d.w * d.v, 0));
  // Insight against the largest-audience or highest-engagement peer, only with real numbers on both sides.
  let insight: Reason | undefined;
  const peer = peers.map((o) => ({ ...o, er: engagementRate(o.profile) })).filter((o) => o.er !== undefined).sort((a, b) => b.er! - a.er!)[0];
  if (peer && me.followers > peer.profile.followers! && peer.er! >= er * 1.5) {
    insight = { code: "social.biggerButLessEngaged", params: { name: peer.name, a: me.followers, b: peer.profile.followers!, x: (peer.er! / Math.max(er, 1e-6)).toFixed(1) } };
  } else if (peer && er >= peer.er! * 1.5) {
    insight = { code: "social.moreEngaged", params: { name: peer.name, a: (er * 100).toFixed(1), b: (peer.er! * 100).toFixed(1) } };
  } else if (lastPost > 30) insight = { code: "social.dormant", params: { d: Math.round(lastPost) } };
  return {
    score, dataConfidence: posts.length >= 9 ? "HIGH" : posts.length >= 3 ? "MEDIUM" : "LOW",
    checks: dims.map((d) => ({ key: d.key, status: d.v >= 0.7 ? "OK" : d.v >= 0.4 ? "WEAK" : "MISSING", weight: d.w, params: d.params })),
    insight, profile: me, engagementRate: er,
  };
}
