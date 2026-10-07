"use client";
import type { BattlePlan } from "@/types";
import { useT } from "@/i18n/client";

const SLOTS: { key: keyof BattlePlan; tone: string }[] = [
  { key: "defend", tone: "border-fennel" },
  { key: "fix", tone: "border-chili" },
  { key: "attack", tone: "border-saffron" },
  { key: "ignore", tone: "border-mist" },
];

export function Plan({ plan, compact = false }: { plan?: BattlePlan; compact?: boolean }) {
  const t = useT();
  if (!plan) return <p className="rounded-xl border border-line bg-paper p-4 text-sm text-mist">{t("plan.unavailable")}</p>;
  return (
    <div className={`grid gap-3 ${compact ? "sm:grid-cols-2" : "sm:grid-cols-2 lg:grid-cols-4"}`}>
      {SLOTS.map((s) => (
        <div key={s.key} className={`rounded-xl border-l-4 bg-paper p-4 ${s.tone}`}>
          <p className="font-display text-lg font-extrabold">{t("plan." + s.key)}</p>
          <p className="text-xs text-mist">{t("plan.hint." + s.key)}</p>
          <p className="mt-2 font-semibold leading-snug">{plan[s.key].title}</p>
          <p className="mt-1 text-sm text-mist">{plan[s.key].detail}</p>
        </div>
      ))}
    </div>
  );
}
