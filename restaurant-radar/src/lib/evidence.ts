import type { T } from "@/i18n";
import type { Evidence } from "@/services/EvidenceService";
import { num, reasonText, stars } from "./reasons";

const lower = (s: string) => s.charAt(0).toLowerCase() + s.slice(1);

/** One evidence item as a plain sentence for the owner. */
export function evidenceText(t: T, e: Evidence): string {
  const p: Record<string, string | number> = {};
  for (const [k, v] of Object.entries(e.params)) p[k] = ["g", "d"].includes(k) && e.kind === "deliveryGap" ? stars(v, t.locale) : num(v, t.locale);
  if (e.params.theme) p.theme = e.kind === "strengthNotCommunicated" ? t("grpPraise." + e.params.theme) : t("grp." + e.params.theme);
  if (e.kind === "trendWorse" && e.params.theme) p.theme = t("grp." + e.params.theme);
  if (e.kind === "emergingThreat") p.r = stars(e.params.r, t.locale);
  if (e.kind === "profileGap") p.items = String(e.params.items).split(",").map((k) => lower(t(k).replace(/\s*\([^)]*\{\w+\}[^)]*\)/g, ""))).join(", ");
  if (e.kind === "aiGap") p.detail = t("aishort." + e.params.code);
  if (e.kind === "edge") { const { name, code, ...rest } = e.params; p.detail = lower(reasonText(t, { code: String(code), params: rest })); p.name = name; }
  const key = e.kind === "socialGap" && e.params.x === undefined ? "evi.socialGapDormant" : "evi." + e.kind;
  return t(key, p);
}

/** Discovery / plan sentences share the evidence params conventions. */
export function paramsText(t: T, params: Record<string, string | number>, kind?: string): Record<string, string | number> {
  const p: Record<string, string | number> = {};
  for (const [k, v] of Object.entries(params)) p[k] = num(v, t.locale);
  if (params.theme) p.theme = kind === "praise" ? t("grpPraise." + params.theme) : lower(t("grp." + params.theme));
  if (kind === "deliveryGap") { p.g = stars(params.g, t.locale); p.d = stars(params.d, t.locale); }
  if (params.r !== undefined && kind === "emergingThreat") p.r = stars(params.r, t.locale);
  return p;
}
