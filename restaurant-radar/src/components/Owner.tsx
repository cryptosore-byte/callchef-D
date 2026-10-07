"use client";
// Owner view (continuous intelligence). Hard limits: 3 key facts, 3 changes, 3 scenarios, ONE test, ONE watch.
// Every insight follows WHAT / WHY / PROOF / WHAT TO DO. Complexity stays in the engine.
import { useState } from "react";
import type { RadarResult } from "@/types";
import type { Experiment, Measurement } from "@/services/continuous/types";
import type { MarketChange } from "@/services/continuous/MarketChangeService";
import { NONE } from "@/services/BusinessDecisionService";
import { useLocale } from "@/i18n/client";
import type { T } from "@/i18n";
import { evidenceText } from "@/lib/evidence";
import { num, stars } from "@/lib/reasons";
import { EvidenceList, Tier } from "./V3";

const isNone = (c?: string) => !c || Object.values(NONE).includes(c);
const lowerFirst = (s: string) => s.charAt(0).toLowerCase() + s.slice(1);

/** Localized params for change sentences. */
export function changeText(t: T, c: MarketChange, key: "title" | "detail") {
  const p: Record<string, string | number> = {};
  for (const [k, v] of Object.entries(c.params)) p[k] = k === "theme" ? t("themeRef." + v) : k === "cuisine" ? (v ? t("cuisine." + v) : "") : ["a", "b"].includes(k) && /RATING/.test(c.type) ? stars(v, t.locale) : num(v, t.locale);
  return t(`chg.${c.type}${key === "detail" ? ".d" : ""}`, p);
}

export function formatMeasure(t: T, m?: Measurement | null) {
  if (!m || m.value === null) return t("exp.notMeasured");
  return t("unit." + m.unit, { v: num(m.value, t.locale) });
}

/** WHAT / WHY / PROOF / WHAT TO DO. */
function Insight({ what, why, proof, todo, r }: { what: string; why?: string; proof?: string[]; todo?: string; r: RadarResult }) {
  const { t } = useLocale();
  return (
    <dl className="grid gap-2 text-sm sm:grid-cols-[110px_1fr]">
      <dt className="font-bold uppercase tracking-wide text-mist">{t("ins.what")}</dt><dd className="font-semibold">{what}</dd>
      {why && <><dt className="font-bold uppercase tracking-wide text-mist">{t("ins.why")}</dt><dd>{why}</dd></>}
      {proof && proof.length > 0 && <><dt className="font-bold uppercase tracking-wide text-mist">{t("ins.proof")}</dt><dd><EvidenceList r={r} ids={proof} /></dd></>}
      {todo && <><dt className="font-bold uppercase tracking-wide text-mist">{t("ins.todo")}</dt><dd className="font-semibold">{todo}</dd></>}
    </dl>
  );
}

// ---- 1. What you need to know -------------------------------------------------------------

function watchText(t: T, r: RadarResult): string | null {
  const w = r.decisions.watch;
  if (!w || isNone(w.choice)) return null;
  if (w.restaurantId) {
    const ch = r.continuous?.changes.find((c) => c.placeId === w.restaurantId);
    const name = r.competitors.find((c) => c.restaurant.id === w.restaurantId)?.restaurant.name ?? w.choice;
    return ch ? changeText(t, ch, "title") : t("today.watchCompetitor", { name });
  }
  return t("today.watchSignal", { theme: t("themeRef." + w.choice.replace("SIGNAL_", "")) });
}

export function Today({ r, onStart }: { r: RadarResult; onStart: (type: string) => Promise<void> }) {
  const { t } = useLocale();
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const adv = r.advantage;
  const strength = adv ? t("adv." + adv.key) : !isNone(r.decisions.dontTouch?.choice) ? t("dopt." + r.decisions.dontTouch!.choice) : null;
  const gapOpp = (r.opportunities ?? []).find((o) => o.experiment !== r.continuous?.active?.type);
  const gapEv = gapOpp && r.evidence?.find((e) => e.id === gapOpp.evidenceIds[0]);
  const watch = watchText(t, r);
  const active = r.continuous?.active;
  const test = r.decisions.bestTest;
  const testType = active?.type ?? (!isNone(test?.choice) ? test!.choice : undefined);
  const opp = (r.opportunities ?? []).find((o) => o.experiment === testType);
  const facts: [string, string, string][] = [
    ["bg-fennel", t("today.strength"), strength ?? t("today.none")],
    ["bg-saffron", t("today.gap"), gapEv ? evidenceText(t, gapEv) : t("today.none")],
    ["bg-chili", t("today.watch"), watch ?? t("today.none")],
  ];
  return (
    <section aria-labelledby="today" className="space-y-5">
      <div>
        <p className="text-sm text-mist">{r.target.address}</p>
        <h1 className="mt-1 font-display text-4xl font-extrabold leading-tight md:text-6xl">{r.target.name}</h1>
        <p className="mt-1 text-sm text-mist">{t("stand.google", { r: stars(r.target.rating, t.locale), n: num(r.target.reviewCount, t.locale) })}</p>
      </div>
      <div className="rounded-2xl border border-line bg-paper p-5">
        <h2 id="today" className="text-xs font-extrabold uppercase tracking-widest text-mist">{t("today.title")}</h2>
        <ul className="mt-3 space-y-3">
          {facts.map(([dot, k, v]) => (
            <li key={k} className="flex gap-3"><span aria-hidden className={`mt-1.5 h-3 w-3 shrink-0 rounded-full ${dot}`} /><div><p className="text-xs font-bold uppercase tracking-wide text-mist">{k}</p><p className="font-display text-lg font-bold leading-snug">{v}</p></div></li>
          ))}
        </ul>
        {r.discovery && <p className="mt-4 rounded-xl bg-saffron/10 p-3 text-sm"><b>{t("disc.title")} :</b> {evidenceText(t, r.evidence!.find((e) => e.id === r.discovery!.evidenceIds[r.discovery!.evidenceIds.length - 1])!)}</p>}
      </div>
      <div className="rounded-2xl bg-ink p-5 text-white md:p-6">
        <p className="text-xs font-extrabold uppercase tracking-widest text-white/60">{active ? t("today.activeTest") : t("today.testWeRun")}</p>
        {testType ? (
          <>
            <p className="mt-1 font-display text-2xl font-extrabold leading-tight md:text-3xl">{t("dopt." + testType)}</p>
            {active
              ? <p className="mt-1 text-sm text-white/70">{t("today.progress", { d: Math.round(active.progress * 100) })}{r.decisions.thisWeek?.choice === "CONTINUE_EXPERIMENT" ? " " + t("today.keepGoing") : ""}</p>
              : opp && <p className="mt-1 text-sm text-white/70">{t("dec.cost", { c: t("cost." + opp.cost) })} · {opp.reversible ? t("dec.reversible") : t("dec.irreversible")} · {t("dec.duration", { w: opp.weeksToTest })}</p>}
            <div className="mt-3 flex flex-wrap gap-2">
              <button onClick={() => setOpen(!open)} aria-expanded={open} className="rounded-lg bg-white px-3.5 py-2 text-sm font-bold text-ink">{t("today.whyTest")}</button>
              {!active && <button disabled={busy} onClick={async () => { setBusy(true); try { await onStart(testType); } finally { setBusy(false); } }} className="rounded-lg border border-white/40 px-3.5 py-2 text-sm font-bold disabled:opacity-50">{busy ? t("today.starting") : t("today.startTest")}</button>}
            </div>
            {open && (
              <div className="mt-4 rounded-xl bg-white p-4 text-ink">
                <Insight r={r} what={t("why.what." + testType)} why={t("exp.hyp." + testType)} proof={(active ? opp?.evidenceIds : test?.supportingEvidenceIds)?.slice(0, 3)} todo={t("exp.todo." + testType, { w: opp?.weeksToTest ?? 4 }) + " " + t("exp.measure." + testType)} />
              </div>
            )}
          </>
        ) : <p className="mt-1 font-display text-xl font-bold">{t("planv3.test.none")}</p>}
      </div>
    </section>
  );
}

// ---- 2. What changed ----------------------------------------------------------------------

const TONE = { good: "text-fennel", bad: "text-chili", watch: "text-saffron" } as const;

export function Changes({ r }: { r: RadarResult }) {
  const { t, locale } = useLocale();
  const c = r.continuous;
  if (!c) return null;
  return (
    <section aria-labelledby="chg" className="rounded-2xl border border-line bg-paper p-5">
      <h2 id="chg" className="font-display text-2xl font-bold">{t("chg.title")}</h2>
      {c.previousScanAt && <p className="text-xs text-mist">{t("chg.since", { d: new Date(c.previousScanAt).toLocaleDateString(locale) })}</p>}
      {c.isFirstScan || !c.previousScanAt
        ? <p className="mt-2 text-sm">{t("chg.first")}</p>
        : c.changes.length === 0
          ? <p className="mt-2 text-sm">{t("chg.none")}</p>
          : (
            <ol className="mt-3 space-y-3">
              {c.changes.map((x, i) => (
                <li key={i} className="flex gap-3">
                  <span className="font-display text-2xl font-extrabold text-mist">{String(i + 1).padStart(2, "0")}</span>
                  <div><p className={`text-xs font-bold uppercase tracking-wide ${TONE[x.tone]}`}>{t("chgk." + x.type)}</p><p className="font-semibold">{changeText(t, x, "title")}</p><p className="text-sm text-mist">{changeText(t, x, "detail")}</p></div>
                </li>
              ))}
            </ol>
          )}
      {!c.isFirstScan && c.previousScanAt && <div className="mt-4 border-t border-line pt-3"><p className="text-xs font-bold uppercase tracking-wide text-mist">{t("chg.meaningTitle")}</p><p className="font-semibold">{t(c.meaning)}</p></div>}
    </section>
  );
}

// ---- 3. Your next move -------------------------------------------------------------------

function ActiveTest({ r, e, onLog, onStop }: { r: RadarResult; e: Experiment & { progress: number }; onLog: (v: number) => Promise<void>; onStop: () => Promise<void> }) {
  const { t, locale } = useLocale();
  const [v, setV] = useState("");
  const owner = e.ownerEntries !== undefined && ["EXTEND_WEEKEND_HOURS", "TEST_VALUE_BUNDLE", "TEST_MENU_RESTRUCTURE"].includes(e.type);
  const sim = r.continuous?.simulation;
  return (
    <div className="rounded-2xl border-2 border-saffron bg-paper p-4">
      <p className="text-xs font-bold uppercase tracking-wide text-saffron">{t("exp.active")}</p>
      <p className="font-display text-xl font-extrabold">{t("dopt." + e.type)}</p>
      <p className="text-sm text-mist">{t("exp.dates", { a: new Date(e.startDate).toLocaleDateString(locale), b: new Date(e.endDate).toLocaleDateString(locale) })}</p>
      <div className="mt-2 h-2 w-full rounded-full bg-line" role="progressbar" aria-valuenow={Math.round(e.progress * 100)} aria-valuemin={0} aria-valuemax={100}><div className="h-2 rounded-full bg-saffron" style={{ width: `${Math.max(3, e.progress * 100)}%` }} /></div>
      <dl className="mt-3 grid grid-cols-2 gap-3 text-sm">
        <div><dt className="text-xs text-mist">{t("exp.before")}</dt><dd className="font-bold">{formatMeasure(t, e.baseline)}</dd></div>
        <div><dt className="text-xs text-mist">{t("exp.sofar")}</dt><dd className="font-bold">{formatMeasure(t, e.current)}</dd></div>
      </dl>
      <p className="mt-2 text-sm"><b>{t("dec.measure")} :</b> {t("exp.measure." + e.type)}</p>
      {owner && (
        <form className="mt-3 flex flex-wrap items-end gap-2" onSubmit={async (ev) => { ev.preventDefault(); const n = Number(v.replace(",", ".")); if (isFinite(n) && n >= 0) { await onLog(n); setV(""); } }}>
          <label className="text-sm"><span className="block text-xs text-mist">{t("exp.logLabel." + e.type)}</span>
            <input inputMode="decimal" value={v} onChange={(x) => setV(x.target.value)} className="mt-1 w-32 rounded-lg border border-line bg-white px-3 py-2" /></label>
          <button className="rounded-lg bg-ink px-3 py-2 text-sm font-bold text-white">{t("exp.log")}</button>
        </form>
      )}
      {sim && sim.kind === "money" && <p className="mt-3 rounded-lg bg-linen p-3 text-sm"><b>{t("sim.title")}</b> {t("sim.range", { a: num(sim.low!, locale), b: num(sim.high!, locale) })} <span className="text-xs text-mist">{t("sim.note")}</span></p>}
      <button onClick={onStop} className="mt-3 text-xs text-mist underline">{t("exp.stop")}</button>
    </div>
  );
}

function Result({ e }: { e: Experiment }) {
  const { t } = useLocale();
  if (!e.result) return null;
  const tone = e.result.label === "PROMISING" ? "text-fennel" : e.result.label === "NEGATIVE" ? "text-chili" : "text-mist";
  return (
    <div className="rounded-2xl border border-line bg-paper p-4">
      <p className="text-xs font-bold uppercase tracking-wide text-mist">{t("exp.resultTitle")}</p>
      <p className="font-display text-lg font-bold">{t("dopt." + e.type)}</p>
      <dl className="mt-2 grid grid-cols-3 gap-2 text-sm">
        <div><dt className="text-xs text-mist">{t("exp.before")}</dt><dd className="font-bold">{formatMeasure(t, e.result.before)}</dd></div>
        <div><dt className="text-xs text-mist">{t("exp.after")}</dt><dd className="font-bold">{formatMeasure(t, e.result.after)}</dd></div>
        <div><dt className="text-xs text-mist">{t("exp.verdict")}</dt><dd className={`font-extrabold ${tone}`}>{t("res." + e.result.label)}</dd></div>
      </dl>
      <p className="mt-2 text-xs text-mist">{t("res.note." + e.result.label)}</p>
    </div>
  );
}

function Simulator({ r, onSave }: { r: RadarResult; onSave: (f: Record<string, number>) => Promise<void> }) {
  const { t, locale } = useLocale();
  const f = r.continuous?.financials ?? {};
  const [aov, setAov] = useState(f.aov ? String(f.aov) : "");
  const [lo, setLo] = useState(f.extraOrdersLow !== undefined ? String(f.extraOrdersLow) : "");
  const [hi, setHi] = useState(f.extraOrdersHigh !== undefined ? String(f.extraOrdersHigh) : "");
  const sim = r.continuous?.simulation;
  if (!sim) return null;
  const n = (s: string) => Number(s.replace(",", "."));
  return (
    <details className="rounded-2xl border border-line bg-paper p-4">
      <summary className="cursor-pointer font-semibold">{t("sim.open", { what: lowerFirst(t("dopt." + sim.type)) })}</summary>
      <p className="mt-2 text-xs text-mist">{t("sim.disclaimer")}</p>
      <form className="mt-2 flex flex-wrap items-end gap-2 text-sm" onSubmit={async (e) => { e.preventDefault(); await onSave({ aov: n(aov), extraOrdersLow: n(lo), extraOrdersHigh: n(hi) }); }}>
        <label><span className="block text-xs text-mist">{t("sim.aov")}</span><input inputMode="decimal" value={aov} onChange={(e) => setAov(e.target.value)} className="mt-1 w-24 rounded-lg border border-line bg-white px-2 py-1.5" /></label>
        <label><span className="block text-xs text-mist">{t("sim.low." + sim.type)}</span><input inputMode="decimal" value={lo} onChange={(e) => setLo(e.target.value)} className="mt-1 w-24 rounded-lg border border-line bg-white px-2 py-1.5" /></label>
        <label><span className="block text-xs text-mist">{t("sim.high")}</span><input inputMode="decimal" value={hi} onChange={(e) => setHi(e.target.value)} className="mt-1 w-24 rounded-lg border border-line bg-white px-2 py-1.5" /></label>
        <button className="rounded-lg bg-ink px-3 py-1.5 font-bold text-white">{t("sim.compute")}</button>
      </form>
      {sim.kind === "money"
        ? <p className="mt-3 font-display text-xl font-bold">{t("sim.range", { a: num(sim.low!, locale), b: num(sim.high!, locale) })} <span className="ml-1 rounded bg-saffron/20 px-1.5 py-0.5 text-xs font-bold text-saffron">{t("sim.badge")}</span></p>
        : <p className="mt-3 text-sm">{t("sim.operational")}</p>}
    </details>
  );
}

export function NextMove({ r, actions }: { r: RadarResult; actions: { onLog: (id: string, v: number) => Promise<void>; onStop: (id: string) => Promise<void>; onSaveFinancials: (f: Record<string, number>) => Promise<void> } }) {
  const { t } = useLocale();
  const c = r.continuous;
  const week = r.decisions.thisWeek;
  const scen = r.scenarios ?? [];
  return (
    <section aria-labelledby="next" className="space-y-3">
      <h2 id="next" className="font-display text-2xl font-bold md:text-3xl">{t("next.title")}</h2>
      {week && (
        <div className="rounded-2xl border border-line bg-paper p-4">
          <div className="flex items-start justify-between gap-2"><p className="text-xs font-bold uppercase tracking-wide text-mist">{t("next.thisWeek")}</p><Tier tier={week.tier} /></div>
          <p className="font-display text-xl font-extrabold">{week.choice === "CONTINUE_EXPERIMENT" ? t("next.continue") : t("dopt." + week.choice)}</p>
          {week.choice === "CONTINUE_EXPERIMENT" && <p className="text-sm text-mist">{t("next.continueWhy")}</p>}
        </div>
      )}
      {c?.active && <ActiveTest r={r} e={c.active} onLog={(v) => actions.onLog(c.active!.id, v)} onStop={() => actions.onStop(c.active!.id)} />}
      {c?.finished && <Result e={c.finished} />}
      {scen.length > 0 && (
        <details className="rounded-2xl border border-line bg-paper p-4">
          <summary className="cursor-pointer font-display text-lg font-bold">{t("whatif.title")}</summary>
          <ul className="mt-3 space-y-3">
            {scen.map((s) => {
              const d = r.decisions.scenarios?.[s.experiment];
              return (
                <li key={s.experiment} className="rounded-xl bg-linen p-3">
                  <div className="flex flex-wrap items-baseline justify-between gap-2"><p className="font-semibold">{t("whatif.q." + s.experiment)}</p>{d && <span className="rounded-full bg-ink px-2.5 py-0.5 text-xs font-bold text-white">{t("verdictS." + d.choice)}</span>}</div>
                  <p className="mt-1 text-xs text-mist">{t("dec.cost", { c: t("cost." + s.cost) })} · {t("whatif.risk", { r: t("cost." + s.risk) })} · {s.reversible ? t("dec.reversible") : t("dec.irreversible")} · {t("dec.duration", { w: s.weeks })}</p>
                  <div className="mt-1"><EvidenceList r={r} ids={s.evidenceIds.slice(0, 2)} /></div>
                  <p className="mt-1 text-xs"><b>{t("dec.measure")} :</b> {t("exp.measure." + s.experiment)}</p>
                </li>
              );
            })}
          </ul>
        </details>
      )}
      <Simulator r={r} onSave={actions.onSaveFinancials} />
    </section>
  );
}

// ---- 4. Your customers: advantage and expectation gap --------------------------------------

export function CustomerInsights({ r }: { r: RadarResult }) {
  const { t } = useLocale();
  const a = r.advantage, g = r.expectationGap;
  if (!a && !g) return null;
  return (
    <div className="grid gap-3 md:grid-cols-2">
      {a && (
        <div className="rounded-2xl border border-line bg-paper p-4">
          <p className="text-xs font-bold uppercase tracking-wide text-fennel">{t("adv.title")}</p>
          <Insight r={r} what={t("adv.what", { a: lowerFirst(t("adv." + a.key)) })}
            why={t("adv.why." + a.insight, { channels: (Object.entries(a.channels).filter(([, v]) => v === false).map(([k]) => t("chan." + k))).join(", ") })}
            proof={a.evidenceIds.slice(0, 2)} todo={a.insight === "visible" ? t("adv.todo.visible") : t("adv.todo.say", { a: lowerFirst(t("adv." + a.key)) })} />
        </div>
      )}
      {g && (
        <div className="rounded-2xl border border-line bg-paper p-4">
          <p className="text-xs font-bold uppercase tracking-wide text-saffron">{t("gapx.title")}</p>
          <Insight r={r} what={t("gapx.what", { claim: t("claim." + g.claim), dom: lowerFirst(t("grp." + g.dominant)) })}
            why={t("gapx.why", { a: Math.round(g.dominantShare * 100), b: Math.round(g.claimShare * 100), n: g.positives })}
            todo={t("gapx.todo", { dom: lowerFirst(t("grp." + g.dominant)) })} />
        </div>
      )}
    </div>
  );
}

// ---- 6. Digital presence: compact labels ---------------------------------------------------

export function Presence({ r, children }: { r: RadarResult; children: React.ReactNode }) {
  const { t } = useLocale();
  const d = r.digital;
  if (!d) return null;
  const lbl = (s: number | null, hi: number, mid: number, ok: string, so: string, bad: string) => (s === null ? "notMeasured" : s >= hi ? ok : s >= mid ? so : bad);
  const rows: [string, string][] = [
    ["reputation", lbl(d.reputation.score, 75, 55, "strong", "fair", "work")],
    ["visibility", lbl(d.visibility.score, 80, 60, "good", "fair", "work")],
    ["social", d.social.score === null ? "notConnected" : d.social.insight?.code === "social.biggerButLessEngaged" ? "bigButWeak" : lbl(d.social.score, 70, 45, "strong", "fair", "work")],
    ["delivery", d.reputation.deliveryScore === null ? "notConnected" : lbl(d.reputation.deliveryScore, 70, 45, "strong", "watch", "attention")],
    ["ai", lbl(d.ai.score, 75, 0, "ready", "opportunity", "opportunity")],
  ];
  const CLS: Record<string, string> = { strong: "text-fennel", good: "text-fennel", ready: "text-fennel", fair: "text-ink", watch: "text-saffron", work: "text-saffron", attention: "text-chili", opportunity: "text-saffron", bigButWeak: "text-saffron", notConnected: "text-mist", notMeasured: "text-mist" };
  return (
    <section aria-labelledby="presence">
      <h2 id="presence" className="font-display text-2xl font-bold md:text-3xl">{t("presence.title")}</h2>
      <ul className="mt-3 grid grid-cols-2 gap-2 md:grid-cols-5">
        {rows.map(([k, v]) => <li key={k} className="rounded-xl border border-line bg-paper p-3"><p className="text-xs uppercase tracking-wide text-mist">{t("presence." + k)}</p><p className={`font-display text-lg font-bold ${CLS[v]}`}>{t("plabel." + v)}</p></li>)}
      </ul>
      <details className="mt-3"><summary className="cursor-pointer text-sm font-semibold underline">{t("health.details")}</summary><div className="mt-3">{children}</div></details>
    </section>
  );
}

// ---- More: timeline, monthly report, menu, deep dive ---------------------------------------

export function Timeline({ r }: { r: RadarResult }) {
  const { t, locale } = useLocale();
  const tl = r.continuous?.timeline ?? [];
  if (!tl.length) return null;
  const txt = (e: (typeof tl)[number]) => {
    if (e.kind === "CHANGE") return changeText(t, { type: e.code.replace("chg.", "") as MarketChange["type"], params: e.params ?? {}, importance: 0, tone: "watch" }, "title");
    return t(e.code, { ...(e.params ?? {}), type: e.params?.type ? t("dopt." + e.params.type) : "", label: e.params?.label ? t("res." + e.params.label) : "" });
  };
  return (
    <div>
      <h3 className="font-display text-lg font-bold">{t("tl.title")}</h3>
      <ol className="mt-2 border-l-2 border-line pl-4">
        {tl.map((e, i) => <li key={i} className="mb-2"><p className="text-xs text-mist">{new Date(e.at).toLocaleDateString(locale, { day: "numeric", month: "short" })}</p><p className="text-sm font-semibold">{txt(e)}</p></li>)}
      </ol>
    </div>
  );
}

export function MonthlyReportView({ r }: { r: RadarResult }) {
  const { t } = useLocale();
  const m = r.continuous?.monthly;
  if (!m) return null;
  const block = (title: string, items: MarketChange[]) => <div><p className="text-xs font-bold uppercase tracking-wide text-mist">{title}</p>{items.length ? <ul className="text-sm">{items.map((c, i) => <li key={i}>• {changeText(t, c, "title")}</li>)}</ul> : <p className="text-sm text-mist">{t("month.nothing")}</p>}</div>;
  const next = r.decisions.bestTest && !isNone(r.decisions.bestTest.choice) ? t("dopt." + r.decisions.bestTest.choice) : t("planv3.test.none");
  return (
    <div className="rounded-2xl border border-line bg-paper p-4">
      <h3 className="font-display text-lg font-bold">{t("month.title")}</h3>
      <div className="mt-2 grid gap-3 sm:grid-cols-2">
        {block(t("month.improved"), m.improved)}
        {block(t("month.worse"), m.worse)}
        {block(t("month.around"), m.around)}
        <div><p className="text-xs font-bold uppercase tracking-wide text-mist">{t("month.tested")}</p>{m.tested.length ? <ul className="text-sm">{m.tested.map((e) => <li key={e.id}>• {t("dopt." + e.type)}{e.result ? ` : ${t("res." + e.result.label)}` : ` (${t("exp.inProgress")})`}</li>)}</ul> : <p className="text-sm text-mist">{t("month.nothing")}</p>}</div>
      </div>
      <p className="mt-3 text-sm"><b>{t("month.next")} :</b> {next}</p>
    </div>
  );
}

export function MenuInsightsView({ r }: { r: RadarResult }) {
  const { t } = useLocale();
  const m = r.menuInsights ?? [];
  if (!m.length) return null;
  return (
    <div className="rounded-2xl border border-line bg-paper p-4">
      <h3 className="font-display text-lg font-bold">{t("menu.title")}</h3>
      <ul className="mt-2 space-y-1 text-sm">{m.map((x, i) => <li key={i}>• {t(x.code, Object.fromEntries(Object.entries(x.params).map(([k, v]) => [k, k === "tier" ? t("tier." + v) : num(v, t.locale)])))}</li>)}</ul>
      {r.decisions.menuAction && !isNone(r.decisions.menuAction.choice) && <p className="mt-2 text-sm"><b>{t("menu.action")} :</b> {t("dopt." + r.decisions.menuAction.choice)}</p>}
    </div>
  );
}

export function DeepDive({ onRun }: { onRun: (area: string) => Promise<void> }) {
  const { t } = useLocale();
  const [busy, setBusy] = useState<string | null>(null);
  return (
    <div className="rounded-2xl border border-line bg-paper p-4">
      <h3 className="font-display text-lg font-bold">{t("deep.title")}</h3>
      <p className="text-sm text-mist">{t("deep.sub")}</p>
      <div className="mt-2 flex flex-wrap gap-2">
        {["reviews", "competitors", "visibility", "menu", "instagram"].map((a) => (
          <button key={a} disabled={!!busy} onClick={async () => { setBusy(a); try { await onRun(a); } finally { setBusy(null); } }} className="rounded-lg border border-line bg-white px-3 py-1.5 text-sm font-semibold disabled:opacity-50">{busy === a ? t("deep.running") : t("deep." + a)}</button>
        ))}
      </div>
    </div>
  );
}

export function CostPanel({ r }: { r: RadarResult }) {
  const c = r.cost;
  if (!c) return null;
  return (
    <details className="mt-2" open>
      <summary className="cursor-pointer font-bold">Provider cost & cache ({c.mode})</summary>
      <p>Estimated provider cost: ${c.estimatedUsd} / ceiling ${c.ceilingUsd} · cache hit ratio {c.cacheHitRatio} · provider requests {c.providerRequests} · cache hits {c.cacheHits} · new records {c.newRecords}</p>
      <p>Projections: initial deep scan ~${c.projections.initialDeepScanUsd} · weekly refresh ~${c.projections.weeklyRefreshUsd} · monthly refresh ~${c.projections.monthlyRefreshUsd} · first month ~${c.projections.firstMonthUsd} · steady month ~${c.projections.steadyMonthUsd}</p>
      <p>Reviews reused {c.reviewsReused} · reviews newly analyzed {c.reviewsNew} · Jev requests {c.jevRequests} (cached {c.jevCached}) · LLM tokens {c.llmTokens}</p>
      {c.warnings.length > 0 && <p className="font-bold text-chili">Warnings: {c.warnings.join(", ")}</p>}
      <pre className="whitespace-pre-wrap">{JSON.stringify(c.entries, null, 1)}</pre>
    </details>
  );
}
