import { NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import { withAuth, type AuthenticatedRequest } from "@/lib/rbac";
import { logAudit, AuditAction, AuditTargetType } from "@/lib/audit";
import { paginationSchema } from "@/lib/validators";
import { generateInviteCode } from "@/lib/utils";
import { z } from "zod";

const querySchema = paginationSchema.extend({
  status: z.enum(["all", "unused", "used", "revoked"]).default("all"),
});

const createSchema = z.object({
  count: z.coerce.number().int().min(1).max(10).default(1),
  expiresInDays: z.coerce.number().int().min(1).max(365).default(7),
});

export const GET = withAuth(async (req: AuthenticatedRequest) => {
  try {
    const url = new URL(req.url);
    const params = Object.fromEntries(url.searchParams.entries());
    const parsed = querySchema.safeParse(params);

    if (!parsed.success) {
      return NextResponse.json(
        { error: "参数校验失败", details: parsed.error.flatten() },
        { status: 400 },
      );
    }

    const { page, pageSize, status } = parsed.data;

    const where: Record<string, unknown> = {};

    if (status === "unused") {
      where.isUsed = false;
      where.isRevoked = false;
    } else if (status === "used") {
      where.isUsed = true;
    } else if (status === "revoked") {
      where.isRevoked = true;
    }

    const [invites, total] = await Promise.all([
      prisma.inviteCode.findMany({
        where,
        select: {
          id: true,
          code: true,
          isUsed: true,
          isRevoked: true,
          expiresAt: true,
          createdAt: true,
          usedAt: true,
          creator: { select: { id: true, nickname: true, email: true } },
          usedBy: { select: { id: true, nickname: true, email: true } },
        },
        orderBy: { createdAt: "desc" },
        skip: (page - 1) * pageSize,
        take: pageSize,
      }),
      prisma.inviteCode.count({ where }),
    ]);

    return NextResponse.json({
      invites,
      total,
      page,
      pageSize,
      totalPages: Math.ceil(total / pageSize),
    });
  } catch {
    return NextResponse.json({ error: "服务器内部错误" }, { status: 500 });
  }
}, "ADMIN");

export const POST = withAuth(async (req: AuthenticatedRequest) => {
  try {
    const body = await req.json();
    const parsed = createSchema.safeParse(body);

    if (!parsed.success) {
      return NextResponse.json(
        { error: "参数校验失败", details: parsed.error.flatten() },
        { status: 400 },
      );
    }

    const { count, expiresInDays } = parsed.data;
    const expiresAt = new Date();
    expiresAt.setDate(expiresAt.getDate() + expiresInDays);

    const codes: { id: string; code: string; expiresAt: Date }[] = [];

    for (let i = 0; i < count; i++) {
      const code = generateInviteCode();
      const invite = await prisma.inviteCode.create({
        data: {
          code,
          expiresAt,
          creatorId: req.user.id,
        },
        select: { id: true, code: true, expiresAt: true },
      });
      codes.push(invite);
    }

    await logAudit(
      req.user.id,
      AuditAction.INVITE_CREATE,
      AuditTargetType.INVITE_CODE,
      codes.map((c) => c.id).join(","),
      { count, expiresInDays },
    );

    return NextResponse.json({ invites: codes }, { status: 201 });
  } catch {
    return NextResponse.json({ error: "服务器内部错误" }, { status: 500 });
  }
}, "ADMIN");
