import { NextResponse } from "next/server";
import { withAuth, type AuthenticatedRequest } from "@/lib/rbac";
import {
  respondToLink,
  updateLinkProgress,
  disputeLink,
} from "@/lib/mutual-aid-cycle";
import { z } from "zod";
import { sendAdminActionMail } from "@/lib/mail";

const linkActionSchema = z.object({
  action: z.enum(["ACCEPTED", "REJECTED", "IN_PROGRESS", "COMPLETED", "DISPUTED"]),
  reason: z.string().max(500).optional(),
});

/**
 * PATCH /api/dcr/cycles/[id]/links/[linkId]
 * Update a link's state.
 * - ACCEPTED/REJECTED: toUser only
 * - IN_PROGRESS/COMPLETED: fromUser only
 * - DISPUTED: either participant
 */
export const PATCH = withAuth(async (
  req: AuthenticatedRequest,
  context: { params: Record<string, string> },
) => {
  try {
    const { id: cycleId, linkId } = context.params;
    const userId = req.user.id;

    const body = await req.json();
    const parsed = linkActionSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json(
        { error: "参数校验失败", details: parsed.error.flatten().fieldErrors },
        { status: 400 },
      );
    }

    const { action, reason } = parsed.data;
    let result: { cycleStatus: string; linkStatus: string };

    switch (action) {
      case "ACCEPTED":
      case "REJECTED":
        result = await respondToLink(linkId, userId, action);
        break;
      case "IN_PROGRESS":
      case "COMPLETED":
        result = await updateLinkProgress(linkId, userId, action);
        break;
      case "DISPUTED":
        result = await disputeLink(linkId, userId, reason ?? "争议");
        break;
    }

    if (action === "DISPUTED" || action === "REJECTED") {
      await sendAdminActionMail({
        minimumRole: "ADMIN",
        subject: action === "DISPUTED" ? "互助循环争议待处理" : "互助循环已断裂",
        text: `互助循环 ${cycleId} 的关系 ${linkId} 已${action === "DISPUTED" ? "发起争议" : "被拒绝"}。`,
        actionUrl: "/admin/dcr/cycles",
      });
    }

    return NextResponse.json(result);
  } catch (error: any) {
    console.error("PATCH /api/dcr/cycles/[id]/links/[linkId] error:", error);
    const message = error?.message || "服务器内部错误";
    return NextResponse.json({ error: message }, { status: 400 });
  }
}, undefined, { captureAllTelemetry: true });
