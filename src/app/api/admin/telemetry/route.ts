import { NextResponse } from "next/server";
import { Prisma } from "@prisma/client";
import { z } from "zod";
import prisma from "@/lib/prisma";
import { withAuth, type AuthenticatedRequest } from "@/lib/rbac";

export const dynamic = "force-dynamic";

const querySchema = z.object({
  hours: z.coerce.number().int().min(1).max(720).default(24),
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(10).max(100).default(50),
  method: z.enum(["GET", "POST", "PUT", "PATCH", "DELETE", "HEAD", "OPTIONS"]).optional(),
  status: z.union([z.enum(["2xx", "3xx", "4xx", "5xx"]), z.coerce.number().int().min(100).max(599)]).optional(),
  release: z.string().max(64).optional(),
  route: z.string().max(300).optional(),
});

type Percentiles = { p50: number | null; p95: number | null; p99: number | null };

function statusWhere(status: z.infer<typeof querySchema>["status"]): Prisma.IntNullableFilter | undefined {
  if (typeof status === "number") return { equals: status };
  if (!status) return undefined;
  const start = Number(status[0]) * 100;
  return { gte: start, lt: start + 100 };
}

export const GET = withAuth(async (req: AuthenticatedRequest) => {
  if (req.user.role !== "SUPER_ADMIN") {
    return NextResponse.json({ error: "仅超级管理员可查看遥测" }, { status: 403 });
  }
  const parsed = querySchema.safeParse(Object.fromEntries(new URL(req.url).searchParams));
  if (!parsed.success) return NextResponse.json({ error: "查询参数无效" }, { status: 400 });

  const { hours, page, pageSize, method, status, release, route } = parsed.data;
  const since = new Date(Date.now() - hours * 60 * 60 * 1000);
  const baseWhere: Prisma.TelemetryEventWhereInput = { scope: "SERVER", type: "request", createdAt: { gte: since } };
  const eventWhere: Prisma.TelemetryEventWhereInput = {
    ...baseWhere,
    ...(method ? { metadata: { path: ["method"], equals: method } } : {}),
    ...(status ? { status: statusWhere(status) } : {}),
    ...(release ? { release } : {}),
    ...(route ? { route } : {}),
  };

  const sqlConditions: Prisma.Sql[] = [
    Prisma.sql`"scope" = 'SERVER'::"TelemetryScope"`,
    Prisma.sql`"type" = 'request'`,
    Prisma.sql`"createdAt" >= ${since}`,
  ];
  if (method) sqlConditions.push(Prisma.sql`"metadata"->>'method' = ${method}`);
  if (typeof status === "number") sqlConditions.push(Prisma.sql`"status" = ${status}`);
  if (typeof status === "string") {
    const start = Number(status[0]) * 100;
    sqlConditions.push(Prisma.sql`"status" >= ${start} AND "status" < ${start + 100}`);
  }
  if (release) sqlConditions.push(Prisma.sql`"release" = ${release}`);
  if (route) sqlConditions.push(Prisma.sql`"route" = ${route}`);
  const sqlWhere = Prisma.join(sqlConditions, " AND ");

  const [filteredTotal, errors, events, groups, percentileRows, statusGroups, releases, routes] = await Promise.all([
    prisma.telemetryEvent.count({ where: eventWhere }),
    prisma.telemetryEvent.count({ where: { AND: [eventWhere, { status: { gte: 400 } }] } }),
    prisma.telemetryEvent.findMany({
      where: eventWhere,
      orderBy: { createdAt: "desc" },
      skip: (page - 1) * pageSize,
      take: pageSize,
      select: {
        id: true, scope: true, type: true, name: true, route: true, duration: true,
        status: true, release: true, metadata: true, createdAt: true,
      },
    }),
    prisma.telemetryEvent.groupBy({
      by: ["name", "route", "status"], where: eventWhere,
      _count: { _all: true }, _avg: { duration: true }, _max: { duration: true },
    }),
    prisma.$queryRaw<Percentiles[]>(Prisma.sql`
      SELECT
        percentile_cont(0.50) WITHIN GROUP (ORDER BY "duration")::float AS p50,
        percentile_cont(0.95) WITHIN GROUP (ORDER BY "duration")::float AS p95,
        percentile_cont(0.99) WITHIN GROUP (ORDER BY "duration")::float AS p99
      FROM "TelemetryEvent" WHERE ${sqlWhere} AND "duration" IS NOT NULL
    `),
    prisma.telemetryEvent.groupBy({ by: ["status"], where: eventWhere, _count: { _all: true } }),
    prisma.telemetryEvent.findMany({ where: { ...baseWhere, release: { not: null } }, distinct: ["release"], select: { release: true }, orderBy: { release: "asc" } }),
    prisma.telemetryEvent.findMany({ where: baseWhere, distinct: ["route"], select: { route: true }, orderBy: { route: "asc" } }),
  ]);

  const endpoints = new Map<string, { method: string; route: string; count: number; errors: number; durationTotal: number; maxDuration: number }>();
  for (const group of groups) {
    const endpoint = endpoints.get(group.name) ?? { method: group.name.split(" ", 1)[0], route: group.route, count: 0, errors: 0, durationTotal: 0, maxDuration: 0 };
    endpoint.count += group._count._all;
    if ((group.status ?? 0) >= 400) endpoint.errors += group._count._all;
    endpoint.durationTotal += (group._avg.duration ?? 0) * group._count._all;
    endpoint.maxDuration = Math.max(endpoint.maxDuration, group._max.duration ?? 0);
    endpoints.set(group.name, endpoint);
  }
  const endpointBreakdown = [...endpoints.values()].map((item) => ({
    ...item,
    avgDuration: item.count ? item.durationTotal / item.count : 0,
    errorRate: item.count ? item.errors / item.count : 0,
  }));
  const statusCounts = { "2xx": 0, "3xx": 0, "4xx": 0, "5xx": 0 };
  for (const item of statusGroups) {
    const key = `${Math.floor((item.status ?? 0) / 100)}xx` as keyof typeof statusCounts;
    if (key in statusCounts) statusCounts[key] += item._count._all;
  }
  const percentiles = percentileRows[0] ?? { p50: null, p95: null, p99: null };

  return NextResponse.json({
    hours,
    summary: { requests: filteredTotal, errors, errorRate: filteredTotal ? errors / filteredTotal : 0, ...percentiles },
    statusGroups: statusCounts,
    endpointBreakdown: [...endpointBreakdown].sort((a, b) => b.count - a.count).slice(0, 20),
    slowEndpoints: [...endpointBreakdown].sort((a, b) => b.avgDuration - a.avgDuration).slice(0, 10),
    errorEndpoints: endpointBreakdown.filter((item) => item.errors).sort((a, b) => b.errorRate - a.errorRate || b.errors - a.errors).slice(0, 10),
    filterOptions: { releases: releases.map((item) => item.release), routes: routes.map((item) => item.route) },
    events,
    pagination: { page, pageSize, total: filteredTotal, totalPages: Math.max(1, Math.ceil(filteredTotal / pageSize)) },
  }, { headers: { "Cache-Control": "no-store" } });
}, "SUPER_ADMIN", { route: "/api/admin/telemetry" });
