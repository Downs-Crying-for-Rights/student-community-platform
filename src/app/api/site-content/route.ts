import { NextResponse } from "next/server";
import prisma from "@/lib/prisma";

/**
 * GET /api/site-content
 * 公开接口：列出所有站点内容文档的 key 和 title
 */
export async function GET() {
  const items = await prisma.siteContent.findMany({
    select: { key: true, title: true, updatedAt: true },
    orderBy: { key: "asc" },
  });
  return NextResponse.json({ items });
}
