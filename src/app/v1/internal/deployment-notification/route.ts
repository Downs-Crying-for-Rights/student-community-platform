import { NextResponse } from "next/server";
import { z } from "zod";
import { sendAdminActionMail } from "@/lib/mail";
import { isValidInternalBearer } from "@/lib/qq-bot-contract";
import { withTelemetry } from "@/lib/telemetry";

const payloadSchema = z.object({
  release: z.string().regex(/^[0-9a-f]{40}$/i),
  actor: z.string().trim().min(1).max(100),
  repository: z.string().regex(/^[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+$/),
}).strict();

export const POST = withTelemetry(async (request: Request) => {
  if (!isValidInternalBearer(request.headers.get("authorization"), process.env.INTERNAL_API_TOKEN)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const parsed = payloadSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid deployment payload" }, { status: 400 });
  }

  const shortRelease = parsed.data.release.slice(0, 12);
  const result = await sendAdminActionMail({
    minimumRole: "ADMIN",
    subject: `生产环境部署成功 ${shortRelease}`,
    text: [
      "forum.dcr2026.com 已完成新版本部署并通过健康检查。",
      `版本：${parsed.data.release}`,
      `仓库：${parsed.data.repository}`,
      `推送者：${parsed.data.actor}`,
      `时间：${new Date().toLocaleString("zh-CN", { timeZone: "Asia/Shanghai" })}`,
    ].join("\n"),
    actionUrl: `https://github.com/${parsed.data.repository}/commit/${parsed.data.release}`,
  });

  return NextResponse.json(
    { notified: result.sent, recipientCount: result.recipientCount, reason: result.reason ?? null },
    { status: result.sent ? 200 : 502 },
  );
}, { route: "/v1/internal/deployment-notification" });
