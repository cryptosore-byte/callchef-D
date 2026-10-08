import type { T } from "@/i18n";
import type { Reason } from "@/types";

/** Localized decimal (4.6 -> "4,6" in French). Integers stay as they are. */
export const num = (v: string | number, locale: string) => {
  const n = typeof v === "number" ? v : Number(v);
  if (!isFinite(n) || (typeof v === "string" && v.trim() === "")) return String(v);
  if (!Number.isInteger(n)) return n.toLocaleString(locale, { maximumFractionDigits: 2 });
  return Math.abs(n) >= 1000 ? n.toLocaleString(locale) : String(v);
};

/** Star rating with one decimal: 5 -> "5.0" / "5,0". */
export const stars = (v: string | number, locale: string) =>
  Number(v).toLocaleString(locale, { minimumFractionDigits: 1, maximumFractionDigits: 1 });

const RATING_PARAMS: Record<string, string[]> = { betterReputation: ["a", "b"] };

/** Render a structured Reason (`reason.<code>`) with localized params. */
export function reasonText(t: T, r: Reason): string {
  const p: Record<string, string | number> = {};
  for (const [k, v] of Object.entries(r.params ?? {})) {
    p[k] = k === "theme" ? t("grp." + v) : RATING_PARAMS[r.code]?.includes(k) ? stars(v, t.locale) : num(v, t.locale);
  }
  return t("reason." + r.code, p);
}
