import { NextResponse } from "next/server";
import { z } from "zod";
import prisma from "@/lib/prisma";
import { withAuth, type AuthenticatedRequest } from "@/lib/rbac";

const querySchema = z.object({
  status: z.enum(["PENDING", "APPROVED", "REJECTED"]).default("PENDING"),
});

/** 获取公开群聊审核队列（版主及以上）。 */
export const GET = withAuth(async (req: AuthenticatedRequest) => {
  try {
    const parsed = querySchema.safeParse({
      status: new URL(req.url).searchParams.get("status") || undefined,
    });
    if (!parsed.success) {
      return NextResponse.json({ error: "状态参数无效" }, { status: 400 });
    }

    const rooms = await prisma.chatRoom.findMany({
      where: { type: "PUBLIC", status: parsed.data.status },
      include: {
        createdBy: { select: { id: true, nickname: true, avatar: true } },
        _count: { select: { members: true, messages: true } },
      },
      orderBy: { createdAt: "desc" },
    });

    return NextResponse.json({ rooms });
  } catch (error) {
    console.error("GET /api/admin/chat-rooms error:", error);
    return NextResponse.json({ error: "服务器内部错误" }, { status: 500 });
  }
}, "MODERATOR");
