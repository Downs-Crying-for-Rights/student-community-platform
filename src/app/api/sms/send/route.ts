import { NextRequest, NextResponse } from "next/server";
import { sendCodeSchema } from "@/lib/validators";
import { sendVerificationCode } from "@/lib/sms/verification";

export async function POST(request: NextRequest) {
  try {
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
      if (result.error === "请求过于频繁，请稍后再试") {
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
}
