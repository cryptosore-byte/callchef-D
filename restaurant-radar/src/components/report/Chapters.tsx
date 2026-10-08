"use client";
// The report, in 5 chapters: 1 competition, 2 reputation, 3 SEO & AI visibility, 4 social, 5 what to do.
// Every chapter opens with ONE sentence computed by code from the data, then one or two charts.
// No data = no chart and no sentence (an explicit "not measured" state instead).
import { useState } from "react";
import type { Competitor, RadarResult, ReviewSummary, ThemeStat } from "@/types";
import type { Check } from "@/services/DigitalHealthService";
import { useLocale } from "@/i18n/client";
import { num, stars } from "@/lib/reasons";
import { BattleMode } from "@/components/WarRoom";
import { checkLabel, insightText } from "@/components/DigitalHealth";
import { evidenceText } from "@/lib/evidence";
import { PlanV3 } from "@/components/V3";
import { NONE } from "@/services/BusinessDecisionService";
import { CountUp, EASE, Reveal, Ring } from "./motion";
import { ICONS } from "@/components/home/Pillars";

const MIN_MENTIONS = 5;
const isNone = (c?: string) => !c || Object.values(NONE).includes(c);
const P = (v: number) => Math.round(v * 100);

export function Chapter({ id, n, icon, title, question, headline, children }: { id: string; n: string; icon: keyof typeof ICONS; title: string; question: string; headline?: React.ReactNode; children: React.ReactNode }) {
  return (
    <section id={id} aria-labelledby={`${id}-t`} className="scroll-mt-20 border-t border-ink/15 pt-10">
      <div className="flex items-center gap-3">
        <span className="h-7 w-7 text-fennel" aria-hidden>{ICONS[icon]}</span>
        <p className="font-display text-xs font-bold tracking-[0.18em] text-mist"><span className="text-ink">{n}</span><span className="mx-2 text-ink/30">—</span>{title}</p>
      </div>
      <h2 id={`${id}-t`} className="mt-3 font-display text-3xl font-extrabold leading-tight md:text-4xl">{question}</h2>
      {headline && <p className="mt-3 max-w-3xl text-lg leading-snug md:text-xl">{headline}</p>}
      <div className="mt-7">{children}</div>
    </section>
  );
}

function Panel({ title, sub, children, className = "" }: { title: string; sub?: string; children: React.ReactNode; className?: string }) {
  return (
    <div className={`min-w-0 rounded-[20px] bg-paper p-5 shadow-[0_1px_0_#CBD2CC] md:p-6 ${className}`}>
      <h3 className="font-display text-lg font-bold">{title}</h3>
      {sub && <p className="text-xs text-mist">{sub}</p>}
      <div className="mt-4">{children}</div>
    </div>
  );
}

const Legend = ({ items }: { items: [string, string][] }) => (
  <p className="flex flex-wrap gap-x-4 gap-y-1 text-xs text-mist">{items.map(([c, l]) => <span key={l} className="inline-flex items-center gap-1.5"><span className={`h-2.5 w-2.5 rounded-full ${c}`} aria-hidden />{l}</span>)}</p>
);

// ---- 1. Competition ------------------------------------------------------------------------

export function competitionFacts(r: RadarResult) {
  const rows = [{ id: r.target.id, name: r.target.name, rating: r.target.rating, reviews: r.target.reviewCount, you: true },
    ...r.competitors.map((c) => ({ id: c.restaurant.id, name: c.restaurant.name, rating: c.restaurant.rating, reviews: c.restaurant.reviewCount, you: false }))];
  const byRating = [...rows].sort((a, b) => b.rating - a.rating || b.reviews - a.reviews);
  const rank = byRating.findIndex((x) => x.you) + 1;
  return { rows, byRating, rank, leader: byRating[0] };
}

export function Competition({ r }: { r: RadarResult }) {
  const { t, locale } = useLocale();
  const [sel, setSel] = useState<Competitor | null>(null);
  const { rows, byRating, rank, leader } = competitionFacts(r);
  const avg = r.market.localMarket.avgRating;
  const lo = Math.min(3.5, ...rows.map((x) => x.rating)) - 0.1, hi = 5;
  const x = (v: number) => ((v - lo) / (hi - lo)) * 100;
  const maxReviews = Math.max(...rows.map((x) => x.reviews), 1);
  const byReviews = [...rows].sort((a, b) => b.reviews - a.reviews);
  const pick = (id?: string) => r.competitors.find((c) => c.restaurant.id === id);
  const threat = pick(r.decisions.watch?.restaurantId ?? r.roles?.topThreatId), bench = pick(r.roles?.bestBenchmarkId);
  const headline = rows.length < 2 ? t("rp.c.none")
    : rank === 1 ? t("rp.c.first", { n: rows.length })
    : t("rp.c.rank", { rank, n: rows.length, leader: leader.name, r: stars(leader.rating, locale), you: stars(r.target.rating, locale) });

  return (
    <Chapter id="concurrence" n="01" icon="competition" title={t("pil.competition.name")} question={t("pil.competition.q")} headline={headline}>
      {rows.length < 2 ? <p className="text-mist">{t("warn.noCompetitors")}</p> : (
        <div className="grid grid-cols-1 gap-4 lg:grid-cols-[1.35fr_1fr]">
          <Panel title={t("rp.c.ratingTitle")} sub={t("rp.c.ratingSub", { n: rows.length - 1, radius: r.input.radiusM >= 1000 ? `${r.input.radiusM / 1000} km` : `${r.input.radiusM} m` })}>
            <Reveal>{(seen) => (
              <div className="relative">
                <ul className="space-y-2.5">
                  {byRating.map((row, i) => (
                    <li key={row.id} className="grid grid-cols-[minmax(0,9.5rem)_1fr_2.6rem] items-center gap-3 text-sm">
                      <span className={`truncate ${row.you ? "font-bold" : ""}`} title={row.name}>{row.you ? t("rp.you") : row.name}</span>
                      <span className="relative h-6">
                        <span className="absolute inset-y-1/2 left-0 right-0 h-px bg-ink/10" />
                        <span className={`absolute top-1/2 h-3.5 w-3.5 -translate-x-1/2 -translate-y-1/2 rounded-full ring-2 ring-paper ${row.you ? "bg-ink" : "bg-fennel/45"}`}
                          style={{ left: `${seen ? x(row.rating) : 0}%`, transition: `left .9s ${EASE} ${i * 70}ms` }} title={`${row.name} : ${stars(row.rating, locale)} ★, ${num(row.reviews, locale)} avis`} />
                      </span>
                      <span className={`text-right tabular-nums ${row.you ? "font-bold" : "text-mist"}`}>{stars(row.rating, locale)}</span>
                    </li>
                  ))}
                </ul>
                {avg > lo && (
                  <div className="pointer-events-none absolute inset-y-0 grid w-full grid-cols-[minmax(0,9.5rem)_1fr_2.6rem] gap-3">
                    <span /><span className="relative"><span className="absolute inset-y-0 border-l border-dashed border-saffron" style={{ left: `${x(avg)}%` }} /></span>
                  </div>
                )}
                <div className="mt-2 grid grid-cols-[minmax(0,9.5rem)_1fr_2.6rem] gap-3 text-[11px] text-mist">
                  <span /><span className="flex justify-between"><span>{stars(lo + 0.1, locale)} ★</span><span>5 ★</span></span>
                </div>
              </div>
            )}</Reveal>
            <div className="mt-3"><Legend items={[["bg-ink", t("rp.you")], ["bg-fennel/45", t("rp.c.comp")], ["bg-saffron", t("rp.c.avg", { r: stars(avg, locale) })]]} /></div>
          </Panel>

          <Panel title={t("rp.c.volTitle")} sub={t("rp.c.volSub")}>
            <Reveal>{(seen) => (
              <ul className="space-y-2.5">
                {byReviews.map((row, i) => (
                  <li key={row.id} className="text-sm">
                    <div className="flex justify-between gap-2"><span className={`truncate ${row.you ? "font-bold" : ""}`}>{row.you ? t("rp.you") : row.name}</span><span className="tabular-nums text-mist">{num(row.reviews, locale)}</span></div>
                    <div className="mt-1 h-2 rounded-full bg-ink/[.06]">
                      <div className={`h-2 rounded-full ${row.you ? "bg-ink" : "bg-fennel/45"}`} style={{ width: seen ? `${Math.max(2, (row.reviews / maxReviews) * 100)}%` : 0, transition: `width .9s ${EASE} ${i * 70}ms` }} />
                    </div>
                  </li>
                ))}
              </ul>
            )}</Reveal>
          </Panel>

          {(threat || bench) && (
            <div className="grid gap-3 sm:grid-cols-2 lg:col-span-2">
              {([[threat, "rp.c.watch", "border-chili"], [bench !== threat ? bench : undefined, "rp.c.bench", "border-fennel"]] as const).filter(([c]) => c).map(([c, k, cls]) => {
                const comp = c!;
                const card = r.competitorCards?.[comp.restaurant.id];
                return (
                  <div key={k} className={`rounded-[18px] border-l-4 ${cls} bg-paper p-4`}>
                    <p className="text-xs font-bold uppercase tracking-wide text-mist">{t(k)}</p>
                    <p className="mt-1 font-display text-xl font-bold">{comp.restaurant.name}</p>
                    <p className="text-sm text-mist">{stars(comp.restaurant.rating, locale)} ★ · {t("cc.reviews", { n: comp.restaurant.reviewCount })} · {t("cc.away", { d: comp.distanceM < 1000 ? `${Math.round(comp.distanceM)} m` : `${(comp.distanceM / 1000).toFixed(1)} km` })}</p>
                    {card && <p className="mt-2 text-sm font-semibold">{t("verdict." + card.verdict, { r: stars(card.verdictParams.r, locale), n: card.verdictParams.n })}</p>}
                    {r.battles[comp.restaurant.id] && <button onClick={() => setSel(comp)} className="mt-3 text-sm font-bold underline underline-offset-4">{t("rp.c.compare")}</button>}
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}
      {sel && <BattleMode r={r} c={sel} onClose={() => setSel(null)} />}
    </Chapter>
  );
}

// ---- 2. Reputation -------------------------------------------------------------------------

/** Competitors' reviews pooled per theme (only competitors whose reviews were read). */
function pooled(r: RadarResult) {
  const sums = r.competitors.map((c) => r.summaries[c.restaurant.id]).filter((s): s is ReviewSummary => !!s && s.reviewsAnalyzed > 0);
  const by = new Map<string, { mentions: number; positive: number; negative: number }>();
  for (const s of sums) for (const st of s.stats) {
    const a = by.get(st.theme) ?? { mentions: 0, positive: 0, negative: 0 };
    a.mentions += st.mentions; a.positive += st.positive; a.negative += st.negative; by.set(st.theme, a);
  }
  return { reviews: sums.reduce((n, s) => n + s.reviewsAnalyzed, 0), by };
}

function praisedElsewhere(r: RadarResult) {
  const out: { name: string; theme: string; rate: number; mentions: number }[] = [];
  for (const c of r.competitors) {
    const s = r.summaries[c.restaurant.id];
    const best = s?.stats.filter((x) => x.mentions >= MIN_MENTIONS && x.positiveRate >= 0.7).sort((a, b) => b.positive - a.positive)[0];
    if (best) out.push({ name: c.restaurant.name, theme: best.theme, rate: best.positiveRate, mentions: best.mentions });
  }
  return out.sort((a, b) => b.mentions - a.mentions).slice(0, 3);
}

export function reputationFacts(r: RadarResult) {
  const s = r.summaries[r.target.id];
  const themes = (s?.stats ?? []).filter((x) => x.mentions >= MIN_MENTIONS).sort((a, b) => b.mentions - a.mentions).slice(0, 7);
  const worst = [...themes].filter((x) => x.negativeRate >= 0.35).sort((a, b) => b.negative - a.negative)[0];
  const best = [...themes].filter((x) => x.positiveRate >= 0.6).sort((a, b) => b.positive - a.positive)[0];
  const posShare = s && s.totalMentions ? s.positiveMentions / s.totalMentions : null;
  return { s, themes, worst, best, posShare };
}

export function Reputation({ r }: { r: RadarResult }) {
  const { t, locale } = useLocale();
  const { s, themes, worst, best, posShare } = reputationFacts(r);
  const pool = pooled(r);
  const sig = (x?: ThemeStat) => x?.signals[0] ? ` (« ${t.sig(x.signals[0].word)} » × ${x.signals[0].count})` : "";
  const headline = !s || !themes.length ? t("rp.r.none")
    : worst && best ? t("rp.r.both", { good: t.theme(best.theme), bad: t.theme(worst.theme), p: P(worst.negativeRate) }) + sig(worst)
    : best ? t("rp.r.good", { good: t.theme(best.theme), p: P(best.positiveRate) })
    : worst ? t("rp.r.bad", { bad: t.theme(worst.theme), p: P(worst.negativeRate) }) + sig(worst) : t("rp.r.mixed");
  // You vs them, per theme: share of NEGATIVE mentions (only where both sides have enough mentions).
  const vs = themes.map((x) => ({ x, o: pool.by.get(x.theme) })).filter((v) => v.o && v.o.mentions >= MIN_MENTIONS)
    .map((v) => ({ theme: v.x.theme, you: v.x.negativeRate, them: v.o!.negative / v.o!.mentions, n: v.x.mentions, m: v.o!.mentions }));
  const gap = [...vs].sort((a, b) => (b.you - b.them) - (a.you - a.them))[0];
  const elsewhere = praisedElsewhere(r);

  return (
    <Chapter id="reputation" n="02" icon="reputation" title={t("pil.reputation.name")} question={t("pil.reputation.q")} headline={headline}>
      {!s || !themes.length ? <p className="text-mist">{t("ri.noPos")}</p> : (
        <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
          <Panel title={t("rp.r.yoursTitle")} sub={t("rp.r.sample", { n: s.reviewsAnalyzed, m: s.totalMentions })}>
            {posShare !== null && (
              <div className="mb-5">
                <div className="flex items-baseline gap-2"><span className="font-display text-4xl font-extrabold text-fennel"><CountUp value={P(posShare)} suffix="%" locale={locale} /></span><span className="text-sm text-mist">{t("rp.r.posShare")}</span></div>
                <Reveal>{(seen) => (
                  <div className="mt-2 flex h-2.5 gap-[2px] overflow-hidden rounded-full">
                    {[[s.positiveMentions, "bg-fennel"], [s.totalMentions - s.positiveMentions - s.negativeMentions, "bg-ink/15"], [s.negativeMentions, "bg-chili"]].map(([v, c], i) => (
                      <span key={i} className={`${c} h-full`} style={{ width: seen ? `${(Number(v) / s.totalMentions) * 100}%` : 0, transition: `width 1s ${EASE}` }} />
                    ))}
                  </div>
                )}</Reveal>
              </div>
            )}
            {/* Diverging bars: complaints to the left, praise to the right, per theme. */}
            <Reveal>{(seen) => (
              <ul className="space-y-2">
                {themes.map((x, i) => (
                  <li key={x.theme} className="grid grid-cols-[1fr_6.5rem_1fr] items-center gap-2 text-sm">
                    <span className="flex h-5 justify-end rounded-l-full bg-ink/[.04]">
                      <span className="flex h-5 items-center justify-start rounded-l-full bg-chili pl-1.5 text-[11px] font-semibold text-white" style={{ width: seen ? `${x.negativeRate * 100}%` : 0, transition: `width .9s ${EASE} ${i * 60}ms` }}>{x.negativeRate >= 0.3 ? `${P(x.negativeRate)}%` : ""}</span>
                    </span>
                    <span className={`text-center leading-tight ${x.theme === worst?.theme ? "font-bold text-chili" : x.theme === best?.theme ? "font-bold text-fennel" : ""}`}>{t.theme(x.theme)}<span className="block text-[10px] font-normal text-mist">{t("ri.mentions", { n: x.mentions })}</span></span>
                    <span className="flex h-5 rounded-r-full bg-ink/[.04]">
                      <span className="flex h-5 items-center justify-end rounded-r-full bg-fennel pr-1.5 text-[11px] font-semibold text-white" style={{ width: seen ? `${x.positiveRate * 100}%` : 0, transition: `width .9s ${EASE} ${i * 60}ms` }}>{x.positiveRate >= 0.3 ? `${P(x.positiveRate)}%` : ""}</span>
                    </span>
                  </li>
                ))}
              </ul>
            )}</Reveal>
            <div className="mt-3"><Legend items={[["bg-chili", t("rp.r.neg")], ["bg-fennel", t("rp.r.pos")]]} /></div>
          </Panel>

          <Panel title={t("rp.r.vsTitle")} sub={pool.reviews ? t("rp.r.vsSub", { n: pool.reviews }) : t("rp.r.vsNone")}>
            {vs.length > 0 ? (
              <>
                {gap && gap.you - gap.them >= 0.1 && (
                  <p className="mb-4 rounded-xl bg-chili/[.07] px-3 py-2 text-sm"><b>{t.theme(gap.theme)}</b> : {t("rp.r.gap", { you: P(gap.you), them: P(gap.them) })}</p>
                )}
                {/* Dumbbell: share of complaints, you vs competitors, same 0-100% scale. */}
                <Reveal>{(seen) => (
                  <ul className="space-y-3">
                    {vs.map((v, i) => {
                      const a = v.you * 100, b = v.them * 100;
                      return (
                        <li key={v.theme} className="grid grid-cols-[6.5rem_1fr] items-center gap-3 text-sm">
                          <span className="truncate">{t.theme(v.theme)}</span>
                          <span className="relative h-5" title={t("rp.r.dumbTip", { you: P(v.you), them: P(v.them), n: v.n, m: v.m })}>
                            <span className="absolute inset-y-1/2 left-0 right-0 h-px bg-ink/10" />
                            <span className={`absolute top-1/2 h-[3px] -translate-y-1/2 rounded-full ${a > b ? "bg-chili/40" : "bg-fennel/40"}`} style={{ left: `${Math.min(a, b)}%`, width: seen ? `${Math.abs(a - b)}%` : 0, transition: `width .8s ${EASE} ${300 + i * 60}ms` }} />
                            <span className="absolute top-1/2 h-3 w-3 -translate-x-1/2 -translate-y-1/2 rounded-full bg-mist ring-2 ring-paper" style={{ left: `${b}%` }} />
                            <span className="absolute top-1/2 h-3.5 w-3.5 -translate-x-1/2 -translate-y-1/2 rounded-full bg-ink ring-2 ring-paper" style={{ left: `${seen ? a : b}%`, transition: `left .8s ${EASE} ${300 + i * 60}ms` }} />
                          </span>
                        </li>
                      );
                    })}
                  </ul>
                )}</Reveal>
                <div className="mt-2 grid grid-cols-[6.5rem_1fr] gap-3 text-[11px] text-mist"><span /><span className="flex justify-between"><span>0%</span><span>{t("rp.r.axis")}</span><span>100%</span></span></div>
                <div className="mt-3"><Legend items={[["bg-ink", t("rp.you")], ["bg-mist", t("rp.r.them")]]} /></div>
              </>
            ) : <p className="text-sm text-mist">{t("rp.r.vsNone")}</p>}

            {elsewhere.length > 0 && (
              <div className="mt-6 border-t border-line pt-4">
                <p className="text-xs font-bold uppercase tracking-wide text-mist">{t("rp.r.lovedThere")}</p>
                <ul className="mt-2 space-y-1.5 text-sm">
                  {elsewhere.map((e) => <li key={e.name}><b>{e.name}</b> : {t("rp.r.loved", { theme: t.theme(e.theme).toLowerCase(), p: P(e.rate), n: e.mentions })}</li>)}
                </ul>
              </div>
            )}
          </Panel>
        </div>
      )}
    </Chapter>
  );
}

// ---- 3. SEO & AI visibility ------------------------------------------------------------------

const STATUS_CLS = { OK: "bg-fennel", WEAK: "bg-saffron", MISSING: "bg-chili", UNKNOWN: "bg-line" } as const;
const ORDER = { MISSING: 0, WEAK: 1, OK: 2, UNKNOWN: 3 } as const;

function CheckList({ checks }: { checks: Check[] }) {
  const { t } = useLocale();
  const list = [...checks].sort((a, b) => ORDER[a.status] - ORDER[b.status]).slice(0, 6);
  return (
    <ul className="space-y-1.5 text-sm">
      {list.map((c, i) => (
        <li key={c.key + i} className="flex items-center justify-between gap-3">
          <span className="flex min-w-0 items-center gap-2"><span aria-hidden className={`h-2 w-2 shrink-0 rounded-full ${STATUS_CLS[c.status]}`} /><span className="truncate">{checkLabel(t, c)}</span></span>
          <span className="shrink-0 text-xs text-mist">{t("chk." + c.status)}</span>
        </li>
      ))}
    </ul>
  );
}

export function Visibility({ r }: { r: RadarResult }) {
  const { t } = useLocale();
  const d = r.digital;
  if (!d) return null;
  const seo = d.visibility, ai = d.ai;
  const weakest = [seo, ai].filter((x) => x.insight)[0];
  const headline = seo.score === null && ai.score === null ? t("rp.v.none") : weakest ? insightText(t, weakest.insight) : t("rp.v.ok");
  return (
    <Chapter id="visibilite" n="03" icon="visibility" title={t("pil.visibility.name")} question={t("pil.visibility.q")} headline={headline}>
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        <Panel title={t("pil.visibility.tag1")} sub={t("rp.v.seoSub")}>
          <div className="grid grid-cols-1 items-center gap-5 sm:grid-cols-[auto_minmax(0,1fr)]">
            <Ring value={seo.score} label={t("rp.v.seo")} sub={seo.score === null ? t("health.notMeasured") : t("dc." + seo.dataConfidence)} />
            <CheckList checks={seo.checks} />
          </div>
          {seo.search.status === "CONNECTED" && seo.search.results.length > 0 && (
            <div className="mt-5 border-t border-line pt-4 text-sm">
              <p className="text-xs font-bold uppercase tracking-wide text-mist">{t("vis.searchTitle")}</p>
              <ul className="mt-1 space-y-0.5">{seo.search.results.map((q) => <li key={q.query} className="flex justify-between gap-2"><span>« {q.query} »</span><span className="font-semibold">{q.rank !== null ? t("vis.rank", { r: q.rank }) : t("vis.notInTop", { n: seo.search.topN })}</span></li>)}</ul>
            </div>
          )}
        </Panel>
        <Panel title={t("pil.visibility.tag2")} sub={t("pil.visibility.note")}>
          <div className="grid grid-cols-1 items-center gap-5 sm:grid-cols-[auto_minmax(0,1fr)]">
            <Ring value={ai.score} label={t("rp.v.geo")} sub={ai.score === null ? t("health.notMeasured") : t("dc." + ai.dataConfidence)} />
            <CheckList checks={ai.checks} />
          </div>
        </Panel>
      </div>
    </Chapter>
  );
}

// ---- 4. Social -------------------------------------------------------------------------------

export function Social({ r }: { r: RadarResult }) {
  const { t, locale } = useLocale();
  const so = r.digital?.social;
  const connected = !!so && so.score !== null && so.profile?.status === "CONNECTED";
  const p = so?.profile;
  const posts30 = p?.recentPosts?.filter((x) => Date.now() - new Date(x.date).getTime() < 30 * 86_400_000).length;
  return (
    <Chapter id="reseaux" n="04" icon="social" title={t("pil.social.name")} question={t("pil.social.q")}
      headline={connected ? (so!.insight ? insightText(t, so!.insight) : t("rp.s.ok")) : t("rp.s.none")}>
      {connected ? (
        <div className="grid gap-4 md:grid-cols-[auto_1fr]">
          <Panel title={`@${p!.username}`} sub={t("pil.social.tag1")}><Ring value={so!.score} label={t("rp.s.score")} sub={t("dc." + so!.dataConfidence)} /></Panel>
          <div className="grid gap-3 sm:grid-cols-3">
            {[
              [t("rp.s.followers"), p!.followers, 0, "", t("rp.s.followersNote")],
              [t("rp.s.er"), (so!.engagementRate ?? 0) * 100, 1, " %", t("rp.s.erNote")],
              [t("rp.s.posts"), posts30, 0, "", t("rp.s.postsNote")],
            ].filter((x) => x[1] !== undefined).map(([l, v, dec, suf, note]) => (
              <div key={l as string} className="rounded-[20px] bg-paper p-5 shadow-[0_1px_0_#CBD2CC]">
                <p className="text-xs font-bold uppercase tracking-wide text-mist">{l}</p>
                <p className="mt-2 font-display text-4xl font-extrabold"><CountUp value={Number(v)} decimals={Number(dec)} suffix={String(suf)} locale={locale} /></p>
                <p className="mt-1 text-xs text-mist">{note}</p>
              </div>
            ))}
          </div>
        </div>
      ) : (
        <div className="rounded-[20px] border border-dashed border-ink/25 p-6 text-sm">
          <p className="font-semibold">{t("src." + (p?.status ?? "NOT_CONNECTED"))}</p>
          <p className="mt-1 text-mist">{t("rp.s.noneDetail")}</p>
        </div>
      )}
    </Chapter>
  );
}

// ---- 5. What to do --------------------------------------------------------------------------

export function Action({ r, onStart, children }: { r: RadarResult; onStart: (type: string) => Promise<void>; children?: React.ReactNode }) {
  const { t } = useLocale();
  const [busy, setBusy] = useState(false);
  const active = r.continuous?.active;
  const test = r.decisions.bestTest;
  const type = active?.type ?? (!isNone(test?.choice) ? test!.choice : undefined);
  const opp = (r.opportunities ?? []).find((o) => o.experiment === type);
  const ev = (active ? opp?.evidenceIds : test?.supportingEvidenceIds)?.slice(0, 3) ?? [];
  return (
    <Chapter id="action" n="05" icon="competition" title={t("rp.a.name")} question={t("rp.a.q")}>
      <div className="overflow-hidden rounded-[22px] bg-ink text-white">
        <div className="p-6 md:p-8">
          <p className="font-display text-xs font-bold tracking-[0.18em] text-[#9FD3B8]">{active ? t("today.activeTest").toUpperCase() : t("pv.testLabel")}</p>
          {type ? (
            <>
              <p className="mt-3 font-display text-3xl font-extrabold leading-tight md:text-4xl">{t("dopt." + type)}</p>
              <p className="mt-3 max-w-3xl text-white/75">{t("exp.hyp." + type)}</p>
              {active ? <p className="mt-2 text-sm text-white/60">{t("today.progress", { d: Math.round(active.progress * 100) })}</p>
                : opp && <p className="mt-2 text-sm text-white/60">{t("dec.cost", { c: t("cost." + opp.cost) })} · {opp.reversible ? t("dec.reversible") : t("dec.irreversible")} · {t("dec.duration", { w: opp.weeksToTest })}</p>}
              {ev.length > 0 && (
                <ul className="mt-5 space-y-1.5 border-t border-white/10 pt-4 text-sm text-white/85">
                  {ev.map((id) => { const e = r.evidence?.find((x) => x.id === id); return e ? <li key={id} className="flex gap-2"><span className="text-[#9FD3B8]">→</span><EvidenceLine r={r} id={id} /></li> : null; })}
                </ul>
              )}
              <div className="mt-5 flex flex-wrap items-center gap-3">
                {!active && <button disabled={busy} onClick={async () => { setBusy(true); try { await onStart(type); } finally { setBusy(false); } }} className="rounded-full bg-white px-5 py-2.5 text-sm font-bold text-ink transition hover:bg-[#9FD3B8] disabled:opacity-50">{busy ? t("today.starting") : t("today.startTest")}</button>}
                <span className="text-xs text-white/50">{t("exp.todo." + type, { w: opp?.weeksToTest ?? 4 })}</span>
              </div>
            </>
          ) : <p className="mt-3 font-display text-2xl font-bold">{t("planv3.test.none")}</p>}
        </div>
      </div>
      <div className="mt-4"><PlanV3 r={r} compact /></div>
      {children}
    </Chapter>
  );
}

function EvidenceLine({ r, id }: { r: RadarResult; id: string }) {
  const { t } = useLocale();
  return <span>{evidenceText(t, r.evidence!.find((x) => x.id === id)!)}</span>;
}
