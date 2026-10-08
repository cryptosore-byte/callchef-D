"use client";
import { useLocale } from "@/i18n/client";

const S = { fill: "none", stroke: "currentColor", strokeWidth: 1.5, strokeLinecap: "round", strokeLinejoin: "round" } as const;
export const ICONS = {
  // storefront with awning
  competition: <svg viewBox="0 0 32 32" {...S}><path d="M5 12h22M6 12l2-6h16l2 6" /><path d="M5 12c0 2 1.5 3 3.3 3s3.4-1 3.4-3c0 2 1.6 3 3.3 3s3.3-1 3.3-3c0 2 1.6 3 3.4 3S27 14 27 12" /><path d="M7 15v11h18V15M13 26v-6h6v6" /></svg>,
  // star inside a speech bubble
  reputation: <svg viewBox="0 0 32 32" {...S}><path d="M6 7h20a2 2 0 0 1 2 2v12a2 2 0 0 1-2 2H14l-6 4v-4H6a2 2 0 0 1-2-2V9a2 2 0 0 1 2-2z" /><path d="M16 10.5l1.6 3.2 3.5.5-2.5 2.5.6 3.5-3.2-1.7-3.2 1.7.6-3.5-2.5-2.5 3.5-.5z" /></svg>,
  // globe crossed by a magnifier
  visibility: <svg viewBox="0 0 32 32" {...S}><circle cx="14" cy="14" r="9" /><path d="M5 14h18M14 5c3 3 3 15 0 18M14 5c-3 3-3 15 0 18" /><path d="M21 21l6 6" /></svg>,
  // camera-like social square
  social: <svg viewBox="0 0 32 32" {...S}><rect x="5" y="5" width="22" height="22" rx="7" /><circle cx="16" cy="16" r="5" /><circle cx="22.5" cy="9.5" r=".9" fill="currentColor" stroke="none" /></svg>,
};

const PILLARS = [
  { k: "competition", n: "01" },
  { k: "reputation", n: "02" },
  { k: "visibility", n: "03", tags: ["pil.visibility.tag1", "pil.visibility.tag2"], note: "pil.visibility.note" },
  { k: "social", n: "04", tags: ["pil.social.tag1", "pil.social.tag2"], note: "pil.social.note" },
] as const;

// Hairlines: stacked on mobile, 2x2 on tablet, one row on desktop.
const edge = (i: number) => [
  i > 0 && "border-t", i === 1 && "sm:border-t-0", "lg:border-t-0",
  i % 2 ? "sm:border-l sm:pl-6" : "sm:pr-6", i === 2 && "lg:border-l lg:pl-6", i < 3 && "lg:pr-6",
].filter(Boolean).join(" ");

/** Four dimensions, editorial columns separated by hairlines: number, icon, name, question, one benefit. */
export function Pillars() {
  const { t } = useLocale();
  return (
    <section aria-labelledby="pillars-title" className="border-y border-ink/15">
      <h2 id="pillars-title" className="sr-only">{t("pil.title")}</h2>
      <ol className="grid sm:grid-cols-2 lg:grid-cols-4">
        {PILLARS.map((p, i) => (
          <li key={p.k} style={{ animationDelay: `${120 + i * 90}ms` }}
            className={`rise group relative flex flex-col border-ink/15 py-7 ${edge(i)}`}>
            <div className="flex items-center justify-between">
              <span className="font-display text-xs font-bold tracking-[0.18em] text-mist">
                <span className="tabular-nums text-ink">{p.n}</span><span className="mx-2 text-ink/30">—</span>{t(`pil.${p.k}.name`)}
              </span>
              <span className="h-8 w-8 text-fennel transition-transform duration-500 group-hover:-rotate-6 group-hover:scale-110" aria-hidden>{ICONS[p.k]}</span>
            </div>
            <h3 className="mt-5 font-display text-[1.35rem] font-bold leading-tight">{t(`pil.${p.k}.q`)}</h3>
            <p className="mt-2 text-[15px] leading-relaxed text-mist">{t(`pil.${p.k}.b`)}</p>
            {"tags" in p && (
              <p className="mt-4 flex flex-wrap gap-x-3 gap-y-1 text-xs font-semibold">
                {p.tags.map((x, j) => <span key={x} className={j ? "text-mist" : "text-ink"}>{j ? "· " : ""}{t(x)}</span>)}
              </p>
            )}
            {"note" in p && <p className="mt-1.5 text-xs leading-snug text-mist/90">{t(p.note)}</p>}
          </li>
        ))}
      </ol>
    </section>
  );
}

/** Data collection and decision are two different stages; Jev is the decision engine, not a chatbot. */
export function DecisionStatement() {
  const { t } = useLocale();
  const steps = ["collect", "evidence", "decide"] as const;
  return (
    <section aria-labelledby="decide-title" className="py-16 md:py-24">
      <h2 id="decide-title" className="max-w-4xl font-display text-[2rem] font-bold leading-[1.08] md:text-5xl">
        <span className="text-mist">{t("dec2.a")}</span> {t("dec2.b")}
      </h2>
      <ol className="mt-10 grid gap-6 md:grid-cols-3 md:gap-0">
        {steps.map((s, i) => (
          <li key={s} className={`relative md:pr-8 ${i ? "md:border-l md:border-ink/15 md:pl-8" : ""}`}>
            <p className="font-display text-xs font-bold tracking-[0.18em] text-mist"><span className="tabular-nums text-ink">{i + 1}</span><span className="mx-2 text-ink/30">—</span>{t(`dec2.${s}`)}</p>
            <p className="mt-2 text-[15px] leading-relaxed">{t(`dec2.${s}.b`)}</p>
          </li>
        ))}
      </ol>
    </section>
  );
}
