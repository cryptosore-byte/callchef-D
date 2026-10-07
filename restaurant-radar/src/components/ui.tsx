"use client";
import type { ConfidenceTier, DataQualityLevel } from "@/types";
import { useT } from "@/i18n/client";

export function Logo({ className = "" }: { className?: string }) {
  return (
    <span className={`inline-flex items-center gap-2 font-display font-extrabold text-lg ${className}`}>
      <svg width="22" height="22" viewBox="0 0 24 24" aria-hidden>
        <circle cx="12" cy="12" r="10" fill="none" stroke="currentColor" strokeWidth="1.6" />
        <circle cx="12" cy="12" r="5.5" fill="none" stroke="currentColor" strokeWidth="1.6" />
        <path d="M12 12 L19 6" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
        <circle cx="12" cy="12" r="1.8" fill="currentColor" />
      </svg>
      Restaurant Radar
    </span>
  );
}

export function DemoBadge() {
  const t = useT();
  return <span className="inline-flex items-center rounded-full border border-saffron/50 bg-saffron/10 px-2.5 py-0.5 text-xs font-bold text-saffron">{t("common.demoData")}</span>;
}

const TIER_CLS = { STRONG: "bg-fennel text-white", TEST: "bg-saffron text-white", INSUFFICIENT: "bg-mist text-white" } as const;

export function TierBadge({ tier, strongLabel, testLabel }: { tier: ConfidenceTier; strongLabel?: string; testLabel?: string }) {
  const t = useT();
  const label = tier === "STRONG" ? strongLabel ?? t("tier.strong") : tier === "TEST" ? testLabel ?? t("tier.test") : t("tier.insufficient");
  return <span className={`inline-block rounded-full px-2.5 py-0.5 text-xs font-semibold ${TIER_CLS[tier]}`}>{label}</span>;
}

export function QualityBadge({ level }: { level: DataQualityLevel }) {
  const t = useT();
  const cls = level === "HIGH" ? "bg-fennel/15 text-fennel border-fennel/40" : level === "MEDIUM" ? "bg-saffron/15 text-saffron border-saffron/40" : "bg-chili/10 text-chili border-chili/40";
  return <span className={`inline-block rounded-full border px-2.5 py-0.5 text-xs font-bold ${cls}`}>{t("dq.badge." + level)}</span>;
}

export function Bar({ value, tone = "fennel" }: { value: number; tone?: "fennel" | "chili" | "ink" }) {
  const c = tone === "fennel" ? "bg-fennel" : tone === "chili" ? "bg-chili" : "bg-ink";
  return (
    <div className="h-1.5 w-full rounded-full bg-line/70" role="img" aria-label={`${Math.round(value)} out of 100`}>
      <div className={`h-1.5 rounded-full ${c}`} style={{ width: `${Math.max(2, Math.min(100, value))}%` }} />
    </div>
  );
}
