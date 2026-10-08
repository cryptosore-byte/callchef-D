"use client";
// V3 result blocks: discovery insight, "if we owned it", decisions, 30-day plan, do-not-touch, debug.
import type { ConfidenceTier, RadarResult } from "@/types";
import type { BusinessDecision } from "@/services/BusinessDecisionService";
import { NONE } from "@/services/BusinessDecisionService";
import type { PlanItemV3 } from "@/services/PlanService";
import { useLocale } from "@/i18n/client";
import { evidenceText, paramsText } from "@/lib/evidence";
import { reasonText } from "@/lib/reasons";

const TIER_CLS: Record<ConfidenceTier, string> = { STRONG: "bg-fennel text-white", TEST: "bg-saffron text-white", INSUFFICIENT: "bg-line text-ink" };
const isNone = (c: string) => Object.values(NONE).includes(c);
const lowerFirst = (s: string) => s.charAt(0).toLowerCase() + s.slice(1);

export function Tier({ tier }: { tier: ConfidenceTier }) {
  const { t } = useLocale();
  const key = tier === "STRONG" ? "tier.strong" : tier === "TEST" ? "tier.test" : "tier.insufficient";
  return <span className={`inline-block rounded-full px-2.5 py-0.5 text-xs font-bold ${TIER_CLS[tier]}`}>{t(key)}</span>;
}

export function EvidenceList({ r, ids, dark = false }: { r: RadarResult; ids: string[]; dark?: boolean }) {
  const { t } = useLocale();
  const ev = (r.evidence ?? []).filter((e) => ids.includes(e.id));
  if (!ev.length) return null;
  return (
    <ul className={`space-y-1 text-sm ${dark ? "text-white/85" : ""}`}>
      {ev.map((e) => <li key={e.id} className="flex gap-2"><span aria-hidden className={dark ? "text-white/50" : "text-mist"}>•</span><span>{evidenceText(t, e)}</span></li>)}
    </ul>
  );
}

export function Discovery({ r }: { r: RadarResult }) {
  const { t } = useLocale();
  const d = r.discovery;
  const kind = d?.code.replace("disc.", "");
  return (
    <section aria-labelledby="disc" className="rounded-2xl border-2 border-saffron bg-saffron/10 p-5 md:p-6">
      <h2 id="disc" className="text-xs font-extrabold uppercase tracking-widest text-saffron">{t("disc.title")}</h2>
      <p className="mt-2 font-display text-xl font-bold leading-snug md:text-2xl">
        {d ? t(d.code, paramsText(t, d.params, kind === "strengthNotCommunicated" ? "praise" : kind)) : t("disc.none")}
      </p>
    </section>
  );
}

export function OwnerCard({ r }: { r: RadarResult }) {
  const { t } = useLocale();
  const o = r.decisions.owner;
  if (!r.decisions.available || !o) return <p className="rounded-2xl border border-line bg-paper p-5 text-sm">{t("dec.unavailable")}</p>;
  const none = isNone(o.action.choice);
  return (
    <section aria-labelledby="owner" className="rounded-2xl bg-ink p-5 text-white md:p-8">
      <h2 id="owner" className="text-sm font-bold uppercase tracking-widest text-white/60">{t("owner.title", { name: r.target.name })}</h2>
      {none ? <p className="mt-3 font-display text-2xl font-bold">{t("owner.none")}</p> : (
        <div className="mt-4 grid gap-5 md:grid-cols-[1.3fr_1fr]">
          <div>
            <p className="text-xs font-bold uppercase tracking-wide text-fennel">{t("owner.do")}</p>
            <p className="font-display text-3xl font-extrabold leading-tight md:text-4xl">{t("dopt." + o.action.choice)}</p>
            {!isNone(o.notDo.choice) && <>
              <p className="mt-4 text-xs font-bold uppercase tracking-wide text-chili">{t("owner.not")}</p>
              <p className="font-display text-xl font-bold">{t("dopt." + o.notDo.choice)}</p>
            </>}
          </div>
          <div>
            <p className="text-xs font-bold uppercase tracking-wide text-white/60">{t("owner.why")}</p>
            <div className="mt-1"><EvidenceList r={r} ids={o.why} dark /></div>
            <p className="mt-3"><Tier tier={o.action.tier} /></p>
          </div>
        </div>
      )}
    </section>
  );
}

function Engine({ d }: { d: BusinessDecision }) {
  const { t } = useLocale();
  return <p className="mt-2 text-xs text-mist">{d.engine === "rule" ? t("dec.rule") : d.engine === "jev" ? t("dec.engineJev") : t("dec.engineDemo")}</p>;
}

function DecisionCard({ r, title, d, children }: { r: RadarResult; title: string; d?: BusinessDecision; children?: React.ReactNode }) {
  const { t } = useLocale();
  if (!d) return null;
  return (
    <div className="flex flex-col rounded-2xl border border-line bg-paper p-4">
      <div className="flex items-start justify-between gap-2"><p className="text-xs font-bold uppercase tracking-wide text-mist">{title}</p><Tier tier={d.tier} /></div>
      <p className="mt-1 font-display text-xl font-extrabold">{t("dopt." + d.choice)}</p>
      {children}
      {d.supportingEvidenceIds.length > 0 && <details className="mt-2"><summary className="cursor-pointer text-sm font-semibold underline">{t("dec.evidence")}</summary><div className="mt-1"><EvidenceList r={r} ids={d.supportingEvidenceIds} /></div></details>}
      <Engine d={d} />
    </div>
  );
}

export function Decisions({ r }: { r: RadarResult }) {
  const { t } = useLocale();
  const d = r.decisions;
  if (!d.available) return <p className="rounded-2xl border border-line bg-paper p-5 text-sm">{t("dec.unavailable")}</p>;
  const opp = r.opportunities?.find((o) => o.experiment === d.bestTest?.choice);
  const bench = r.competitors.find((c) => c.restaurant.id === d.learnFrom?.restaurantId);
  return (
    <div className="grid gap-3 md:grid-cols-2">
      <DecisionCard r={r} title={t("dec.bestTest")} d={d.bestTest}>
        {opp && !isNone(d.bestTest!.choice) && (
          <p className="mt-1 text-sm text-mist">{t("dec.cost", { c: t("cost." + opp.cost) })} · {opp.reversible ? t("dec.reversible") : t("dec.irreversible")} · {t("dec.duration", { w: opp.weeksToTest })}</p>
        )}
        {d.bestTest && !isNone(d.bestTest.choice) && <p className="mt-2 text-sm"><b>{t("dec.measure")} :</b> {t("measure." + d.bestTest.choice)}</p>}
      </DecisionCard>
      <DecisionCard r={r} title={t("dec.focus10h")} d={d.focus10h} />
      {d.invest500
        ? <DecisionCard r={r} title={t("dec.invest500")} d={d.invest500} />
        : <div className="rounded-2xl border border-line bg-paper p-4"><p className="text-xs font-bold uppercase tracking-wide text-mist">{t("dec.invest500")}</p><p className="mt-1 text-sm">{t("dec.noInvest")}</p></div>}
      {d.learnFrom && (
        <div className="flex flex-col rounded-2xl border border-line bg-paper p-4">
          <div className="flex items-start justify-between gap-2"><p className="text-xs font-bold uppercase tracking-wide text-mist">{t("dec.learnFrom")}</p><Tier tier={d.learnFrom.tier} /></div>
          <p className="mt-1 font-display text-xl font-extrabold">{bench?.restaurant.name ?? t("dopt." + d.learnFrom.choice)}</p>
          {d.whatToLearn && !isNone(d.whatToLearn.choice) && <p className="text-sm font-semibold">{t("dec.whatToLearn", { what: lowerFirst(t("dopt." + d.whatToLearn.choice)) })}</p>}
          {d.learnFrom.supportingEvidenceIds.length > 0 && <details className="mt-2"><summary className="cursor-pointer text-sm font-semibold underline">{t("dec.evidence")}</summary><div className="mt-1"><EvidenceList r={r} ids={d.whatToLearn?.supportingEvidenceIds.length ? d.whatToLearn.supportingEvidenceIds : d.learnFrom.supportingEvidenceIds} /></div></details>}
          <Engine d={d.learnFrom} />
        </div>
      )}
    </div>
  );
}

export function DontTouch({ r }: { r: RadarResult }) {
  const { t } = useLocale();
  const d = r.decisions.dontTouch;
  if (!r.decisions.available || !d) return null;
  return (
    <div className="rounded-2xl border border-fennel/50 bg-fennel/5 p-5">
      <div className="flex items-start justify-between gap-2"><p className="font-display text-2xl font-extrabold">{t("dopt." + d.choice)}</p><Tier tier={d.tier} /></div>
      {!isNone(d.choice) && <p className="mt-1 text-sm">{t("planv3.keep")}</p>}
      <div className="mt-2"><EvidenceList r={r} ids={d.supportingEvidenceIds} /></div>
    </div>
  );
}

const PLAN_CLS = { protect: "border-fennel", test: "border-saffron", exploit: "border-ink", notPriority: "border-line" } as const;
const PLAN_TITLE = { protect: "planv3.protect", test: "planv3.test", exploit: "planv3.exploit", notPriority: "planv3.not" } as const;

function planText(t: ReturnType<typeof useLocale>["t"], k: keyof typeof PLAN_TITLE, it: PlanItemV3): { title: string; detail?: string } {
  const c = it.what.code, p = it.what.params ?? {};
  if (c === "keep") return { title: t("dopt." + p.opt), detail: t("planv3.keep") };
  if (c === "exp") return { title: t("dopt." + p.opt) };
  if (c === "not") return { title: t("dopt." + p.opt), detail: t("planv3.not.detail") };
  if (c === "exploit.edge") { const { reason, ...rest } = p; return { title: t("planv3.exploit.edge", { reason: reasonText(t, { code: String(reason), params: rest }).toLowerCase() }) }; }
  if (c.startsWith("exploit.")) return { title: t("planv3." + c, paramsText(t, p, "praise")) };
  return { title: t("planv3." + c) };
}

export function PlanV3({ r, compact = false }: { r: RadarResult; compact?: boolean }) {
  const { t } = useLocale();
  if (!r.plan) return <p className="rounded-xl border border-line bg-paper p-4 text-sm">{t("dec.unavailable")}</p>;
  return (
    <ol className={`grid gap-3 ${compact ? "sm:grid-cols-2" : "md:grid-cols-4"}`}>
      {(Object.keys(PLAN_TITLE) as (keyof typeof PLAN_TITLE)[]).map((k) => {
        const it = r.plan![k];
        const { title, detail } = planText(t, k, it);
        return (
          <li key={k} className={`rounded-2xl border-l-4 ${PLAN_CLS[k]} bg-paper p-4`}>
            <p className="text-xs font-bold uppercase tracking-wide text-mist">{t(PLAN_TITLE[k])}</p>
            <p className="mt-1 font-display text-lg font-bold leading-snug">{title}</p>
            {detail && <p className="mt-1 text-sm text-mist">{detail}</p>}
            {!compact && it.why.length > 0 && <div className="mt-2"><p className="text-xs font-bold uppercase tracking-wide text-mist">{t("planv3.why")}</p><EvidenceList r={r} ids={it.why.slice(0, 3)} /></div>}
            {!compact && it.weeks && <p className="mt-2 text-sm"><b>{t("planv3.howLong", { w: it.weeks })}</b></p>}
            {!compact && it.measure && <p className="mt-1 text-sm"><b>{t("planv3.measure")} :</b> {t("measure." + it.measure)}</p>}
          </li>
        );
      })}
    </ol>
  );
}

export function DebugPanel({ r }: { r: RadarResult }) {
  const { t } = useLocale();
  const rows = [r.target, ...r.nearby.map((n) => n.restaurant)];
  const cand = new Map(r.nearby.map((n) => [n.restaurant.id, n]));
  return (
    <section className="rounded-2xl border-2 border-dashed border-mist bg-paper p-4 text-xs">
      <h2 className="font-display text-lg font-bold">{t("debug.title")}</h2>
      <div className="mt-2 overflow-x-auto">
        <table className="w-full min-w-[900px] text-left">
          <thead><tr className="text-mist"><th>Name</th><th>Food type (conf)</th><th>Evidence</th><th>Raw ★</th><th>Reviews</th><th>Adj ★</th><th>Relevance</th><th>Threat</th><th>Benchmark</th><th>Rejection</th></tr></thead>
          <tbody>
            {rows.map((x) => { const c = cand.get(x.id); return (
              <tr key={x.id} className="border-t border-line align-top">
                <td className="font-semibold">{x.name}</td>
                <td>{x.foodProfile?.primary} ({x.foodProfile?.confidence} {x.foodProfile?.level}) {x.foodProfile?.modifiers.map((m) => m.key).join(",")}</td>
                <td>{x.foodProfile?.evidence.map((e) => `${e.source}: ${e.text}`).join(" | ")}</td>
                <td>{x.rating}</td><td>{x.reviewCount}</td><td>{c?.reputation.adjustedRating ?? r.targetReputation?.adjustedRating}</td>
                <td>{c ? Math.round(c.relevance) : "target"}</td><td>{c ? `${Math.round(c.threatPotential)} ${c.threatLevel}` : ""}</td>
                <td>{c ? `${Math.round(c.benchmarkQuality)} ${c.benchmarkLevel}` : ""}</td><td>{c?.rejectionReasons?.map((x) => reasonText(t, x)).join("; ")}</td>
              </tr>); })}
          </tbody>
        </table>
      </div>
      <details className="mt-3"><summary className="cursor-pointer font-bold">Evidence ({r.evidence?.length ?? 0})</summary><pre className="whitespace-pre-wrap">{JSON.stringify(r.evidence, null, 1)}</pre></details>
      <details className="mt-2"><summary className="cursor-pointer font-bold">Opportunities</summary><pre className="whitespace-pre-wrap">{JSON.stringify(r.opportunities, null, 1)}</pre></details>
      <details className="mt-2"><summary className="cursor-pointer font-bold">Jev decisions (raw probabilities)</summary><pre className="whitespace-pre-wrap">{JSON.stringify({ ...r.decisions, debug: undefined }, null, 1)}</pre></details>
      <details className="mt-2"><summary className="cursor-pointer font-bold">Jev input state + questions</summary><pre className="whitespace-pre-wrap">{JSON.stringify(r.decisions.debug, null, 1)}</pre></details>
    </section>
  );
}
