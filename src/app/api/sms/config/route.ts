import { NextResponse } from "next/server";
import { getSmsVerificationEnabled } from "@/lib/system-config";

export const dynamic = "force-dynamic";

export async function GET() {
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
}
