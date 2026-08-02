import { NextResponse } from "next/server";
import { z } from "zod";
import {
  issueCaptcha,
  issueCaptchaProof,
  markEmailCaptchaVerified,
  verifyCaptcha,
  type CaptchaPurpose,
} from "@/lib/captcha";
import { enforceRateLimit, rateLimitKeyForIP, requestIP } from "@/lib/rate-limiter";
import { withTelemetry } from "@/lib/telemetry";

const purposeSchema = z.enum(["login-email", "login-password", "register"]);
const verifySchema = z.object({
  captchaId: z.string(),
  captchaCode: z.string(),
  purpose: purposeSchema,
  subject: z.string().email().optional(),
});

function noStore(response: NextResponse) {
  response.headers.set("Cache-Control", "no-store");
  return response;
}

function limitedResponse(response: Response) {
  return noStore(new NextResponse(response.body, {
    status: response.status,
    headers: response.headers,
  }));
}

export const GET = withTelemetry(async (request: Request) => {
  const limited = await enforceRateLimit(
    `captcha-issue:${rateLimitKeyForIP(requestIP(request))}`,
    30,
    10 * 60 * 1000,
  );
  if (limited) return limitedResponse(limited.response);

  const purpose = purposeSchema.safeParse(new URL(request.url).searchParams.get("purpose"));
  if (!purpose.success) return noStore(NextResponse.json({ error: "验证码用途无效" }, { status: 400 }));
  return noStore(NextResponse.json(await issueCaptcha(purpose.data as CaptchaPurpose)));
}, { route: "/api/auth/captcha" });

export const POST = withTelemetry(async (request: Request) => {
  const limited = await enforceRateLimit(
    `captcha-verify:${rateLimitKeyForIP(requestIP(request))}`,
    30,
    10 * 60 * 1000,
  );
  if (limited) return limitedResponse(limited.response);

  const parsed = verifySchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success || (parsed.data.purpose === "login-email" && !parsed.data.subject)) {
    return noStore(NextResponse.json({ error: "验证码参数无效" }, { status: 400 }));
  }
  const valid = await verifyCaptcha(parsed.data.captchaId, parsed.data.captchaCode, parsed.data.purpose);
  if (!valid) return noStore(NextResponse.json({ error: "图形验证码错误或已过期" }, { status: 400 }));

  if (parsed.data.purpose === "login-email") {
    await markEmailCaptchaVerified(parsed.data.subject!);
    return noStore(NextResponse.json({ success: true }));
  }
  const proof = await issueCaptchaProof(parsed.data.purpose);
  return noStore(NextResponse.json({ success: true, proof }));
}, { route: "/api/auth/captcha" });
