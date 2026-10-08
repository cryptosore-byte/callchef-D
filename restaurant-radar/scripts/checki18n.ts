import { readFileSync, readdirSync, statSync } from "fs";
import { join } from "path";
import { en } from "../src/i18n/en";
import { fr } from "../src/i18n/fr";
const files: string[] = [];
const walk = (d: string) => readdirSync(d).forEach((f) => { const p = join(d, f); statSync(p).isDirectory() ? walk(p) : /\.(ts|tsx)$/.test(f) && !p.includes("i18n/") && files.push(p); });
walk("src");
const used = new Set<string>();
for (const f of files) for (const m of readFileSync(f, "utf8").matchAll(/\b(?:t|tr)\(\s*"([A-Za-z0-9_.]+)"\s*[,)]/g)) used.add(m[1]);
// dynamic families
const dyn = ["home.stage1","home.stage2","home.stage3","home.stage4","home.stage5","dimShort.position","dimShort.reputation","dimShort.value","dimShort.convenience","dimShort.differentiation","dq.badge.HIGH","dq.badge.MEDIUM","dq.badge.LOW","plan.defend","plan.fix","plan.attack","plan.ignore","plan.hint.defend","plan.hint.fix","plan.hint.attack","plan.hint.ignore","verdict.YOU_WIN","verdict.COMPETITOR_WINS","verdict.TOO_CLOSE","priority.0","priority.1","priority.2","priority.3","priority.4","priority.5"];
dyn.forEach((k) => used.add(k));
const miss = (d: Record<string, string>, n: string) => [...used].filter((k) => !(k in d)).forEach((k) => console.log(`MISSING in ${n}:`, k));
miss(en, "en"); miss(fr, "fr");
for (const k of Object.keys(en)) if (!(k in fr) && !k.startsWith("sig.")) console.log("FR lacks", k);
for (const k of Object.keys(fr)) if (!(k in en) && !k.startsWith("sig.")) console.log("EN lacks", k);
// placeholder parity
for (const k of Object.keys(en)) if (fr[k]) { const a = (en[k].match(/\{\w+\}/g) ?? []).sort().join(), b = (fr[k].match(/\{\w+\}/g) ?? []).sort().join(); if (a !== b) console.log("PLACEHOLDER MISMATCH", k, a, "|", b); }
console.log("checked", used.size, "keys");
