/** Scan pipeline stages, in order (client-safe: no server imports). */
export const STAGES = ["find", "nearby", "competitors", "reviews", "decisions"] as const;
export type Stage = (typeof STAGES)[number];
