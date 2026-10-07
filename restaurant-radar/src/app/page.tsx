"use client";
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { Logo } from "@/components/ui";
import { LangSwitch, useLocale } from "@/i18n/client";
import { radiusLabel } from "@/lib/labels";
import { CONFIG } from "@/config";
import { STORAGE_KEY } from "@/lib/useRadarResult";
import { startScan } from "@/lib/scanJob";

export default function Home() {
  const router = useRouter();
  const { t, locale } = useLocale();
  const [name, setName] = useState("");
  const [address, setAddress] = useState("");
  const [radiusM, setRadiusM] = useState(1000);
  const [live, setLive] = useState<boolean | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => { fetch("/api/radar").then((r) => r.json()).then((d) => setLive(!!d.live)).catch(() => setLive(false)); }, []);

  async function run(demo: boolean) {
    setError(null);
    const body = { ...(demo ? { name: "Maison Brasero", address: "Marseille", radiusM: 1000, demo: true } : { name: name.trim(), address: address.trim(), radiusM, demo: live === false }), locale };
    if (!demo && !body.name) { setError(t("home.errName")); return; }
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
    <main className="mx-auto flex min-h-screen max-w-5xl flex-col px-5 py-6 md:px-8">
      <header className="flex items-center justify-between"><Logo /><LangSwitch /></header>

      <section className="grid flex-1 items-center gap-10 py-10 md:grid-cols-[1.1fr_1fr] md:py-16">
        <div>
          <h1 className="text-4xl font-extrabold leading-[1.05] md:text-6xl">{t("home.h1a")}<br />{t("home.h1b")}</h1>
          <p className="mt-5 max-w-md text-lg text-mist">{t("home.sub")}</p>
          <ul className="mt-6 space-y-1.5 text-sm text-mist">
            <li>{t("home.b1")}</li>
            <li>{t("home.b2")}</li>
          </ul>
        </div>

        <div className="rise rounded-2xl border border-line bg-paper p-5 shadow-[0_1px_0_#CBD2CC] md:p-6">
          {busy ? (
            <div aria-live="polite" className="py-4">
              <p className="font-display text-xl font-bold">{t("home.running")}</p>
            </div>
          ) : (
            <form onSubmit={(e) => { e.preventDefault(); run(false); }} className="space-y-4" noValidate>
              {live === false && (
                <p className="rounded-lg bg-saffron/10 px-3 py-2 text-sm text-saffron">{t("home.notLive")}</p>
              )}
              <div>
                <label htmlFor="name" className="mb-1 block text-sm font-semibold">{t("home.name")}</label>
                <input id="name" value={name} onChange={(e) => setName(e.target.value)} placeholder={t("home.namePh")} className="w-full rounded-lg border border-line bg-white px-3 py-2.5 outline-none focus:border-ink" />
              </div>
              <div>
                <label htmlFor="addr" className="mb-1 block text-sm font-semibold">{t("home.addr")}</label>
                <input id="addr" value={address} onChange={(e) => setAddress(e.target.value)} placeholder={t("home.addrPh")} className="w-full rounded-lg border border-line bg-white px-3 py-2.5 outline-none focus:border-ink" />
              </div>
              <fieldset>
                <legend className="mb-1 text-sm font-semibold">{t("home.radius")}</legend>
                <div className="grid grid-cols-4 gap-2">
                  {CONFIG.radiusOptionsM.map((r) => (
                    <button type="button" key={r} onClick={() => setRadiusM(r)} aria-pressed={radiusM === r}
                      className={`rounded-lg border px-2 py-2 text-sm font-semibold ${radiusM === r ? "border-ink bg-ink text-white" : "border-line bg-white hover:border-ink"}`}>{radiusLabel(r)}</button>
                  ))}
                </div>
              </fieldset>
              {error && <p role="alert" className="text-sm font-semibold text-chili">{error}</p>}
              <button type="submit" className="w-full rounded-lg bg-ink py-3 font-display text-base font-bold text-white hover:bg-ink/90">{t("home.run")}</button>
              <button type="button" onClick={() => run(true)} className="w-full rounded-lg border border-line py-2.5 text-sm font-semibold text-ink hover:border-ink">{t("home.demoBtn")}</button>
            </form>
          )}
        </div>
      </section>
      <footer className="pb-4 text-xs text-mist">{t("home.footer")}</footer>
    </main>
  );
}
