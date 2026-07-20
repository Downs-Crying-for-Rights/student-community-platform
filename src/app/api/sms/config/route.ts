import { NextResponse } from "next/server";
import { getSmsVerificationEnabled } from "@/lib/system-config";
import { withTelemetry } from "@/lib/telemetry";

export const dynamic = "force-dynamic";

const get = async () => {
  try {
    const enabled = await getSmsVerificationEnabled();
    return NextResponse.json(
      { verificationRequired: enabled },
      { headers: { "Cache-Control": "no-store" } },
    );
  } catch (error) {
    console.error("GET /api/sms/config error:", error);
    return NextResponse.json(
      { verificationRequired: true },
      { headers: { "Cache-Control": "no-store" } },
    );
  }
};

export const GET = withTelemetry(get, { route: "/api/sms/config" });
