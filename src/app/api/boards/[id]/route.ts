import { NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import { withAuth, type AuthenticatedRequest } from "@/lib/rbac";
import { updateBoardSchema } from "@/lib/validators";

/**
 * PATCH /api/boards/[id]
 * Admin-only: update board name, description, sortWeight, or isActive.
 */
export const PATCH = withAuth(async (
  req: AuthenticatedRequest,
  context: { params: Record<string, string> },
) => {
  try {
    const { id } = context.params;

    const existing = await prisma.board.findUnique({ where: { id } });
    if (!existing) {
      return NextResponse.json({ error: "板块不存在" }, { status: 404 });
    }

    const body = await req.json();
    const parsed = updateBoardSchema.safeParse(body);

    if (!parsed.success) {
      return NextResponse.json(
        { error: "参数校验失败", details: parsed.error.flatten().fieldErrors },
        { status: 400 },
      );
    }

    const data = parsed.data;

    const board = await prisma.board.update({
      where: { id },
      data,
    });

    return NextResponse.json({ board });
  } catch (error) {
    console.error("PATCH /api/boards/[id] error:", error);
    return NextResponse.json(
      { error: "服务器内部错误" },
      { status: 500 },
    );
  }
}, "ADMIN");
