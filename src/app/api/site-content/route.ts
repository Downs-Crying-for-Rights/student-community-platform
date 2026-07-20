import { NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import { LOGIN_POLICIES, REGISTRATION_POLICY_KEYS } from "@/lib/login-policies";
import { withTelemetry } from "@/lib/telemetry";

/**
 * GET /api/site-content
 * 公开接口：列出所有站点内容文档的 key 和 title
 */
const get = async () => {
  await Promise.all(REGISTRATION_POLICY_KEYS.map((key) => prisma.siteContent.upsert({
    where: { key },
    update: {},
    create: { key, title: LOGIN_POLICIES[key].title, content: LOGIN_POLICIES[key].content },
  })));
  const items = await prisma.siteContent.findMany({
    select: { key: true, title: true, revision: true, updatedAt: true },
    orderBy: { key: "asc" },
  });
  return NextResponse.json({ items });
};

export const GET = withTelemetry(get, { route: "/api/site-content" });
