import { NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import { withAuth, type AuthenticatedRequest } from "@/lib/rbac";
import { logAudit, AuditAction, AuditTargetType } from "@/lib/audit";

export const DELETE = withAuth(async (req: AuthenticatedRequest, context) => {
  try {
    const { id } = await context.params;

    const invite = await prisma.inviteCode.findUnique({ where: { id } });

    if (!invite) {
      return NextResponse.json({ error: "邀请码不存在" }, { status: 404 });
    }

    if (invite.isUsed) {
      return NextResponse.json({ error: "已使用的邀请码不能撤销" }, { status: 400 });
    }

    if (invite.isRevoked) {
      return NextResponse.json({ error: "邀请码已被撤销" }, { status: 400 });
    }

    const updated = await prisma.inviteCode.update({
      where: { id },
      data: { isRevoked: true },
      select: {
        id: true,
        code: true,
        isRevoked: true,
      },
    });

    await logAudit(
      req.user.id,
      AuditAction.INVITE_REVOKE,
      AuditTargetType.INVITE_CODE,
      id,
      { code: invite.code },
    );

    return NextResponse.json({ invite: updated });
  } catch {
    return NextResponse.json({ error: "服务器内部错误" }, { status: 500 });
  }
}, "ADMIN");
