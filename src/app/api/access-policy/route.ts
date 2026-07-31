import { getServerSession } from "next-auth/next";
import { NextResponse } from "next/server";
import { authOptions } from "@/lib/auth";
import { getSystemAccessPolicy } from "@/lib/system-config";
import { withTelemetry } from "@/lib/telemetry";

export const dynamic = "force-dynamic";

const get = async () => {
  const [policy, session] = await Promise.all([
    getSystemAccessPolicy(),
    getServerSession(authOptions),
  ]);
  return NextResponse.json({
    ...policy,
    phoneVerified: Boolean(session?.user?.phone),
  }, { headers: { "Cache-Control": "private, no-store" } });
};

export const GET = withTelemetry(get, { route: "/api/access-policy" });
