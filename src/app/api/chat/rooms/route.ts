import { NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import { withAuth, type AuthenticatedRequest } from "@/lib/rbac";
import { z } from "zod";
import { sendAdminActionMail } from "@/lib/mail";
import { getChatMonitoringConsent } from "@/lib/chat-monitoring-consent";
import { logAudit } from "@/lib/audit";

const createRoomSchema = z.object({
  name: z.string().min(1).max(50),
  description: z.string().max(200).optional(),
  type: z.enum(["PUBLIC", "PRIVATE"]).default("PUBLIC"),
  joinMode: z.enum(["DIRECT", "APPROVAL"]).default("DIRECT"),
  monitoringConsentAccepted: z.literal(true),
  monitoringConsentVersion: z.number().int().positive(),
});

/**
 * GET /api/chat/rooms — 获取群聊列表
 * - 返回公开群 + 当前用户已加入的私密群
 */
export const GET = withAuth(async (req: AuthenticatedRequest) => {
  try {
    const userId = req.user.id;

    const { searchParams } = new URL(req.url);
    const page = Math.max(1, parseInt(searchParams.get("page") ?? "1"));
    const pageSize = Math.min(50, Math.max(1, parseInt(searchParams.get("pageSize") ?? "20")));

    const [rooms, total] = await Promise.all([
      prisma.chatRoom.findMany({
        where: {
          OR: [
            { type: "PUBLIC", status: "APPROVED" },
            { members: { some: { userId } } },
            { createdById: userId },
          ],
        },
        include: {
          createdBy: { select: { id: true, nickname: true, avatar: true } },
          _count: { select: { members: true } },
          members: {
            where: { userId },
            select: { id: true },
          },
          messages: {
            where: {
              room: { members: { some: { userId } } },
            },
            orderBy: { createdAt: "desc" },
            take: 1,
            select: { id: true, content: true, createdAt: true },
          },
        },
        orderBy: { updatedAt: "desc" },
        skip: (page - 1) * pageSize,
        take: pageSize,
      }),
      prisma.chatRoom.count({
        where: {
          OR: [
            { type: "PUBLIC", status: "APPROVED" },
            { members: { some: { userId } } },
            { createdById: userId },
          ],
        },
      }),
    ]);

    const result = rooms.map((r) => {
      const isMember = r.members.length > 0;
      return {
        id: r.id,
        name: r.name,
        description: r.description,
        type: r.type,
        status: r.status,
        joinMode: r.joinMode,
        createdBy: r.createdBy,
        memberCount: r._count.members,
        isMember,
        lastMessage: isMember ? r.messages[0] ?? null : null,
        updatedAt: r.updatedAt,
      };
    });

    return NextResponse.json({ rooms: result, total, page, pageSize });
  } catch (error) {
    console.error("GET /api/chat/rooms error:", error);
    return NextResponse.json({ error: "服务器内部错误" }, { status: 500 });
  }
});

/**
 * POST /api/chat/rooms — 创建群聊
 */
export const POST = withAuth(async (req: AuthenticatedRequest) => {
  try {
    const body = await req.json();
    const parsed = createRoomSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json(
        { error: "参数校验失败", details: parsed.error.flatten().fieldErrors },
        { status: 400 },
      );
    }

    const { name, description, type, joinMode } = parsed.data;
    const userId = req.user.id;
    const consent = await getChatMonitoringConsent();
    if (parsed.data.monitoringConsentVersion !== consent.revision) {
      return NextResponse.json({
        error: "群聊巡查须知已更新，请重新阅读并确认",
        code: "CHAT_MONITORING_CONSENT_STALE",
        consent: { title: consent.title, content: consent.content, version: consent.revision },
      }, { status: 409 });
    }

    const room = await prisma.$transaction(async (tx) => {
      const created = await tx.chatRoom.create({
        data: {
          name,
          description: description ?? "",
          type,
          status: type === "PUBLIC" ? "PENDING" : "APPROVED",
          joinMode,
          createdById: userId,
          members: {
            create: {
              userId,
              role: "OWNER",
            },
          },
        },
        include: {
          createdBy: { select: { id: true, nickname: true } },
          _count: { select: { members: true } },
        },
      });
      await logAudit(userId, "CHAT_MONITORING_CONSENT_ACCEPT", "CHAT_ROOM", created.id, {
        version: consent.revision,
        roomType: type,
      }, undefined, tx);
      return created;
    });

    if (type === "PUBLIC") {
      await sendAdminActionMail({
        minimumRole: "MODERATOR",
        subject: "公开群聊待审核",
        text: `公开群聊「${room.name}」已创建，等待审核。`,
        actionUrl: "/admin/chat-rooms",
      });
    }

    return NextResponse.json(
      {
        room,
        message: type === "PUBLIC" ? "公开群聊已提交审核，通过后将对其他用户可见" : "私密群聊创建成功",
      },
      { status: 201 },
    );
  } catch (error) {
    console.error("POST /api/chat/rooms error:", error);
    return NextResponse.json({ error: "服务器内部错误" }, { status: 500 });
  }
});
