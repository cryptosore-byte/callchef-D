// Collects the optional digital sources (in parallel, failure-tolerant) and builds the digital health sections.
// Live mode: Google (always), website audit (free HTTP GET of the restaurant's own site), local search ranks from the
// Google Maps scan. Uber Eats / Deliveroo / Instagram stay NOT_CONNECTED until an approved source is configured.
import type { Competitor, Level3, Reputation, Restaurant } from "@/types";
import {
  DeliverooReputationProvider, GoogleReputationProvider, HttpWebsiteAuditProvider, NotConnectedInstagramProvider,
  StaticInstagramProvider, StaticReputationProvider, StaticWebsiteAuditProvider, UberEatsReputationProvider, localSearchFrom,
  type InstagramDataProvider, type InstagramProfile, type ReputationProvider, type WebsiteAuditProvider,
} from "@/providers/DigitalProviders";
import { demoDigital } from "@/data/demo";
import { aiSection, reputationSection, socialSection, visibilitySection, type ReputationSection, type Section, type SocialSection, type VisibilitySection } from "./DigitalHealthService";
import { cuisineRegex, searchQueries } from "./FoodTypeDetectionService";
import { CONFIG } from "@/config";
import { cacheGet, cacheSet } from "@/lib/cache";
import type { ProviderBudget } from "./ProviderBudgetService";

/** Results requested per Google Maps search in the nearby scan (see apify/inputs.ts). */
const searchTopN = () => Math.max(5, Math.ceil(CONFIG.limits.maxNearbyRestaurants / 2));

export type HealthKey = "marketPosition" | "reputation" | "deliveryReputation" | "visibility" | "social" | "ai";
export interface DigitalHealth {
  reputation: ReputationSection;
  visibility: VisibilitySection;
  ai: Section;
  social: SocialSection;
  /** Secondary overview. score null = not measurable with the connected sources. */
  overview: { key: HealthKey; score: number | null; dataConfidence: Level3 }[];
  queries: string[];
  /** Lowercased visible text of the restaurant's own site, when it could be read (for advantage / expectation checks). */
  siteText?: string;
}

export interface DigitalSources { reputation: ReputationProvider[]; website: WebsiteAuditProvider; instagram: InstagramDataProvider; }

/** Website audits are free but slow: cached 7 days and counted as an optional (priority 6) check. */
class CachedWebsiteAudit implements WebsiteAuditProvider {
  constructor(private inner: WebsiteAuditProvider, private budget?: ProviderBudget) {}
  async audit(url?: string) {
    if (!url) return this.inner.audit(url);
    const key = `site:${url}`;
    const hit = cacheGet<Awaited<ReturnType<WebsiteAuditProvider["audit"]>>>(key);
    if (hit) { this.budget?.cached("website.audit", 6); return hit; }
    if (this.budget && !this.budget.allow("website.audit", 6, 0)) return { status: "NOT_CONNECTED" as const, schemaTypes: [], schemaHours: false, schemaAddress: false, textSample: "", hasMenuText: false };
    const r = await this.inner.audit(url);
    if (r.status === "CONNECTED") cacheSet(key, r, CONFIG.cacheTtlHours.websiteAudit);
    return r;
  }
}

export function sourcesFor(demo: boolean, budget?: ProviderBudget): DigitalSources {
  if (demo) {
    const d = demoDigital();
    return {
      reputation: [new GoogleReputationProvider(), new StaticReputationProvider("UBER_EATS", d.delivery.UBER_EATS), new StaticReputationProvider("DELIVEROO", d.delivery.DELIVEROO)],
      website: new StaticWebsiteAuditProvider(d.website),
      instagram: new StaticInstagramProvider(d.instagram),
    };
  }
  return {
    reputation: [new GoogleReputationProvider(), UberEatsReputationProvider(), DeliverooReputationProvider()],
    website: new CachedWebsiteAudit(new HttpWebsiteAuditProvider(), budget),
    instagram: new NotConnectedInstagramProvider(),
  };
}

const safe = async <T>(p: Promise<T>, fallback: T): Promise<T> => { try { return await p; } catch { return fallback; } };

export async function runDigitalHealth(
  target: Restaurant, targetRep: Reputation, competitors: Competitor[], marketPosition: number, sources: DigitalSources,
): Promise<DigitalHealth> {
  const notConnected: InstagramProfile = { status: "NOT_CONNECTED" };
  const [platforms, site, igMe, igOthers] = await Promise.all([
    Promise.all(sources.reputation.map((p) => safe(p.fetch(target), { platform: p.platform, status: "ERROR" as const }))),
    safe(sources.website.audit(target.website), { status: "ERROR" as const, schemaTypes: [], schemaHours: false, schemaAddress: false, textSample: "", hasMenuText: false }),
    safe(sources.instagram.fetch(target), notConnected),
    Promise.all(competitors.map(async (c) => ({ name: c.restaurant.name, profile: await safe(sources.instagram.fetch(c.restaurant), notConnected) }))),
  ]);
  const fp = target.foodProfile;
  const re = fp && fp.level !== "LOW" ? cuisineRegex(fp.primary) : null;
  const queries = searchQueries(fp);
  const reputation = reputationSection(target, targetRep.adjustedRating, platforms);
  const visibility = visibilitySection(target, !!re && target.categories.slice(0, 1).some((c) => re.test(c)), localSearchFrom(target, queries, searchTopN()), site);
  const dietary = (fp?.modifiers ?? []).map((m) => m.key).filter((k) => k === "HALAL" || k === "VEGAN" || k === "VEGETARIAN");
  const ai = aiSection(target, re, dietary, site, igMe.status === "CONNECTED");
  const social = socialSection(igMe, igOthers);
  return {
    reputation, visibility, ai, social, queries, siteText: site.status === "CONNECTED" ? site.textSample : undefined,
    overview: [
      { key: "marketPosition", score: Math.round(marketPosition), dataConfidence: competitors.length >= 3 ? "HIGH" : competitors.length ? "MEDIUM" : "LOW" },
      { key: "reputation", score: reputation.score, dataConfidence: reputation.dataConfidence },
      { key: "deliveryReputation", score: reputation.deliveryScore, dataConfidence: reputation.deliveryScore === null ? "LOW" : "MEDIUM" },
      { key: "visibility", score: visibility.score, dataConfidence: visibility.dataConfidence },
      { key: "social", score: social.score, dataConfidence: social.dataConfidence },
      { key: "ai", score: ai.score, dataConfidence: ai.dataConfidence },
    ],
  };
}
