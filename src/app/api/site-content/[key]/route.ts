import { NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import { COMMUNITY_GUIDELINES_KEY, getCommunityGuidelines } from "@/lib/community-guidelines";

export async function GET(
  _req: Request,
  context: { params: Record<string, string> }
) {
  const { key } = context.params;
  if (key === COMMUNITY_GUIDELINES_KEY) {
    return NextResponse.json(await getCommunityGuidelines());
  }
  const item = await prisma.siteContent.findUnique({
    where: { key },
    select: { title: true, content: true, updatedAt: true },
  });
  if (!item) {
    return NextResponse.json({ title: "用户协议", content: "", updatedAt: null });
  }
  return NextResponse.json(item);
}
