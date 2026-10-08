import { NextResponse } from "next/server";
import { OwnerActionError, ownerSaveFinancials } from "@/services/continuous/OwnerActions";

export const runtime = "nodejs";

/** Owner-provided values for the simulator (average ticket, extra orders scenario). Never estimated by us. */
export async function PUT(req: Request, { params }: { params: { id: string } }) {
  try { return NextResponse.json(ownerSaveFinancials(params.id, await req.json())); }
  catch (e) { return NextResponse.json({ code: e instanceof OwnerActionError ? e.code : "error" }, { status: e instanceof OwnerActionError && e.code === "not_found" ? 404 : 400 }); }
}
