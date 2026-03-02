import { NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import { withAuth, type AuthenticatedRequest } from "@/lib/rbac";
import { paginationSchema } from "@/lib/validators";
import { AuditAction } from "@/lib/audit";
import { z } from "zod";

const auditActionValues = Object.values(AuditAction) as [string, ...string[]];

const querySchema = paginationSchema.extend({
  action: z.enum(auditActionValues).optional(),
  operatorId: z.string().optional(),
  targetType: z.string().optional(),
  startDate: z.string().datetime({ offset: true }).optional(),
  endDate: z.string().datetime({ offset: true }).optional(),
  format: z.enum(["json", "csv"]).default("json"),
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

    const { page, pageSize, action, operatorId, targetType, startDate, endDate, format } = parsed.data;

    const where: Record<string, unknown> = {};

    if (action) where.action = action;
    if (operatorId) where.operatorId = operatorId;
    if (targetType) where.targetType = targetType;

    if (startDate || endDate) {
      where.createdAt = {
        ...(startDate ? { gte: new Date(startDate) } : {}),
        ...(endDate ? { lte: new Date(endDate) } : {}),
      };
    }

    const [logs, total] = await Promise.all([
      prisma.auditLog.findMany({
        where,
        include: {
          operator: { select: { id: true, nickname: true, email: true } },
        },
        orderBy: { createdAt: "desc" },
        skip: (page - 1) * pageSize,
        take: pageSize,
      }),
      prisma.auditLog.count({ where }),
    ]);

    if (format === "csv") {
      const header = "ID,操作时间,操作者ID,操作者昵称,操作者邮箱,操作类型,目标类型,目标ID,详情,IP哈希";
      const rows = logs.map((log) => {
        const details = log.details ? JSON.stringify(log.details).replace(/"/g, '""') : "";
        return [
          log.id,
          log.createdAt.toISOString(),
          log.operatorId,
          log.operator?.nickname ?? "",
          log.operator?.email ?? "",
          log.action,
          log.targetType,
          log.targetId,
          `"${details}"`,
          log.ipHash ?? "",
        ].join(",");
      });

      const csv = [header, ...rows].join("\n");
      return new NextResponse(csv, {
        status: 200,
        headers: {
          "Content-Type": "text/csv; charset=utf-8",
          "Content-Disposition": `attachment; filename="audit-logs-${new Date().toISOString().slice(0, 10)}.csv"`,
        },
      });
    }

    return NextResponse.json({
      logs,
      total,
      page,
      pageSize,
      totalPages: Math.ceil(total / pageSize),
    });
  } catch {
    return NextResponse.json({ error: "服务器内部错误" }, { status: 500 });
  }
}, "ADMIN");
