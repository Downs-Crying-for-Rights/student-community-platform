import { NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import { withAuth, type AuthenticatedRequest } from "@/lib/rbac";
import { z } from "zod";

const querySchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(200).default(50),
  level: z.enum(["DEBUG", "INFO", "WARN", "ERROR"]).optional(),
  source: z.string().optional(),
  search: z.string().optional(),
});

/**
 * GET /api/admin/logs
 * Query system logs. SUPER_ADMIN only.
 *
 * Query params:
 * - page, pageSize: pagination
 * - level: filter by DEBUG/INFO/WARN/ERROR
 * - source: filter by source (auth/post/psych...)
 * - search: search in message
 */
export const GET = withAuth(async (req: AuthenticatedRequest) => {
  try {
    // Restrict to SUPER_ADMIN only
    if (req.user.role !== "SUPER_ADMIN") {
      return NextResponse.json({ error: "仅超级管理员可查看系统日志" }, { status: 403 });
    }

    const { searchParams } = new URL(req.url);
    const parsed = querySchema.safeParse({
      page: searchParams.get("page") ?? undefined,
      pageSize: searchParams.get("pageSize") ?? undefined,
      level: searchParams.get("level") ?? undefined,
      source: searchParams.get("source") ?? undefined,
      search: searchParams.get("search") ?? undefined,
    });

    if (!parsed.success) {
      return NextResponse.json(
        { error: "参数校验失败", details: parsed.error.flatten().fieldErrors },
        { status: 400 },
      );
    }

    const { page, pageSize, level, source, search } = parsed.data;
    const skip = (page - 1) * pageSize;

    const where: Record<string, unknown> = {};
    if (level) where.level = level;
    if (source) where.source = source;
    if (search) {
      where.OR = [
        { message: { contains: search, mode: "insensitive" } },
        { detail: { contains: search, mode: "insensitive" } },
      ];
    }

    const [logs, total] = await Promise.all([
      prisma.systemLog.findMany({
        where,
        orderBy: { createdAt: "desc" },
        skip,
        take: pageSize,
      }),
      prisma.systemLog.count({ where }),
    ]);

    return NextResponse.json({ logs, total, page, pageSize });
  } catch (error) {
    console.error("GET /api/admin/logs error:", error);
    return NextResponse.json({ error: "服务器内部错误" }, { status: 500 });
  }
}, "SUPER_ADMIN");
