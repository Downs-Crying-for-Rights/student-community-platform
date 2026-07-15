import { NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import { withAuth, type AuthenticatedRequest } from "@/lib/rbac";
import { createCycle } from "@/lib/mutual-aid-cycle";
import { z } from "zod";

const createCycleSchema = z.object({
  mode: z.enum(["TWO_PARTY", "THREE_PARTY"]).default("THREE_PARTY"),
  participantBId: z.string().min(1, "请选择B方"),
  participantCId: z.string().optional(),
  descriptions: z.object({
    AB: z.string().max(500).optional(),
    BA: z.string().max(500).optional(),
    BC: z.string().max(500).optional(),
    CA: z.string().max(500).optional(),
  }).optional(),
}).superRefine((data, ctx) => {
  if (data.mode === "THREE_PARTY" && !data.participantCId?.trim()) {
    ctx.addIssue({ code: "custom", path: ["participantCId"], message: "三方互助请选择 C 方" });
  }
});

/**
 * POST /api/dcr/cycles
 * Create a new three-party mutual aid cycle.
 */
export const POST = withAuth(async (req: AuthenticatedRequest) => {
  try {
    const body = await req.json();
    const parsed = createCycleSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json(
        { error: "参数校验失败", details: parsed.error.flatten().fieldErrors },
        { status: 400 },
      );
    }

    const cycle = await createCycle({
      initiatorId: req.user.id,
      mode: parsed.data.mode,
      participantBId: parsed.data.participantBId,
      participantCId: parsed.data.participantCId,
      descriptions: parsed.data.descriptions,
    });

    return NextResponse.json({ cycle }, { status: 201 });
  } catch (error: any) {
    console.error("POST /api/dcr/cycles error:", error);
    const message = error?.message || "服务器内部错误";
    const status = message.includes("不存在") ? 404
      : message.includes("活跃") || message.includes("考核") ? 409
        : message.includes("不同") ? 400 : 500;
    return NextResponse.json({ error: message }, { status });
  }
});

/**
 * GET /api/dcr/cycles
 * List cycles the current user participates in.
 */
export const GET = withAuth(async (req: AuthenticatedRequest) => {
  try {
    const userId = req.user.id;
    const { searchParams } = new URL(req.url);
    const status = searchParams.get("status") || undefined;

    const where: Record<string, unknown> = {
      OR: [
        { initiatorId: userId },
        { links: { some: { fromUserId: userId } } },
        { links: { some: { toUserId: userId } } },
      ],
    };
    if (status) where.status = status;

    const cycles = await prisma.mutualAidCycle.findMany({
      where,
      orderBy: { createdAt: "desc" },
      include: {
        initiator: { select: { id: true, nickname: true, avatar: true } },
        links: {
          include: {
            fromUser: { select: { id: true, nickname: true } },
            toUser: { select: { id: true, nickname: true } },
          },
        },
      },
    });

    return NextResponse.json({ cycles });
  } catch (error) {
    console.error("GET /api/dcr/cycles error:", error);
    return NextResponse.json({ error: "服务器内部错误" }, { status: 500 });
  }
});
