import { isLocale, type Locale } from "@/i18n";
import type { RadarInput } from "@/types";

/** Validates a scan request body (shared by the sync route and the job route). */
export function parseRadarBody(raw: unknown): { input: RadarInput; locale: Locale } {
  const body = (raw ?? {}) as Partial<RadarInput> & { locale?: unknown };
  return {
    locale: isLocale(body.locale) ? body.locale : "en",
    input: {
      name: String(body.name ?? "").slice(0, 120),
      address: String(body.address ?? "").slice(0, 200),
      radiusM: [500, 1000, 2000, 3000].includes(Number(body.radiusM)) ? Number(body.radiusM) : 1000,
      demo: !!body.demo,
    },
  };
}
