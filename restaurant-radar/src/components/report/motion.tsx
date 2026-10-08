"use client";
// Motion primitives for the report: everything animates once, when it scrolls into view.
// prefers-reduced-motion (globals.css) disables transitions: values then simply appear.
import { useEffect, useRef, useState } from "react";

export function useInView<T extends Element>(threshold = 0.25) {
  const ref = useRef<T>(null);
  const [seen, setSeen] = useState(false);
  useEffect(() => {
    const el = ref.current;
    if (!el || seen) return;
    if (typeof IntersectionObserver === "undefined") { setSeen(true); return; }
    const io = new IntersectionObserver(([e]) => { if (e.isIntersecting) { setSeen(true); io.disconnect(); } }, { threshold });
    io.observe(el);
    return () => io.disconnect();
  }, [seen, threshold]);
  return [ref, seen] as const;
}

/** Number that counts up from 0 when visible. */
export function CountUp({ value, decimals = 0, locale = "fr", suffix = "" }: { value: number; decimals?: number; locale?: string; suffix?: string }) {
  const [ref, seen] = useInView<HTMLSpanElement>();
  const [v, setV] = useState(0);
  useEffect(() => {
    if (!seen) return;
    if (window.matchMedia?.("(prefers-reduced-motion: reduce)").matches) { setV(value); return; }
    let raf = 0; const t0 = performance.now(), D = 900;
    const step = (now: number) => { const k = Math.min(1, (now - t0) / D); setV(value * (1 - Math.pow(1 - k, 3))); if (k < 1) raf = requestAnimationFrame(step); };
    raf = requestAnimationFrame(step);
    return () => cancelAnimationFrame(raf);
  }, [seen, value]);
  return <span ref={ref} className="tabular-nums">{v.toLocaleString(locale, { minimumFractionDigits: decimals, maximumFractionDigits: decimals })}{suffix}</span>;
}

/** Circular gauge 0..100 (null = not measured: empty ring, no number). */
export function Ring({ value, size = 132, label, sub }: { value: number | null; size?: number; label: string; sub: string }) {
  const [ref, seen] = useInView<HTMLDivElement>();
  const r = 52, c = 2 * Math.PI * r;
  const tone = value === null ? "#CBD2CC" : value >= 70 ? "#2E6B50" : value >= 45 ? "#B97C12" : "#B83A28";
  return (
    <div ref={ref} className="flex flex-col items-center text-center">
      <div className="relative" style={{ width: size, height: size }}>
        <svg viewBox="0 0 120 120" className="h-full w-full -rotate-90" aria-hidden>
          <circle cx="60" cy="60" r={r} fill="none" stroke="#14221E" strokeOpacity=".08" strokeWidth="9" />
          {value !== null && <circle cx="60" cy="60" r={r} fill="none" stroke={tone} strokeWidth="9" strokeLinecap="round"
            strokeDasharray={c} strokeDashoffset={seen ? c * (1 - value / 100) : c} style={{ transition: "stroke-dashoffset 1.1s cubic-bezier(.2,.7,.2,1)" }} />}
        </svg>
        <div className="absolute inset-0 flex flex-col items-center justify-center">
          {value === null ? <span className="font-display text-2xl font-bold text-mist">–</span>
            : <span className="font-display text-4xl font-extrabold"><CountUp value={value} /></span>}
          {value !== null && <span className="text-[11px] text-mist">/100</span>}
        </div>
      </div>
      <p className="mt-2 font-display font-bold">{label}</p>
      <p className="text-xs text-mist">{sub}</p>
    </div>
  );
}

/** Wrapper whose children receive `seen` to animate widths / positions. */
export function Reveal({ children, className = "" }: { children: (seen: boolean) => React.ReactNode; className?: string }) {
  const [ref, seen] = useInView<HTMLDivElement>(0.2);
  return <div ref={ref} className={className}>{children(seen)}</div>;
}

export const EASE = "cubic-bezier(.2,.7,.2,1)";
