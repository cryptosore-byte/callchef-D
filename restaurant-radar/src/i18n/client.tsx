"use client";
import { createContext, useContext, useEffect, useMemo, useState } from "react";
import { makeT, isLocale, type Locale, type T } from "./index";

const KEY = "rr:locale";
interface Ctx { locale: Locale; setLocale: (l: Locale) => void; t: T; }
const LocaleCtx = createContext<Ctx>({ locale: "en", setLocale: () => {}, t: makeT("en") });

export function LocaleProvider({ children }: { children: React.ReactNode }) {
  const [locale, setL] = useState<Locale>("en");
  useEffect(() => {
    const saved = localStorage.getItem(KEY);
    if (isLocale(saved)) setL(saved);
    else if (navigator.language?.toLowerCase().startsWith("fr")) setL("fr");
  }, []);
  useEffect(() => { document.documentElement.lang = locale; }, [locale]);
  const value = useMemo<Ctx>(() => ({
    locale, t: makeT(locale),
    setLocale: (l) => { localStorage.setItem(KEY, l); setL(l); },
  }), [locale]);
  return <LocaleCtx.Provider value={value}>{children}</LocaleCtx.Provider>;
}

export const useLocale = () => useContext(LocaleCtx);
export const useT = () => useContext(LocaleCtx).t;

export function LangSwitch({ dark = false }: { dark?: boolean }) {
  const { locale, setLocale } = useLocale();
  return (
    <div role="group" aria-label="Language" className={`inline-flex overflow-hidden rounded-lg border text-xs font-bold ${dark ? "border-white/30" : "border-line"}`}>
      {(["en", "fr"] as Locale[]).map((l) => (
        <button key={l} onClick={() => setLocale(l)} aria-pressed={locale === l}
          className={`px-2.5 py-1.5 uppercase ${locale === l ? (dark ? "bg-white text-ink" : "bg-ink text-white") : (dark ? "text-white/70" : "bg-paper text-mist hover:text-ink")}`}>{l}</button>
      ))}
    </div>
  );
}
