import { NextResponse } from "next/server";
import prisma from "@/lib/prisma";

export async function GET(
  _req: Request,
  context: { params: Record<string, string> }
) {
  const { key } = context.params;
  const item = await prisma.siteContent.findUnique({
    where: { key },
    select: { title: true, content: true, updatedAt: true },
  });
  if (!item) {
    return NextResponse.json({ title: "用户协议", content: "", updatedAt: null });
  }
  return NextResponse.json(item);
}
