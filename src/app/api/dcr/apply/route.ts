import { NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import { withAuth, type AuthenticatedRequest } from "@/lib/rbac";
import { z } from "zod";

const applySchema = z.object({
  pledgeText: z.string().min(1, "守则声明不能为空"),
});

/**
 * POST /api/dcr/apply
 * Submit a DCR zone access application with signed pledge declaration.
 * - Requires authentication
 * - pledgeText must contain required phrases
 * - Returns 409 if user already has dcrAccess
 * - Returns 409 if user already has a PENDING DCR application
 * - Creates AccessApplication with type=DCR, pledgeText
 *
 * Validates: Requirements 9.1, 9.2
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

    const { pledgeText } = parsed.data;

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

    // Check if user already has dcrAccess
    const user = await prisma.user.findUnique({
      where: { id: userId },
      select: { dcrAccess: true },
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

    // Check if user already has a PENDING DCR application
    const pendingApplication = await prisma.accessApplication.findFirst({
      where: {
        applicantId: userId,
        type: "DCR",
        status: "PENDING",
      },
    });

    if (pendingApplication) {
      return NextResponse.json(
        { error: "您已有待审核的 DCR 准入申请" },
        { status: 409 },
      );
    }

    // Create application
    const application = await prisma.accessApplication.create({
      data: {
        type: "DCR",
        status: "PENDING",
        pledgeText,
        applicantId: userId,
      },
    });

    return NextResponse.json({ application }, { status: 201 });
  } catch (error) {
    console.error("POST /api/dcr/apply error:", error);
    return NextResponse.json({ error: "服务器内部错误" }, { status: 500 });
  }
});
