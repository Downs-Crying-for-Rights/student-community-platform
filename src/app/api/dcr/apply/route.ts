import { NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import { withAuth, type AuthenticatedRequest } from "@/lib/rbac";
import { z } from "zod";
import { evaluateDcrAdmission } from "@/lib/dcr-admission-policy";
import { sendAdminActionMail } from "@/lib/mail";

const applySchema = z.object({
  pledgeText: z.string().min(1, "守则声明不能为空"),
  caseId: z.string().min(1, "必须指定关联委托"),
});

/**
 * 兼容旧客户端的 DCR 申请入口。
 * 新申请必须已绑定手机号、通过考核，并存在管理员审核通过的委托。
 */
export const POST = withAuth(async (req: AuthenticatedRequest) => {
  try {
    const userId = req.user.id;

    const body = await req.json();
    const parsed = applySchema.safeParse(body);

    if (!parsed.success) {
      return NextResponse.json(
        { error: "参数校验失败", details: parsed.error.flatten().fieldErrors },
        { status: 400 },
      );
    }

    const { pledgeText, caseId } = parsed.data;

    // Validate pledge text contains required phrases
    if (
      !pledgeText.includes("已移除可识别信息") ||
      !pledgeText.includes("了解平台不组织不指挥不实施")
    ) {
      return NextResponse.json(
        { error: '守则声明必须包含"已移除可识别信息"和"了解平台不组织不指挥不实施"' },
        { status: 400 },
      );
    }

    const user = await prisma.user.findUnique({
      where: { id: userId },
      select: { id: true, dcrAccess: true, phone: true, quizPassed: true },
    });

    if (!user) {
      return NextResponse.json({ error: "用户不存在" }, { status: 404 });
    }

    if (user.dcrAccess) {
      return NextResponse.json(
        { error: "您已拥有 DCR 区访问权限" },
        { status: 409 },
      );
    }

    if (!user.phone) {
      return NextResponse.json(
        { error: "申请 DCR 前请先完成手机号验证", next: "/bindphone?callbackUrl=/dcr" },
        { status: 403 },
      );
    }

    if (!user.quizPassed) {
      return NextResponse.json(
        { error: "请先完成 DCR 入频考核", next: "/dcr/quiz" },
        { status: 403 },
      );
    }

    const [caseRecord, existingForCase, pendingApplication] = await Promise.all([
      prisma.case.findUnique({
        where: { id: caseId },
        select: { id: true, submitterId: true, requestStatus: true },
      }),
      prisma.accessApplication.findUnique({ where: { caseId } }),
      prisma.accessApplication.findFirst({
        where: { applicantId: userId, type: "DCR", status: "PENDING" },
      }),
    ]);

    if (existingForCase) {
      if (existingForCase.applicantId !== userId || existingForCase.type !== "DCR") {
        return NextResponse.json({ error: "该委托已关联其他准入申请" }, { status: 409 });
      }
      return NextResponse.json({ application: existingForCase, existing: true });
    }

    const decision = evaluateDcrAdmission({
      stage: "CREATE_APPLICATION",
      user: {
        id: userId,
        phone: user.phone,
        quizPassed: user.quizPassed,
        dcrAccess: user.dcrAccess,
      },
      case: caseRecord,
      hasOtherPendingApplication: Boolean(pendingApplication),
    });

    if (!decision.allowed) {
      const status = decision.code === "APPLICATION_ALREADY_PENDING" ? 409 : 403;
      return NextResponse.json(
        { error: decision.reason, code: decision.code, next: decision.next },
        { status },
      );
    }

    const application = await prisma.accessApplication.create({
      data: {
        type: "DCR",
        status: "PENDING",
        pledgeText,
        applicantId: userId,
        caseId,
      },
    });

    await sendAdminActionMail({
      minimumRole: "ADMIN",
      subject: "DCR 准入申请待审核",
      text: `收到新的 DCR 准入申请，关联委托：${caseId}。`,
      actionUrl: "/admin/applications?type=DCR&status=PENDING",
    });

    return NextResponse.json({ application }, { status: 201 });
  } catch (error) {
    console.error("POST /api/dcr/apply error:", error);
    return NextResponse.json({ error: "服务器内部错误" }, { status: 500 });
  }
});
