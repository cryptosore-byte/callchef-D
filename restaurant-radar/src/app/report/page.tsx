"use client";
import Link from "next/link";
import { useRef, useState } from "react";
import { toPng } from "html-to-image";
import { ShareCard } from "@/components/ShareCard";
import { Logo } from "@/components/ui";
import { useRadarResult } from "@/lib/useRadarResult";
import { LangSwitch, useT } from "@/i18n/client";

export default function ReportPage() {
  const { result, error } = useRadarResult();
  const t = useT();
  const ref = useRef<HTMLDivElement>(null);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);

  async function download() {
    if (!ref.current) return;
    setBusy(true); setMsg(null);
    try {
      const url = await toPng(ref.current, { pixelRatio: 2, cacheBust: true });
      const a = document.createElement("a");
      a.href = url; a.download = "restaurant-radar-report.png"; a.click();
    } catch { setMsg(t("report.imgError")); }
    setBusy(false);
  }

  return (
    <main className="mx-auto flex min-h-screen max-w-3xl flex-col items-center px-5 py-6">
      <header className="flex w-full items-center justify-between"><Logo /><div className="flex items-center gap-3"><LangSwitch /><Link href="/radar" className="text-sm font-bold underline">{t("common.back")}</Link></div></header>
      <div className="mt-8 flex w-full flex-1 flex-col items-center gap-5">
        {error && <p role="alert" className="font-semibold text-chili">{error === "network" ? t("home.errNetwork") : error}</p>}
        {!result && !error && <p className="text-mist">{t("report.loading")}</p>}
        {result && (
          <>
            <ShareCard ref={ref} r={result} />
            <div className="flex flex-wrap justify-center gap-3">
              <button onClick={download} disabled={busy} className="rounded-lg bg-ink px-4 py-2.5 font-display font-bold text-white disabled:opacity-60">{busy ? t("report.creating") : t("report.download")}</button>
            </div>
            {msg && <p className="text-sm text-chili">{msg}</p>}
            <p className="max-w-md text-center text-xs text-mist">{t("report.note")}</p>
          </>
        )}
      </div>
    </main>
  );
}
