"use client";
import type { RadarScore } from "@/types";
import { useT } from "@/i18n/client";

export function RadarChart({ score }: { score: RadarScore }) {
  const t = useT();
  const cx = 180, cy = 160, R = 105;
  const n = score.dimensions.length;
  const pt = (i: number, r: number) => {
    const a = (-90 + (360 / n) * i) * (Math.PI / 180);
    return [cx + r * Math.cos(a), cy + r * Math.sin(a)] as const;
  };
  const poly = score.dimensions.map((d, i) => pt(i, (R * d.score) / 100).join(",")).join(" ");
  return (
    <svg viewBox="0 0 360 330" className="w-full max-w-[380px]" role="img" aria-label={t("radar.chartAria", { n: score.total })}>
      {[25, 50, 75, 100].map((r) => (
        <polygon key={r} points={score.dimensions.map((_, i) => pt(i, (R * r) / 100).join(",")).join(" ")} fill="none" stroke="#CBD2CC" strokeWidth={r === 100 ? 1.4 : 1} />
      ))}
      {score.dimensions.map((_, i) => {
        const [x, y] = pt(i, R);
        return <line key={i} x1={cx} y1={cy} x2={x} y2={y} stroke="#CBD2CC" />;
      })}
      <clipPath id="rr-clip"><polygon points={score.dimensions.map((_, i) => pt(i, R).join(",")).join(" ")} /></clipPath>
      <g clipPath="url(#rr-clip)"><g className="sweep" style={{ transformOrigin: `${cx}px ${cy}px` }}>
        <path d={`M${cx} ${cy} L${cx} ${cy - R} A${R} ${R} 0 0 1 ${cx + R * Math.sin(0.5)} ${cy - R * Math.cos(0.5)} Z`} fill="#2E6B50" opacity="0.14" />
      </g></g>
      <polygon points={poly} fill="#2E6B50" fillOpacity="0.22" stroke="#2E6B50" strokeWidth="2.2" strokeLinejoin="round" />
      {score.dimensions.map((d, i) => {
        const [x, y] = pt(i, (R * d.score) / 100);
        const [lx, ly] = pt(i, R + 26);
        return (
          <g key={d.key}>
            <circle cx={x} cy={y} r="4" fill="#14221E" />
            <text x={lx} y={ly - 3} textAnchor="middle" fontSize="12" fill="#14221E" fontWeight="600">{t("dimShort." + d.key)}</text>
            <text x={lx} y={ly + 11} textAnchor="middle" fontSize="12" fill="#5F6E67">{d.score}</text>
          </g>
        );
      })}
    </svg>
  );
}
