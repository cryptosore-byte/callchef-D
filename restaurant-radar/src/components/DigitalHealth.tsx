"use client";
import type { RadarResult, Reason } from "@/types";
import type { Check, Section } from "@/services/DigitalHealthService";
import type { T } from "@/i18n";
import { useLocale } from "@/i18n/client";
import { num, stars } from "@/lib/reasons";

const DC_CLS = { HIGH: "text-fennel", MEDIUM: "text-saffron", LOW: "text-mist" } as const;
const CHK_CLS = { OK: "bg-fennel", WEAK: "bg-saffron", MISSING: "bg-chili", UNKNOWN: "bg-line" } as const;

/** Check label; when a value is unknown, the "(...)" part with an unfilled placeholder is dropped. */
export const checkLabel = (t: T, c: Check) => {
  const s = t(c.key, c.params ? Object.fromEntries(Object.entries(c.params).map(([k, v]) => [k, num(v, t.locale)])) : undefined);
  return s.replace(/\s*\([^)]*\{\w+\}[^)]*\)/g, "");
};

export function insightText(t: T, r?: Reason) {
  if (!r) return null;
  const p: Record<string, string | number> = {};
  for (const [k, v] of Object.entries(r.params ?? {})) p[k] = k === "what" ? checkLabel(t, { key: String(v), status: "UNKNOWN", weight: 0 }) : k === "g" || k === "d" ? stars(v, t.locale) : num(v, t.locale);
  return t(r.code, p);
}

function Checks({ s }: { s: Section }) {
  const { t } = useLocale();
  return (
    <ul className="mt-2 space-y-1 text-sm">
      {s.checks.map((c, i) => (
        <li key={c.key + i} className="flex items-center justify-between gap-3">
          <span className="flex items-center gap-2"><span aria-hidden className={`h-2 w-2 shrink-0 rounded-full ${CHK_CLS[c.status]}`} />{checkLabel(t, c)}</span>
          <span className="shrink-0 text-xs text-mist">{t("chk." + c.status)}</span>
        </li>
      ))}
    </ul>
  );
}

function Card({ title, s, note, children }: { title: string; s: Section; note?: string; children?: React.ReactNode }) {
  const { t } = useLocale();
  return (
    <div className="rounded-2xl border border-line bg-paper p-4">
      <div className="flex items-baseline justify-between gap-2">
        <h3 className="font-display text-lg font-bold">{title}</h3>
        <span className="font-display text-2xl font-extrabold">{s.score ?? "–"}<span className="text-sm font-normal text-mist">{s.score !== null ? " /100" : ""}</span></span>
      </div>
      <p className={`text-xs font-bold ${DC_CLS[s.dataConfidence]}`}>{s.score === null ? t("health.notMeasured") : t("dc." + s.dataConfidence)}</p>
      {s.insight && <p className="mt-2 text-sm font-semibold">{insightText(t, s.insight)}</p>}
      {children}
      {s.checks.length > 0 && (
        <details className="mt-2"><summary className="cursor-pointer text-sm font-semibold underline">{t("health.details")}</summary><Checks s={s} />{note && <p className="mt-2 text-xs text-mist">{note}</p>}</details>
      )}
    </div>
  );
}

/** Secondary overview tiles (DIGITAL RESTAURANT HEALTH). */
export function HealthTiles({ r }: { r: RadarResult }) {
  const { t } = useLocale();
  const d = r.digital;
  if (!d) return null;
  return (
    <div aria-labelledby="health">
      <h3 id="health" className="font-display text-lg font-bold">{t("health.title")}</h3>
      <p className="mb-2 text-xs text-mist">{t("health.sub")}</p>
      <ul className="grid grid-cols-2 gap-2 md:grid-cols-6">
        {d.overview.map((o) => (
          <li key={o.key} className="rounded-xl border border-line bg-paper p-3">
            <p className="text-xs text-mist">{t("health." + o.key)}</p>
            <p className="font-display text-3xl font-extrabold">{o.score ?? "–"}</p>
            <p className={`text-xs font-semibold ${o.score === null ? "text-mist" : DC_CLS[o.dataConfidence]}`}>{o.score === null ? t("health.notConnected") : t("dc." + o.dataConfidence)}</p>
          </li>
        ))}
      </ul>
    </div>
  );
}

/** Detailed digital sections (question 4: where am I invisible or weak online?). */
export function DigitalHealth({ r }: { r: RadarResult }) {
  const { t, locale } = useLocale();
  const d = r.digital;
  if (!d) return null;
  const city = r.input.address;
  return (
    <section>
      <div className="grid gap-3 md:grid-cols-2">
        <Card title={t("rep.title")} s={d.reputation}>
          <ul className="mt-2 space-y-1 text-sm">
            {d.reputation.platforms.map((p) => (
              <li key={p.platform} className="flex justify-between gap-2">
                <span className="font-semibold">{t("platform." + p.platform)}</span>
                {p.status === "CONNECTED" && p.rating
                  ? <span>{stars(p.rating, locale)} ★ <span className="text-mist">{t("rep.count", { n: p.ratingCountText ?? num(p.ratingCount ?? 0, locale) })}</span></span>
                  : <span className="text-mist">{t("src." + p.status)}</span>}
              </li>
            ))}
          </ul>
        </Card>

        <Card title={t("vis.title")} s={d.visibility} note={t("vis.note")}>
          {d.visibility.search.status === "CONNECTED" && (
            <div className="mt-2 text-sm">
              <p className="text-xs font-bold uppercase tracking-wide text-mist">{t("vis.searchTitle")}</p>
              <ul className="space-y-0.5">
                {d.visibility.search.results.map((q) => (
                  <li key={q.query} className="flex justify-between gap-2"><span>« {q.query} » <span className="text-mist">{city}</span></span><span className="font-semibold">{q.rank !== null ? t("vis.rank", { r: q.rank }) : t("vis.notInTop", { n: d.visibility.search.topN })}</span></li>
                ))}
              </ul>
            </div>
          )}
        </Card>

        <Card title={t("ai.title")} s={d.ai} note={t("ai.note")} />

        {d.social.score === null
          ? <div className="rounded-2xl border border-line bg-paper p-4"><h3 className="font-display text-lg font-bold">{t("social.title")}</h3><p className="mt-1 text-sm text-mist">{t("src." + (d.social.profile?.status ?? "NOT_CONNECTED"))}</p></div>
          : (
            <Card title={t("social.title")} s={d.social}>
              <p className="mt-1 text-sm text-mist">@{d.social.profile?.username} · {t("social.followers", { n: num(d.social.profile?.followers ?? 0, locale) })} · {t("social.er", { p: num(((d.social.engagementRate ?? 0) * 100).toFixed(1), locale) })}</p>
            </Card>
          )}
      </div>
    </section>
  );
}
