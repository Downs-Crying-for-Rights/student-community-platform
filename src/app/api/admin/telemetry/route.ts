import { NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import { withAuth, type AuthenticatedRequest } from "@/lib/rbac";

export const dynamic = "force-dynamic";

export const GET = withAuth(async (req: AuthenticatedRequest) => {
  if (req.user.role !== "SUPER_ADMIN") {
    return NextResponse.json({ error: "仅超级管理员可查看遥测" }, { status: 403 });
  }
  const since = new Date(Date.now() - 24 * 60 * 60 * 1000);
  const [total, client, server, errors, recent, routeGroups, vitalGroups] = await Promise.all([
    prisma.telemetryEvent.count({ where: { createdAt: { gte: since } } }),
    prisma.telemetryEvent.count({ where: { scope: "CLIENT", createdAt: { gte: since } } }),
    prisma.telemetryEvent.count({ where: { scope: "SERVER", createdAt: { gte: since } } }),
    prisma.telemetryEvent.count({ where: { type: "error", createdAt: { gte: since } } }),
    prisma.telemetryEvent.findMany({
      where: { createdAt: { gte: since } }, orderBy: { createdAt: "desc" }, take: 50,
      select: { id: true, scope: true, type: true, name: true, route: true, duration: true, value: true, status: true, release: true, createdAt: true },
    }),
    prisma.telemetryEvent.groupBy({
      by: ["route"], where: { createdAt: { gte: since } }, _count: { _all: true }, _avg: { duration: true },
      orderBy: { _count: { route: "desc" } }, take: 10,
    }),
    prisma.telemetryEvent.groupBy({
      by: ["name"], where: { type: "web_vital", createdAt: { gte: since } },
      _count: { _all: true }, _avg: { value: true },
    }),
  ]);
  return NextResponse.json({
    summary: { total, client, server, errors, errorRate: total ? errors / total : 0 },
    topRoutes: routeGroups.map((item) => ({ route: item.route, count: item._count._all, avgDuration: item._avg.duration })),
    webVitals: vitalGroups.map((item) => ({ name: item.name, count: item._count._all, average: item._avg.value })),
    recent,
  }, { headers: { "Cache-Control": "no-store" } });
}, "SUPER_ADMIN");
