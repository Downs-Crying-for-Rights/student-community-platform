import { createHash } from "node:crypto";
import { NextResponse } from "next/server";

import { claimQQRegistrationRateLimit, getQQRegistrationStatus } from "@/lib/qq-registration";
import { rateLimitKeyForIP } from "@/lib/rate-limiter";
import { qqRegistrationStatusSchema } from "@/lib/validators";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  const parsed = qqRegistrationStatusSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ status: "EXPIRED" }, { headers: { "Cache-Control": "no-store" } });
  try {
    const ip = request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || "unknown";
    const credentialKey = createHash("sha256").update(parsed.data.credential).digest("hex");
    if (!await claimQQRegistrationRateLimit("status", rateLimitKeyForIP(ip), credentialKey, 600, 600)) {
      return NextResponse.json({ error: "Too Many Requests" }, { status: 429, headers: { "Cache-Control": "no-store" } });
    }
    const status = await getQQRegistrationStatus(parsed.data.credential);
    return NextResponse.json({ status }, { headers: { "Cache-Control": "no-store" } });
  } catch {
    return NextResponse.json({ error: "Temporary failure" }, { status: 503, headers: { "Cache-Control": "no-store" } });
  }
}
