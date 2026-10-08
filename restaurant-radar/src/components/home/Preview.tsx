"use client";
import { useLocale } from "@/i18n/client";
import { ICONS } from "./Pillars";

// Illustrative result built from the FICTIONAL demo restaurant (Maison Brasero): the same signals the demo scan produces.
const AREAS = [
  { k: "competition", lines: ["pv.c1", "pv.c2"] },
  { k: "reputation", lines: ["pv.r1", "pv.r2"] },
  { k: "visibility", lines: ["pv.v1", "pv.v2"] },
  { k: "social", lines: ["pv.s1", "pv.s2"] },
] as const;

/** Four sources of signals converge into ONE business action. */
export function Preview({ onDemo }: { onDemo: () => void }) {
  const { t } = useLocale();
  return (
    <section aria-labelledby="pv-title" className="pb-16 md:pb-24">
      <div className="flex flex-wrap items-baseline justify-between gap-3">
        <h2 id="pv-title" className="font-display text-2xl font-bold md:text-3xl">{t("pv.title")}</h2>
        <span className="rounded-full border border-saffron/50 bg-saffron/10 px-2.5 py-0.5 text-xs font-bold text-saffron">{t("pv.demo")}</span>
      </div>
      <p className="mt-1 text-sm text-mist">{t("pv.sub")}</p>

      <div className="mt-6 overflow-hidden rounded-[22px] bg-ink text-white">
        <ul className="grid sm:grid-cols-2 lg:grid-cols-4">
          {AREAS.map((a, i) => (
            <li key={a.k} className={`border-white/10 p-5 ${i ? "border-t sm:border-t-0" : ""} ${i % 2 ? "sm:border-l" : ""} ${i >= 2 ? "sm:border-t lg:border-t-0" : ""} ${i === 2 ? "lg:border-l" : ""}`}>
              <p className="flex items-center gap-2 font-display text-xs font-bold tracking-[0.16em] text-white/60">
                <span className="h-5 w-5 text-[#9FD3B8]" aria-hidden>{ICONS[a.k]}</span>{t(`pil.${a.k}.name`)}
              </p>
              <ul className="mt-3 space-y-1.5 text-sm leading-snug">
                {a.lines.map((l) => <li key={l} className="text-white/90">{t(l)}</li>)}
              </ul>
            </li>
          ))}
        </ul>

        {/* convergence: four signals, one decision */}
        <svg viewBox="0 0 400 36" preserveAspectRatio="none" className="block h-9 w-full text-white/25" aria-hidden>
          {[50, 150, 250, 350].map((x) => <path key={x} d={`M${x} 0 C ${x} 22, 200 14, 200 36`} fill="none" stroke="currentColor" strokeWidth="1" vectorEffect="non-scaling-stroke" />)}
        </svg>

        <div className="mx-3 mb-3 rounded-2xl bg-paper p-5 text-ink md:p-6">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <p className="font-display text-xs font-bold tracking-[0.18em] text-fennel">{t("pv.testLabel")}</p>
            <span className="rounded-full bg-saffron px-2.5 py-0.5 text-xs font-semibold text-white">{t("tier.test")}</span>
          </div>
          <p className="mt-2 font-display text-2xl font-bold leading-tight md:text-[1.75rem]">{t("pv.test")}</p>
          <div className="mt-3 grid gap-3 text-sm md:grid-cols-2">
            <p><span className="font-semibold">{t("pv.whyL")}</span> <span className="text-mist">{t("pv.why")}</span></p>
            <p><span className="font-semibold">{t("pv.dontL")}</span> <span className="text-mist">{t("pv.dont")}</span></p>
          </div>
        </div>
      </div>
      <button type="button" onClick={onDemo} className="mt-4 text-sm font-semibold underline underline-offset-4 hover:text-fennel">{t("pv.cta")}</button>
    </section>
  );
}

/** Hero illustration: four dimensions around the restaurant, one sweep. Decorative. */
export function RadarRings() {
  const { t } = useLocale();
  const labels = [
    { k: "competition", x: 160, y: 18, a: "middle" },
    { k: "reputation", x: 362, y: 150, a: "end" },
    { k: "visibility", x: 160, y: 314, a: "middle" },
    { k: "social", x: -42, y: 150, a: "start" },
  ] as const;
  return (
    <svg viewBox="-46 0 412 320" className="h-full w-full" aria-hidden>
      <defs>
        <radialGradient id="rr-sweep" cx="50%" cy="50%" r="50%">
          <stop offset="0%" stopColor="#2E6B50" stopOpacity=".28" /><stop offset="100%" stopColor="#2E6B50" stopOpacity="0" />
        </radialGradient>
      </defs>
      {[130, 98, 66, 34].map((r) => <circle key={r} cx="160" cy="160" r={r} fill="none" stroke="#14221E" strokeOpacity=".14" />)}
      <path d="M160 30v260M30 160h260" stroke="#14221E" strokeOpacity=".08" />
      <g className="sweep"><path d="M160 160 L160 30 A130 130 0 0 1 252 68 Z" fill="url(#rr-sweep)" /></g>
      {[[204, 98], [226, 196], [118, 226], [100, 120], [182, 134]].map(([x, y], i) => (
        <circle key={i} cx={x} cy={y} r="3.5" fill={i === 4 ? "#B83A28" : "#2E6B50"} className="blip" style={{ animationDelay: `${i * 0.7}s` }} />
      ))}
      <circle cx="160" cy="160" r="6" fill="#14221E" />
      {labels.map((l) => (
        <text key={l.k} x={l.x} y={l.y} textAnchor={l.a} className="fill-mist font-display text-[10px] font-bold tracking-[0.16em]">{t(`pil.${l.k}.short`)}</text>
      ))}
    </svg>
  );
}
