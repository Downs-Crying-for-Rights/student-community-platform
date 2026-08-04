import { createHash } from "node:crypto";
import { NextResponse } from "next/server";

import { claimQQRegistrationRateLimit, getQQRegistrationStatus } from "@/lib/qq-registration";
import { rateLimitKeyForIP, requestIP } from "@/lib/rate-limiter";
import { qqRegistrationStatusSchema } from "@/lib/validators";
import { withTelemetry } from "@/lib/telemetry";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const post = async (request: Request) => {
  const parsed = qqRegistrationStatusSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ status: "EXPIRED" }, { headers: { "Cache-Control": "no-store" } });
  try {
    const ip = requestIP(request);
    const credentialKey = createHash("sha256").update(parsed.data.credential).digest("hex");
    if (!await claimQQRegistrationRateLimit("status", rateLimitKeyForIP(ip), credentialKey, 600, 600)) {
      return NextResponse.json({ error: "Too Many Requests" }, { status: 429, headers: { "Cache-Control": "no-store" } });
    }
    const result = await getQQRegistrationStatus(parsed.data.credential);
    return NextResponse.json(result, { headers: { "Cache-Control": "no-store" } });
  } catch {
    return NextResponse.json({ error: "Temporary failure" }, { status: 503, headers: { "Cache-Control": "no-store" } });
  }
};

export const POST = withTelemetry(post, { route: "/api/auth/register/qq/status" });
