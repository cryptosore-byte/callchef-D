import { NextResponse } from "next/server";
import { isLive, ApifyError } from "@/lib/pipeline";
import { runScan } from "@/lib/orchestrator";
import { makeT, type Locale } from "@/i18n";
import { parseRadarBody } from "@/lib/radarInput";

export const runtime = "nodejs";
export const maxDuration = 300;

const STATUS = { not_found: 404, rate_limit: 429, actor_failed: 502, timeout: 504, network: 502 } as const;

/** Synchronous scan (scripts, small hosts). The UI uses /api/radar/jobs. */
export async function POST(req: Request) {
  let locale: Locale = "en";
  try {
    const parsed = parseRadarBody(await req.json());
    locale = parsed.locale;
    return NextResponse.json(await runScan(parsed.input, locale, { mode: parsed.mode, area: parsed.area }));
  } catch (e) {
    const t = makeT(locale);
    if (e instanceof ApifyError) return NextResponse.json({ error: t("err." + e.code), code: e.code }, { status: STATUS[e.code] });
    console.error("radar failed", e);
    return NextResponse.json({ error: t("home.errFail") }, { status: 500 });
  }
}

export async function GET() {
  return NextResponse.json({ live: isLive() });
}
