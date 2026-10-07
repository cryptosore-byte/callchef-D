import { isLocale, type Locale } from "@/i18n";
import type { RadarInput } from "@/types";
import type { DeepArea, RequestedMode } from "@/lib/orchestrator";

/** Validates a scan request body (shared by the sync route and the job route). */
const MODES: RequestedMode[] = ["auto", "deep", "light", "monthly", "cache"];
const AREAS: DeepArea[] = ["reviews", "competitors", "visibility", "menu", "instagram"];

export function parseRadarBody(raw: unknown): { input: RadarInput; locale: Locale; mode: RequestedMode; area?: DeepArea } {
  const body = (raw ?? {}) as Partial<RadarInput> & { locale?: unknown; mode?: unknown; area?: unknown };
  return {
    locale: isLocale(body.locale) ? body.locale : "en",
    // Default "auto": the orchestrator decides (stored result, light refresh, monthly or deep scan).
    mode: MODES.includes(body.mode as RequestedMode) ? (body.mode as RequestedMode) : "auto",
    area: AREAS.includes(body.area as DeepArea) ? (body.area as DeepArea) : undefined,
    input: {
      name: String(body.name ?? "").slice(0, 120),
      address: String(body.address ?? "").slice(0, 200),
      radiusM: [500, 1000, 2000, 3000].includes(Number(body.radiusM)) ? Number(body.radiusM) : 1000,
      demo: !!body.demo,
    },
  };
}
