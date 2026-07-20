import { NextResponse } from "next/server";

import { cleanupExpiredIdentityEvidence } from "@/lib/cleanup";
import { isValidInternalBearer } from "@/lib/qq-bot-contract";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(request: Request): Promise<NextResponse> {
  if (!isValidInternalBearer(request.headers.get("authorization"), process.env.INTERNAL_API_TOKEN)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  try {
    const deleted = await cleanupExpiredIdentityEvidence();
    return NextResponse.json({ deleted });
  } catch (error) {
    console.error("Identity evidence cleanup failed", error);
    return NextResponse.json({ error: "Cleanup failed" }, { status: 500 });
  }
}
