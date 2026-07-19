import { NextResponse } from "next/server";
import { z } from "zod";
import prisma from "@/lib/prisma";
import { withAuth, type AuthenticatedRequest } from "@/lib/rbac";

const querySchema = z.object({
  status: z.enum(["ALL", "PENDING", "APPROVED", "REJECTED"]).default("ALL"),
  type: z.enum(["ALL", "PUBLIC", "PRIVATE"]).default("ALL"),
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(50),
});

/** 获取全部群聊巡查列表，包括私密群聊（管理员及以上）。 */
export const GET = withAuth(async (req: AuthenticatedRequest) => {
  try {
    const parsed = querySchema.safeParse({
      status: new URL(req.url).searchParams.get("status") || undefined,
      type: new URL(req.url).searchParams.get("type") || undefined,
      page: new URL(req.url).searchParams.get("page") || undefined,
      pageSize: new URL(req.url).searchParams.get("pageSize") || undefined,
    });
    if (!parsed.success) {
      return NextResponse.json({ error: "状态参数无效" }, { status: 400 });
    }

    const where = {
      ...(parsed.data.status === "ALL" ? {} : { status: parsed.data.status }),
      ...(parsed.data.type === "ALL" ? {} : { type: parsed.data.type }),
    };
    const [rooms, total] = await Promise.all([
      prisma.chatRoom.findMany({
        where,
        include: {
          createdBy: { select: { id: true, nickname: true, avatar: true } },
          _count: { select: { members: true, messages: true } },
        },
        orderBy: { updatedAt: "desc" },
        skip: (parsed.data.page - 1) * parsed.data.pageSize,
        take: parsed.data.pageSize,
      }),
      prisma.chatRoom.count({ where }),
    ]);

    return NextResponse.json({
      rooms,
      total,
      page: parsed.data.page,
      pageSize: parsed.data.pageSize,
      totalPages: Math.max(1, Math.ceil(total / parsed.data.pageSize)),
    });
  } catch (error) {
    console.error("GET /api/admin/chat-rooms error:", error);
    return NextResponse.json({ error: "服务器内部错误" }, { status: 500 });
  }
}, "ADMIN");
