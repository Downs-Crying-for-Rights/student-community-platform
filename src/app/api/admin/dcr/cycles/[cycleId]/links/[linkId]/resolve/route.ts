import { NextResponse } from "next/server";

import { AuditAction, AuditTargetType, logAudit } from "@/lib/audit";
import { resolveCycleDispute } from "@/lib/mutual-aid-cycle";
import { notifyMutualAidUsersBestEffort } from "@/lib/mutual-aid-notifications";
import { withAuth, type AuthenticatedRequest } from "@/lib/rbac";
import { moderateCycleDisputeSchema } from "@/lib/validators";

const AUDIT_ACTIONS = {
  resume: AuditAction.CYCLE_DISPUTE_RESUME,
  reinvite: AuditAction.CYCLE_DISPUTE_REINVITE,
  close: AuditAction.CYCLE_DISPUTE_CLOSE,
} as const;

export const POST = withAuth(async (
  req: AuthenticatedRequest,
  context: { params: Record<string, string> },
) => {
  try {
    const { cycleId, linkId } = context.params;
    const parsed = moderateCycleDisputeSchema.safeParse(await req.json());
    if (!parsed.success) {
      return NextResponse.json({ error: "参数校验失败", details: parsed.error.flatten().fieldErrors }, { status: 400 });
    }
    const result = await resolveCycleDispute(
      cycleId,
      linkId,
      parsed.data.action,
      parsed.data.reason,
      async (tx, resolution) => {
        await tx.moderationAction.create({
        data: {
          actionType: `CYCLE_${parsed.data.action.toUpperCase()}`,
          targetType: "MUTUAL_AID_LINK",
          targetId: linkId,
          reason: parsed.data.reason,
          operatorId: req.user.id,
          details: { cycleId, cycleStatus: resolution.cycleStatus, linkStatus: resolution.linkStatus },
        },
        });
        await logAudit(req.user.id, AUDIT_ACTIONS[parsed.data.action], AuditTargetType.MUTUAL_AID_CYCLE, cycleId, {
          linkId,
          reason: parsed.data.reason,
          cycleStatus: resolution.cycleStatus,
          linkStatus: resolution.linkStatus,
        }, undefined, tx);
      },
    );
    await notifyMutualAidUsersBestEffort(result.participantIds, {
      title: parsed.data.action === "close" ? "互助循环已终止" : "互助循环争议已处理",
      content: parsed.data.action === "resume"
        ? "管理员已驳回争议，互助链路已恢复到争议前状态。"
        : parsed.data.action === "reinvite"
          ? "管理员已重置争议链路，请接收方重新确认邀请。"
          : "管理员已终止本次互助循环。",
      link: `/dcr/cycles/${cycleId}`,
    });
    return NextResponse.json(result);
  } catch (error) {
    const message = error instanceof Error ? error.message : "服务器内部错误";
    const status = message.includes("其他管理员") ? 409 : message.includes("不存在") ? 404 : 400;
    return NextResponse.json({ error: message }, { status });
  }
}, "ADMIN", { captureAllTelemetry: true });
