import { NextResponse } from "next/server";
import { getJob, type JobView } from "@/lib/jobs";
import { ApifyError } from "@/lib/pipeline";
import { isLocale, makeT } from "@/i18n";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(req: Request, { params }: { params: { id: string } }) {
  const lang = new URL(req.url).searchParams.get("locale");
  const t = makeT(isLocale(lang) ? lang : "en");
  const job = getJob(params.id);
  if (!job) return NextResponse.json({ error: t("scan.expired"), code: "expired" }, { status: 404 });
  const { error, ...rest } = job;
  const view: JobView = rest;
  if (job.status === "error") {
    if (error instanceof ApifyError) {
      console.warn("radar job: apify", error.message); // e.g. "actor_failed: HTTP 401" (never contains the token)
      view.error = t("err." + error.code); view.code = error.code;
    }
    else { console.error("radar job failed", error); view.error = t("home.errFail"); }
  }
  // The full result replaces the partial: do not send both.
  if (job.status === "done") view.partial = { demo: job.partial.demo };
  return NextResponse.json(view, { headers: { "Cache-Control": "no-store" } });
}
