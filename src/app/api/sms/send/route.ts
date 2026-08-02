import { NextRequest, NextResponse } from "next/server";
import { sendCodeSchema } from "@/lib/validators";
import { sendVerificationCode } from "@/lib/sms/verification";
import { withTelemetry } from "@/lib/telemetry";
import { enforceRateLimit, rateLimitKeyForIP, requestIP } from "@/lib/rate-limiter";

const post = async (request: NextRequest) => {
  try {
    const limited = await enforceRateLimit(
      `sms-send:${rateLimitKeyForIP(requestIP(request))}`,
      10,
      60 * 60 * 1000,
    );
    if (limited) {
      return new NextResponse(limited.response.body, {
        status: limited.response.status,
        headers: limited.response.headers,
      });
    }
    const body = await request.json();

    const parsed = sendCodeSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json(
        { error: "参数校验失败", details: parsed.error.flatten().fieldErrors },
        { status: 400 }
      );
    }

    const { phone, purpose } = parsed.data;

    const result = await sendVerificationCode(phone, purpose);

    if (!result.success) {
      // Rate limit error
      if (result.error === "请求过于频繁，请稍后再试" || result.error === "验证码发送次数已达上限，请稍后再试") {
        return NextResponse.json({ error: result.error }, { status: 429 });
      }
      // Send failure
      return NextResponse.json({ error: result.error }, { status: 500 });
    }

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("POST /api/sms/send error:", error);
    return NextResponse.json(
      { error: "验证码发送失败，请稍后再试" },
      { status: 500 }
    );
  }
};

export const POST = withTelemetry(post, { route: "/api/sms/send" });
