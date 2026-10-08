// Optional digital data sources. Every provider returns NORMALIZED objects and an explicit status.
// A provider that is not configured returns NOT_CONNECTED: the UI says so, and no score or claim is produced from it.
// Uber Eats / Deliveroo / Instagram: no scraping code lives here. They become CONNECTED only once an approved
// source (e.g. a vetted Apify actor) is configured AND its output mapping has been validated in `mapItem`.
import type { Restaurant } from "@/types";

export type SourceStatus = "CONNECTED" | "NOT_CONNECTED" | "NOT_FOUND" | "ERROR";
export type Platform = "GOOGLE" | "UBER_EATS" | "DELIVEROO";

export interface PlatformReputation {
  platform: Platform;
  status: SourceStatus;
  rating?: number;
  /** Exact count when the platform gives one. */
  ratingCount?: number;
  /** Count exactly as the platform displays it ("1,000+"), when it is not an exact number. */
  ratingCountText?: string;
  url?: string;
  cuisine?: string;
  menuAvailable?: boolean;
  updatedAt?: string;
}

export interface ReputationProvider {
  readonly platform: Platform;
  fetch(target: Restaurant): Promise<PlatformReputation>;
}

/** Google is always connected: it comes from the places data we already have. */
export class GoogleReputationProvider implements ReputationProvider {
  readonly platform = "GOOGLE" as const;
  async fetch(t: Restaurant): Promise<PlatformReputation> {
    return {
      platform: "GOOGLE", status: t.reviewCount > 0 ? "CONNECTED" : "NOT_FOUND",
      rating: t.rating || undefined, ratingCount: t.reviewCount, url: t.source.url,
      cuisine: t.categories[0], menuAvailable: !!t.menuUrl, updatedAt: t.source.retrievedAt,
    };
  }
}

/** Delivery marketplace placeholder: NOT_CONNECTED until an approved source is configured and validated. */
export class MarketplaceReputationProvider implements ReputationProvider {
  constructor(readonly platform: "UBER_EATS" | "DELIVEROO", private envVar: string) {}
  /** True only when an approved source id is configured. Mapping must be validated before this returns data. */
  isConfigured() { return !!process.env[this.envVar] && process.env[this.envVar + "_VALIDATED"] === "1"; }
  async fetch(): Promise<PlatformReputation> {
    // Intentionally no implementation: see header. Never fabricate a platform rating.
    return { platform: this.platform, status: "NOT_CONNECTED" };
  }
}
export const UberEatsReputationProvider = () => new MarketplaceReputationProvider("UBER_EATS", "APIFY_UBEREATS_ACTOR_ID");
export const DeliverooReputationProvider = () => new MarketplaceReputationProvider("DELIVEROO", "APIFY_DELIVEROO_ACTOR_ID");

// ---- Instagram ----------------------------------------------------------------
export interface InstagramPost { date: string; likes?: number; comments?: number; views?: number; isReel?: boolean; }
export interface InstagramProfile {
  status: SourceStatus;
  username?: string;
  followers?: number;
  following?: number;
  postCount?: number;
  bio?: string;
  website?: string;
  recentPosts?: InstagramPost[];
  updatedAt?: string;
}
export interface InstagramDataProvider {
  fetch(r: Restaurant): Promise<InstagramProfile>;
}
export class NotConnectedInstagramProvider implements InstagramDataProvider {
  async fetch(): Promise<InstagramProfile> { return { status: "NOT_CONNECTED" }; }
}

// ---- Local search -------------------------------------------------------------
export interface LocalSearchResult { query: string; rank: number | null; }
/**
 * Local search positions come from the Google Maps searches already run for the nearby scan (same area, same
 * keywords). `rank` = position in Google's result order; null = not in the results returned for that query.
 */
export function localSearchFrom(target: Restaurant, queries: string[], topN: number): { status: SourceStatus; results: LocalSearchResult[]; topN: number } {
  // `searchRanks` undefined = the provider exposes no ranks: we cannot tell "absent" from "not measured".
  if (!queries.length || target.searchRanks === undefined) return { status: "NOT_CONNECTED", results: [], topN };
  const ranks = target.searchRanks;
  return {
    status: "CONNECTED", topN,
    results: queries.map((q) => ({ query: q, rank: ranks.filter((r) => r.query === q).sort((a, b) => a.rank - b.rank)[0]?.rank ?? null })),
  };
}

// ---- Website audit -------------------------------------------------------------
export interface WebsiteAudit {
  status: SourceStatus;
  url?: string;
  title?: string;
  metaDescription?: string;
  schemaTypes: string[];       // schema.org @type values found in JSON-LD
  schemaCuisine?: string;
  schemaHours: boolean;
  schemaAddress: boolean;
  schemaPhone?: string;
  textSample: string;          // visible text, lowercased, capped
  hasMenuText: boolean;        // a crawlable menu: "menu/carte" words AND prices in the HTML text
  instagramUrl?: string;
}

const MAX_HTML = 600_000;
const AUDIT_TIMEOUT_MS = 8_000;

function textOf(html: string) {
  return html.replace(/<script[\s\S]*?<\/script>/gi, " ").replace(/<style[\s\S]*?<\/style>/gi, " ").replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;|&#160;/g, " ").replace(/\s+/g, " ").trim();
}

/** Parse an HTML page. Exported for tests. */
export function auditHtml(url: string, html: string): WebsiteAudit {
  const types: string[] = [];
  let cuisine: string | undefined, hours = false, address = false, phone: string | undefined;
  for (const m of html.matchAll(/<script[^>]*application\/ld\+json[^>]*>([\s\S]*?)<\/script>/gi)) {
    try {
      const data = JSON.parse(m[1]);
      const nodes: unknown[] = Array.isArray(data) ? data : data?.["@graph"] ?? [data];
      for (const n of nodes as Record<string, unknown>[]) {
        const t = n?.["@type"];
        for (const x of Array.isArray(t) ? t : t ? [t] : []) types.push(String(x));
        if (n?.servesCuisine) cuisine = String(Array.isArray(n.servesCuisine) ? n.servesCuisine.join(", ") : n.servesCuisine);
        if (n?.openingHours || n?.openingHoursSpecification) hours = true;
        if (n?.address) address = true;
        if (typeof n?.telephone === "string") phone = n.telephone;
      }
    } catch { /* invalid JSON-LD is simply not counted */ }
  }
  const text = textOf(html);
  const lower = text.toLowerCase();
  return {
    status: "CONNECTED", url,
    title: html.match(/<title[^>]*>([^<]*)<\/title>/i)?.[1]?.trim(),
    metaDescription: html.match(/<meta[^>]+name=["']description["'][^>]+content=["']([^"']*)["']/i)?.[1]?.trim(),
    schemaTypes: types, schemaCuisine: cuisine, schemaHours: hours, schemaAddress: address, schemaPhone: phone,
    textSample: lower.slice(0, 20_000),
    hasMenuText: /\b(menu|carte|nos burgers|our menu)\b/.test(lower) && /\d+[.,]\d{2}\s?€|€\s?\d+/.test(text),
    instagramUrl: html.match(/https?:\/\/(?:www\.)?instagram\.com\/[A-Za-z0-9_.]+/i)?.[0],
  };
}

export interface WebsiteAuditProvider { audit(url?: string): Promise<WebsiteAudit>; }

/** Fetches the restaurant's own public website (one GET, capped size, short timeout). Free; no third party involved. */
export class HttpWebsiteAuditProvider implements WebsiteAuditProvider {
  async audit(url?: string): Promise<WebsiteAudit> {
    const empty: WebsiteAudit = { status: "NOT_FOUND", schemaTypes: [], schemaHours: false, schemaAddress: false, textSample: "", hasMenuText: false };
    if (!url || !/^https?:\/\//i.test(url)) return empty;
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), AUDIT_TIMEOUT_MS);
    try {
      const res = await fetch(url, { signal: ctrl.signal, redirect: "follow", headers: { "User-Agent": "RestaurantRadar/1.0 (+site audit)" } });
      if (!res.ok) return { ...empty, status: "ERROR", url };
      const html = (await res.text()).slice(0, MAX_HTML);
      return auditHtml(url, html);
    } catch {
      return { ...empty, status: "ERROR", url };
    } finally { clearTimeout(timer); }
  }
}

/** Demo: fictional, labelled demo data so every section can be previewed. */
export class StaticWebsiteAuditProvider implements WebsiteAuditProvider {
  constructor(private result: WebsiteAudit) {}
  async audit() { return this.result; }
}
export class StaticReputationProvider implements ReputationProvider {
  constructor(readonly platform: Platform, private result: PlatformReputation) {}
  async fetch() { return this.result; }
}
export class StaticInstagramProvider implements InstagramDataProvider {
  constructor(private byName: Record<string, InstagramProfile>) {}
  async fetch(r: Restaurant) { return this.byName[r.name] ?? { status: "NOT_FOUND" as const }; }
}
