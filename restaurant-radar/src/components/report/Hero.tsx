"use client";
import type { RadarResult } from "@/types";
import { useLocale } from "@/i18n/client";
import { num, stars } from "@/lib/reasons";
import { CountUp } from "./motion";
import { competitionFacts, reputationFacts } from "./Chapters";
import { NONE } from "@/services/BusinessDecisionService";

const CHAPTERS = [["concurrence", "01", "pil.competition.short"], ["reputation", "02", "pil.reputation.short"], ["visibilite", "03", "pil.visibility.short"], ["reseaux", "04", "pil.social.short"], ["action", "05", "rp.a.short"]] as const;

/** Identity + 4 headline numbers (one per chapter) + the decision, readable in 5 seconds. */
export function Hero({ r }: { r: RadarResult }) {
  const { t, locale } = useLocale();
  const { rows, rank } = competitionFacts(r);
  const { posShare, worst } = reputationFacts(r);
  const d = r.digital;
  const test = r.continuous?.active?.type ?? (r.decisions.bestTest && !Object.values(NONE).includes(r.decisions.bestTest.choice) ? r.decisions.bestTest.choice : undefined);
  const tiles: { id: string; n: string; label: string; value: React.ReactNode; note: string }[] = [
    { id: "concurrence", n: "01", label: t("pil.competition.short"), value: rows.length > 1 ? <><CountUp value={rank} /><span className="text-2xl text-mist">/{rows.length}</span></> : "–", note: rows.length > 1 ? t("rp.h.rank") : t("rp.c.none") },
    { id: "reputation", n: "02", label: t("pil.reputation.short"), value: posShare !== null ? <CountUp value={Math.round(posShare * 100)} suffix="%" locale={locale} /> : "–", note: worst ? t("rp.h.worst", { theme: t.theme(worst.theme).toLowerCase() }) : t("rp.r.posShare") },
    { id: "visibilite", n: "03", label: t("pil.visibility.short"), value: d?.visibility.score != null ? <><CountUp value={d.visibility.score} /><span className="text-2xl text-mist">/100</span></> : "–", note: d?.ai.score != null ? t("rp.h.geo", { n: d.ai.score }) : t("health.notMeasured") },
    { id: "reseaux", n: "04", label: t("pil.social.short"), value: d?.social.score != null ? <><CountUp value={d.social.score} /><span className="text-2xl text-mist">/100</span></> : "–", note: d?.social.score != null ? t("pil.social.tag1") : t("rp.h.notConnected") },
  ];
  return (
    <section className="pt-2">
      <p className="text-sm text-mist">{r.target.address}</p>
      <h1 className="mt-1 font-display text-4xl font-extrabold leading-[1.02] tracking-[-0.02em] md:text-6xl">{r.target.name}</h1>
      <p className="mt-2 text-mist">{t("stand.google", { r: stars(r.target.rating, locale), n: num(r.target.reviewCount, locale) })}</p>

      <ul className="mt-8 grid grid-cols-2 border-y border-ink/15 lg:grid-cols-4">
        {tiles.map((x, i) => (
          <li key={x.id} className={`border-ink/15 py-5 ${i % 2 ? "border-l pl-4 sm:pl-6" : "pr-4"} ${i >= 2 ? "border-t lg:border-t-0" : ""} ${i === 2 ? "lg:border-l lg:pl-6" : ""}`}>
            <a href={`#${x.id}`} className="group block">
              <p className="font-display text-[11px] font-bold tracking-[0.16em] text-mist"><span className="text-ink">{x.n}</span> — {x.label}</p>
              <p className="mt-2 font-display text-5xl font-extrabold leading-none">{x.value}</p>
              <p className="mt-2 text-sm text-mist group-hover:text-ink">{x.note}</p>
            </a>
          </li>
        ))}
      </ul>

      <a href="#action" className="group mt-4 flex items-center justify-between gap-4 rounded-[20px] bg-ink px-5 py-4 text-white transition hover:bg-fennel md:px-6">
        <span><span className="block font-display text-[11px] font-bold tracking-[0.16em] text-[#9FD3B8]">05 — {t("pv.testLabel")}</span><span className="mt-1 block font-display text-xl font-bold md:text-2xl">{test ? t("dopt." + test) : t("planv3.test.none")}</span></span>
        <span aria-hidden className="text-2xl transition-transform group-hover:translate-x-1">→</span>
      </a>
    </section>
  );
}

/** Sticky chapter navigation. */
export function ChapterNav() {
  const { t } = useLocale();
  return (
    <nav aria-label={t("rp.nav")} className="sticky top-0 z-30 -mx-4 border-b border-ink/10 bg-linen/90 px-4 backdrop-blur md:-mx-8 md:px-8">
      <ol className="flex gap-5 overflow-x-auto py-3 text-sm font-semibold [scrollbar-width:none]">
        {CHAPTERS.map(([id, n, k]) => <li key={id} className="shrink-0"><a href={`#${id}`} className="text-mist hover:text-ink"><span className="tabular-nums text-ink">{n}</span> {t(k)}</a></li>)}
      </ol>
    </nav>
  );
}
