import { NextResponse } from "next/server";

import { withAuth } from "@/lib/rbac";

export const POST = withAuth(async () => NextResponse.json(
  { error: "身份认证功能已下线" },
  { status: 410, headers: { "Cache-Control": "private, no-store" } },
));
