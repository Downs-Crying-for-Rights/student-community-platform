import { NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import { withAuth, type AuthenticatedRequest } from "@/lib/rbac";
import { createTagSchema } from "@/lib/validators";
import { logAudit, AuditAction, AuditTargetType } from "@/lib/audit";

/**
 * GET /api/tags
 * Returns all tags ordered by name.
 * With ?hot=true: returns top 20 tags ordered by PUBLISHED post count descending.
 */
export const GET = withAuth(async (req: AuthenticatedRequest) => {
  try {
    const { searchParams } = new URL(req.url);
    const hot = searchParams.get("hot");

    if (hot === "true") {
      const tags = await prisma.tag.findMany({
        include: {
          _count: {
            select: {
              posts: {
                where: { post: { status: "PUBLISHED" } },
              },
            },
          },
        },
        orderBy: {
          posts: { _count: "desc" },
        },
        take: 20,
      });
      return NextResponse.json({ tags });
    }

    const tags = await prisma.tag.findMany({
      orderBy: { name: "asc" },
    });

    return NextResponse.json({ tags });
  } catch (error) {
    console.error("GET /api/tags error:", error);
    return NextResponse.json(
      { error: "服务器内部错误" },
      { status: 500 },
    );
  }
});

/**
 * POST /api/tags
 * Moderator+: create a new tag. Tag name must be unique.
 */
export const POST = withAuth(async (req: AuthenticatedRequest) => {
  try {
    const body = await req.json();
    const parsed = createTagSchema.safeParse(body);

    if (!parsed.success) {
      return NextResponse.json(
        { error: "参数校验失败", details: parsed.error.flatten().fieldErrors },
        { status: 400 },
      );
    }

    const { name } = parsed.data;

    // Check uniqueness
    const existing = await prisma.tag.findUnique({
      where: { name },
    });

    if (existing) {
      return NextResponse.json(
        { error: "标签名称已存在" },
        { status: 409 },
      );
    }

    const tag = await prisma.tag.create({
      data: { name },
    });

    await logAudit(
      req.user.id,
      AuditAction.BOARD_PERMISSION_CHANGE,
      AuditTargetType.BOARD,
      tag.id,
      { action: "CREATE_TAG", tagName: name },
    );

    return NextResponse.json({ tag }, { status: 201 });
  } catch (error) {
    console.error("POST /api/tags error:", error);
    return NextResponse.json(
      { error: "服务器内部错误" },
      { status: 500 },
    );
  }
}, "MODERATOR");
