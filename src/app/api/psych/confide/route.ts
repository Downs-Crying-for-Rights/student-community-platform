import { NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import { withAuth, type AuthenticatedRequest } from "@/lib/rbac";
import { generateAnonymousId } from "@/lib/utils";
import { z } from "zod";

const confideSchema = z.object({
  summary: z.string().min(1).max(500),
});

/**
 * POST /api/psych/confide
 * Submit a confide request (倾诉请求).
 * - Requires auth + psychAccess
 * - Body: { summary: string } (max 500 chars)
 * - Check user doesn't have an active WAITING/MATCHED/ACTIVE request
 * - Generate anonymousId, set expiresAt to 30 days
 * - Return created request (without requesterId exposed)
 *
 * Validates: Requirements 8.4, 12.1
 */
export const POST = withAuth(async (req: AuthenticatedRequest) => {
  try {
    const userId = req.user.id;

    // Check psychAccess
    const user = await prisma.user.findUnique({
      where: { id: userId },
      select: { psychAccess: true },
    });

    if (!user) {
      return NextResponse.json({ error: "用户不存在" }, { status: 404 });
    }

    if (!user.psychAccess) {
      return NextResponse.json({ error: "无心理区访问权限" }, { status: 403 });
    }

    // Parse body
    const body = await req.json();
    const parsed = confideSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json(
        { error: "参数校验失败", details: parsed.error.flatten().fieldErrors },
        { status: 400 },
      );
    }

    // Check for existing active request
    const existingRequest = await prisma.confideRequest.findFirst({
      where: {
        requesterId: userId,
        status: { in: ["WAITING", "MATCHED", "ACTIVE"] },
      },
    });

    if (existingRequest) {
      return NextResponse.json(
        { error: "您已有进行中的倾诉请求" },
        { status: 409 },
      );
    }

    const anonymousId = generateAnonymousId();
    const expiresAt = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000);

    const confideRequest = await prisma.confideRequest.create({
      data: {
        summary: parsed.data.summary,
        anonymousId,
        status: "WAITING",
        expiresAt,
        requesterId: userId,
      },
    });

    // Return without exposing requesterId
    return NextResponse.json(
      {
        confideRequest: {
          id: confideRequest.id,
          summary: confideRequest.summary,
          anonymousId: confideRequest.anonymousId,
          status: confideRequest.status,
          expiresAt: confideRequest.expiresAt,
          createdAt: confideRequest.createdAt,
        },
      },
      { status: 201 },
    );
  } catch (error) {
    console.error("POST /api/psych/confide error:", error);
    return NextResponse.json({ error: "服务器内部错误" }, { status: 500 });
  }
});
