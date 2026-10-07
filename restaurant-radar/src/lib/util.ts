export function haversineM(lat1: number, lon1: number, lat2: number, lon2: number): number {
  const R = 6371000;
  const toRad = (d: number) => (d * Math.PI) / 180;
  const dLat = toRad(lat2 - lat1);
  const dLon = toRad(lon2 - lon1);
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLon / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(a));
}

export const clamp = (v: number, lo = 0, hi = 1) => Math.min(hi, Math.max(lo, v));

export function mulberry32(seed: number) {
  let a = seed >>> 0;
  return () => {
    a |= 0; a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export function shuffle<T>(arr: T[], rnd: () => number): T[] {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(rnd() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

export function percentile(values: number[], v: number): number {
  if (!values.length) return 0.5;
  const below = values.filter((x) => x < v).length;
  const equal = values.filter((x) => x === v).length;
  return (below + equal / 2) / values.length;
}

export const mean = (xs: number[]) => (xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : 0);

/** "HH:MM" -> minutes since midnight */
export const toMin = (hhmm: string) => {
  const [h, m] = hhmm.split(":").map(Number);
  return h * 60 + (m || 0);
};

/** Interval in minutes; closing past midnight is expressed as > 1440. */
export function interval(open: string, close: string): [number, number] {
  const o = toMin(open);
  let c = toMin(close);
  if (c <= o) c += 1440;
  return [o, c];
}

export function hoursOverlapRatio(a: [number, number], b: [number, number]): number {
  const len = a[1] - a[0];
  if (len <= 0) return 0;
  let best = 0;
  for (const s of [-1440, 0, 1440]) {
    best = Math.max(best, Math.max(0, Math.min(a[1], b[1] + s) - Math.max(a[0], b[0] + s)));
  }
  return best / len;
}

export const pct = (v: number) => `${Math.round(v * 100)}%`;
