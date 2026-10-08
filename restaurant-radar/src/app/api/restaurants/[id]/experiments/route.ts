import { NextResponse } from "next/server";
import { OwnerActionError, ownerLogValue, ownerStartTest, ownerStopTest } from "@/services/continuous/OwnerActions";

export const runtime = "nodejs";
const STATUS = { not_found: 404, invalid: 400, busy: 409 } as const;
const fail = (e: unknown) => e instanceof OwnerActionError ? NextResponse.json({ code: e.code }, { status: STATUS[e.code] }) : NextResponse.json({ code: "error" }, { status: 500 });

/** Start a test: { type }. */
export async function POST(req: Request, { params }: { params: { id: string } }) {
  try { const b = await req.json(); return NextResponse.json(ownerStartTest(params.id, String(b?.type ?? ""))); } catch (e) { return fail(e); }
}

/** Update a running test: { experimentId, value } logs an owner measurement; { experimentId, action: "stop" } stops it. */
export async function PATCH(req: Request, { params }: { params: { id: string } }) {
  try {
    const b = await req.json();
    const id = String(b?.experimentId ?? "");
    return NextResponse.json(b?.action === "stop" ? ownerStopTest(params.id, id) : ownerLogValue(params.id, id, b?.value));
  } catch (e) { return fail(e); }
}
