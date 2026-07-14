import { NextResponse } from "next/server";
import type { Prisma } from "@prisma/client";
import { z } from "zod";
import prisma from "@/lib/prisma";
import { withAuth, type AuthenticatedRequest } from "@/lib/rbac";

export const dynamic = "force-dynamic";

const querySchema = z.object({
  hours: z.coerce.number().int().min(1).max(720).default(24),
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(10).max(100).default(50),
  scope: z.enum(["CLIENT", "SERVER"]).optional(),
  type: z.enum(["page_view", "web_vital", "request", "event", "error"]).optional(),
  search: z.string().max(200).optional(),
});

export const GET = withAuth(async (req: AuthenticatedRequest) => {
  if (req.user.role !== "SUPER_ADMIN") {
    return NextResponse.json({ error: "仅超级管理员可查看遥测" }, { status: 403 });
  }
  const params = Object.fromEntries(new URL(req.url).searchParams);
  const parsed = querySchema.safeParse(params);
  if (!parsed.success) return NextResponse.json({ error: "查询参数无效" }, { status: 400 });

  const { hours, page, pageSize, scope, type, search } = parsed.data;
  const since = new Date(Date.now() - hours * 60 * 60 * 1000);
  const baseWhere: Prisma.TelemetryEventWhereInput = { createdAt: { gte: since } };
  const eventWhere: Prisma.TelemetryEventWhereInput = {
    ...baseWhere,
    ...(scope ? { scope } : {}),
    ...(type ? { type } : {}),
    ...(search ? {
      OR: [
        { name: { contains: search, mode: "insensitive" } },
        { route: { contains: search, mode: "insensitive" } },
        { release: { contains: search, mode: "insensitive" } },
      ],
    } : {}),
  };

  const [total, client, server, errors, filteredTotal, events, routeGroups, vitalGroups] = await Promise.all([
    prisma.telemetryEvent.count({ where: baseWhere }),
    prisma.telemetryEvent.count({ where: { ...baseWhere, scope: "CLIENT" } }),
    prisma.telemetryEvent.count({ where: { ...baseWhere, scope: "SERVER" } }),
    prisma.telemetryEvent.count({ where: { ...baseWhere, type: "error" } }),
    prisma.telemetryEvent.count({ where: eventWhere }),
    prisma.telemetryEvent.findMany({
      where: eventWhere,
      orderBy: { createdAt: "desc" },
      skip: (page - 1) * pageSize,
      take: pageSize,
      select: {
        id: true, scope: true, type: true, name: true, route: true,
        duration: true, value: true, status: true, sessionId: true, userId: true,
        release: true, userAgent: true, metadata: true, createdAt: true,
      },
    }),
    prisma.telemetryEvent.groupBy({
      by: ["route"], where: baseWhere, _count: { _all: true }, _avg: { duration: true },
      orderBy: { _count: { route: "desc" } }, take: 10,
    }),
    prisma.telemetryEvent.groupBy({
      by: ["name"], where: { ...baseWhere, type: "web_vital" },
      _count: { _all: true }, _avg: { value: true },
    }),
  ]);

  return NextResponse.json({
    hours,
    summary: { total, client, server, errors, errorRate: total ? errors / total : 0 },
    topRoutes: routeGroups.map((item) => ({ route: item.route, count: item._count._all, avgDuration: item._avg.duration })),
    webVitals: vitalGroups.map((item) => ({ name: item.name, count: item._count._all, average: item._avg.value })),
    events,
    pagination: { page, pageSize, total: filteredTotal, totalPages: Math.max(1, Math.ceil(filteredTotal / pageSize)) },
  }, { headers: { "Cache-Control": "no-store" } });
}, "SUPER_ADMIN");
