import { NextResponse } from "next/server";
import { startJob } from "@/lib/jobs";
import { parseRadarBody } from "@/lib/radarInput";

export const runtime = "nodejs";

/** Start a scan. Returns immediately; poll GET /api/radar/jobs/{id}. */
export async function POST(req: Request) {
  const { input, locale, mode, area } = parseRadarBody(await req.json().catch(() => ({})));
  const job = startJob(input, locale, undefined, { mode, area });
  return NextResponse.json({ id: job.id }, { status: 202 });
}
