import { NextResponse } from "next/server";

import { withAuth } from "@/lib/rbac";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function removedResponse() {
  return NextResponse.json(
    { error: "身份认证功能已下线" },
    { status: 410, headers: { "Cache-Control": "private, no-store" } },
  );
}

export const GET = withAuth(async () => removedResponse());
export const POST = withAuth(async () => removedResponse());
export const DELETE = withAuth(async () => removedResponse());
