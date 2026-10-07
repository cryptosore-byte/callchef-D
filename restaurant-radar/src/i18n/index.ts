import { en } from "./en";
import { fr } from "./fr";

export type Locale = "en" | "fr";
export const LOCALES: Locale[] = ["en", "fr"];
export type Params = Record<string, string | number>;

const DICTS: Record<Locale, Record<string, string>> = { en, fr };

const humanize = (s: string) => {
  const t = s.toLowerCase().replace(/_/g, " ");
  return t.charAt(0).toUpperCase() + t.slice(1);
};

export interface T {
  (key: string, p?: Params): string;
  /** Label for an option / enum value (decision choices, root causes...). */
  opt(k: string): string;
  theme(k: string): string;
  sig(word: string): string;
  locale: Locale;
}

export function makeT(locale: Locale): T {
  const d = DICTS[locale] ?? en;
  const fill = (s: string, p?: Params) => (p ? s.replace(/\{(\w+)\}/g, (_, k) => String(p[k] ?? `{${k}}`)) : s);
  const t = ((key: string, p?: Params) => fill(d[key] ?? en[key] ?? key, p)) as T;
  t.opt = (k) => d["opt." + k] ?? en["opt." + k] ?? humanize(k);
  t.theme = (k) => d["theme." + k] ?? en["theme." + k] ?? humanize(k);
  t.sig = (w) => d["sig." + w] ?? w;
  t.locale = locale;
  return t;
}

export const isLocale = (v: unknown): v is Locale => v === "en" || v === "fr";
