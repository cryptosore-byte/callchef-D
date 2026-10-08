"use client";
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { Logo } from "@/components/ui";
import { LangSwitch, useLocale } from "@/i18n/client";
import { radiusLabel } from "@/lib/labels";
import { CONFIG } from "@/config";
import { STORAGE_KEY } from "@/lib/useRadarResult";
import { startScan } from "@/lib/scanJob";
import { PlaceSearch, Identity, AddressField, fromText } from "@/components/home/PlaceSearch";
import { Pillars, DecisionStatement } from "@/components/home/Pillars";
import { Preview, RadarRings } from "@/components/home/Preview";
import type { PlaceSuggestion } from "@/providers/PlaceSuggestProvider";

// ONE SEARCH. FOUR DIMENSIONS. ONE CLEAR DECISION.
// Nothing paid runs on this page: autocomplete is a free cached geocoder, the diagnosis starts after confirmation.
export default function Home() {
  const router = useRouter();
  const { t, locale } = useLocale();
  const [text, setText] = useState("");
  const [street, setStreet] = useState("");
  const [city, setCity] = useState("");
  const [city2, setCity2] = useState("");
  const addr = [street.trim(), city.trim()].filter(Boolean).join(", ");
  const [picked, setPicked] = useState<PlaceSuggestion | null>(null);
  const [comparing, setComparing] = useState(false);
  const [text2, setText2] = useState("");
  const [picked2, setPicked2] = useState<PlaceSuggestion | null>(null);
  const [radiusM, setRadiusM] = useState(1000);
  const [live, setLive] = useState<boolean | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => { fetch("/api/radar").then((r) => r.json()).then((d) => setLive(!!d.live)).catch(() => setLive(false)); }, []);
  const demoMode = live === false;

  async function run(demo: boolean) {
    setError(null);
    const typed = fromText(text);
    const target = picked ? { name: picked.name, address: picked.address || addr } : { name: typed.name, address: addr || typed.address };
    const compareWith = comparing ? (picked2?.name ?? fromText(text2).name) : "";
    if (!demo && !target.name) { setError(t("home.errName")); return; }
    if (!demo && !picked && !city.trim() && !typed.address && !demoMode) { setError(t("hs.errPick")); return; }
    if (!demo && comparing && !compareWith) { setError(t("hs.errCompare")); return; }
    const body = demo
      ? { name: "Maison Brasero", address: "Marseille", radiusM: 1000, demo: true, locale }
      : { ...target, radiusM, demo: demoMode, ...(compareWith ? { compareWith } : {}), locale };
    setBusy(true);
    try {
      // The scan runs as a background job: /radar shows progress and reveals results as they arrive.
      await startScan(body);
      sessionStorage.removeItem(STORAGE_KEY);
      router.push("/radar");
    } catch {
      setBusy(false);
      setError(t("home.errNetwork"));
    }
  }

  return (
    <div className="overflow-x-hidden">
      <main className="mx-auto max-w-6xl px-4 md:px-8">
        <header className="flex items-center justify-between py-6"><Logo /><LangSwitch /></header>

        {/* ---- Hero: promise + the one search ---- */}
        <section className="grid items-center gap-8 pb-10 pt-2 md:pb-12 md:pt-6 lg:grid-cols-[1fr_300px] lg:gap-12">
          <div className="max-w-[46rem]">
            <p className="rise font-display text-xs font-bold tracking-[0.2em] text-fennel">{t("hero.eyebrow")}</p>
            <h1 className="rise mt-4 font-display text-[2.6rem] font-extrabold leading-[0.98] tracking-[-0.03em] md:text-[3.6rem] lg:text-[4.1rem]">
              {t("hero.h1a")}<br /><span className="text-fennel">{t("hero.h1b")}</span>
            </h1>
            <p className="rise mt-5 max-w-2xl text-lg leading-relaxed text-mist md:text-xl">{t("hero.sub")}</p>

            <div className="rise mt-7 rounded-[22px] bg-paper p-5 shadow-[0_1px_0_#CBD2CC,0_24px_48px_-28px_rgba(20,34,30,.35)] md:p-7">
              {busy ? (
                <div aria-live="polite" className="flex items-center gap-3 py-5">
                  <span className="h-4 w-4 animate-spin rounded-full border-2 border-mist/40 border-t-ink" aria-hidden />
                  <p className="font-display text-xl font-bold">{t("home.running")}</p>
                </div>
              ) : (
                <form onSubmit={(e) => { e.preventDefault(); run(false); }} noValidate>
                  {demoMode && <p className="mb-4 rounded-lg bg-saffron/10 px-3 py-2 text-sm text-saffron">{t("home.notLive")}</p>}

                  <PlaceSearch id="q" big label={t("hs.label")} placeholder={t("hs.ph")} value={text} onText={setText} near={city}
                    picked={picked} onPick={(s) => { setPicked(s); if (s) { setStreet(s.street ?? ""); setCity(s.city ?? ""); } }} demo={demoMode} />
                  <div className="mt-2 grid gap-x-6 gap-y-2 sm:grid-cols-[1.3fr_1fr]">
                    <AddressField id="street" icon="pin" label={t("hs.street")} placeholder={t("hs.streetPh")} value={street} onChange={(v) => { setStreet(v); if (picked) setPicked(null); }} />
                    <AddressField id="city" icon="city" label={t("hs.city")} placeholder={t("hs.cityPh")} value={city} onChange={(v) => { setCity(v); if (picked) setPicked(null); }} />
                  </div>
                  {picked && <Identity s={picked} onClear={() => { setPicked(null); setText(""); setStreet(""); setCity(""); }} />}

                  {comparing && (
                    <div className="rise mt-5">
                      <p className="mb-1 font-display text-xs font-bold tracking-[0.16em] text-mist">{t("hs.vs")}</p>
                      <div className="grid gap-x-6 gap-y-2 md:grid-cols-[1.4fr_1fr]">
                        <PlaceSearch id="q2" scope="compare" label={t("hs.label2")} placeholder={t("hs.ph2")} value={text2} onText={setText2} near={city2.trim() || city.trim()}
                          picked={picked2} onPick={(s) => { setPicked2(s); if (s?.city) setCity2(s.city); }} demo={demoMode} />
                        <AddressField id="city2" icon="city" label={t("hs.city2")} placeholder={city ? t("hs.addrPh2same") : t("hs.cityPh")} value={city2} onChange={(v) => { setCity2(v); if (picked2) setPicked2(null); }} />
                      </div>
                      {picked2 && <Identity s={picked2} onClear={() => { setPicked2(null); setText2(""); setCity2(""); }} />}
                      <p className="mt-2 text-xs text-mist">{t("hs.vsNote")}</p>
                    </div>
                  )}

                  {error && <p role="alert" className="mt-4 text-sm font-semibold text-chili">{error}</p>}

                  <div className="mt-6 flex flex-col gap-3 sm:flex-row sm:items-center">
                    <button type="submit" className="group inline-flex items-center justify-center gap-2 rounded-full bg-ink px-7 py-3.5 font-display text-base font-bold text-white transition hover:bg-fennel">
                      {t("hs.run")}
                      <svg width="16" height="16" viewBox="0 0 24 24" aria-hidden className="transition-transform group-hover:translate-x-0.5"><path d="M5 12h13M13 6l6 6-6 6" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" /></svg>
                    </button>
                    <button type="button" aria-pressed={comparing} onClick={() => { setComparing((c) => !c); setPicked2(null); setText2(""); setCity2(""); }}
                      className="rounded-full border border-ink/25 px-6 py-3 text-sm font-semibold transition hover:border-ink">
                      {comparing ? t("hs.compareOff") : t("hs.compare")}
                    </button>
                  </div>

                  <details className="group mt-5 text-sm">
                    <summary className="cursor-pointer list-none text-mist hover:text-ink">
                      <span className="underline underline-offset-4">{t("hs.advanced")}</span>
                      <span className="ml-2 text-xs">{radiusLabel(radiusM)}</span>
                    </summary>
                    <fieldset className="mt-3">
                      <legend className="mb-2 text-xs font-semibold text-mist">{t("home.radius")}</legend>
                      <div className="flex flex-wrap gap-2">
                        {CONFIG.radiusOptionsM.map((r) => (
                          <button type="button" key={r} onClick={() => setRadiusM(r)} aria-pressed={radiusM === r}
                            className={`rounded-full border px-3.5 py-1.5 text-sm font-semibold ${radiusM === r ? "border-ink bg-ink text-white" : "border-line bg-white hover:border-ink"}`}>{radiusLabel(r)}</button>
                        ))}
                      </div>
                    </fieldset>
                  </details>
                </form>
              )}
            </div>
            <p className="mt-4 max-w-2xl text-sm text-mist">{t("hs.auto")}</p>
          </div>

          <div className="mx-auto hidden aspect-square w-full max-w-[300px] lg:block"><RadarRings /></div>
        </section>

        {/* ---- Four dimensions ---- */}
        <Pillars />

        {/* ---- Data -> evidence -> decision ---- */}
        <DecisionStatement />

        {/* ---- Illustrative result (demo data) ---- */}
        <Preview onDemo={() => run(true)} />
      </main>
      <footer className="mx-auto max-w-6xl px-4 md:px-8"><p className="border-t border-ink/15 py-6 text-xs text-mist">{t("home.footer")}</p></footer>
    </div>
  );
}
