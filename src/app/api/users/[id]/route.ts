import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import prisma from "@/lib/prisma";
import { withAuth, type AuthenticatedRequest } from "@/lib/rbac";
import { updateProfileSchema } from "@/lib/validators";
import { scanContent } from "@/lib/sensitive-engine";

// ==================== GET — 获取用户资料 ====================

export const GET = withAuth(async (req: AuthenticatedRequest, context) => {
  const { id: rawId } = await context.params;
  const currentUserId = req.user.id;
  const targetId = rawId === "me" ? currentUserId : rawId;
  const isOwnProfile = currentUserId === targetId;

  if (isOwnProfile) {
    // 查看自己的资料：返回完整数据
    const user = await prisma.user.findUnique({
      where: { id: targetId },
      select: {
        id: true,
        nickname: true,
        avatar: true,
        bio: true,
        role: true,
        createdAt: true,
        reputationScore: true,
        onboardingDone: true,
        psychAccess: true,
        dcrAccess: true,
        quizPassed: true,
        passwordHash: true,
        _count: {
          select: {
            posts: { where: { status: "PUBLISHED" } },
            likes: true,
          },
        },
      },
    });

    if (!user) {
      return NextResponse.json({ error: "用户不存在" }, { status: 404 });
    }

    // Expose hasPassword boolean instead of the actual hash
    const { passwordHash, ...rest } = user;
    return NextResponse.json({ user: { ...rest, hasPassword: !!passwordHash } });
  }

  // 查看他人资料：仅返回公开字段
  const user = await prisma.user.findUnique({
    where: { id: targetId },
    select: {
      id: true,
      nickname: true,
      avatar: true,
      bio: true,
      createdAt: true,
      _count: {
        select: {
          posts: { where: { status: "PUBLISHED" } },
          likes: true,
        },
      },
    },
  });

  if (!user) {
    return NextResponse.json({ error: "用户不存在" }, { status: 404 });
  }

  return NextResponse.json({ user });
});

// ==================== PATCH — 更新用户资料 ====================

export const PATCH = withAuth(async (req: AuthenticatedRequest, context) => {
  const { id: rawId } = await context.params;
  const currentUserId = req.user.id;
  const targetId = rawId === "me" ? currentUserId : rawId;

  // 只能更新自己的资料
  if (currentUserId !== targetId) {
    return NextResponse.json({ error: "只能修改自己的资料" }, { status: 403 });
  }

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "无效的请求体" }, { status: 400 });
  }

  const parsed = updateProfileSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "参数校验失败", details: parsed.error.flatten().fieldErrors },
      { status: 400 },
    );
  }

  const { nickname, avatar, bio } = parsed.data;

  // 昵称更新时执行敏感词检测
  if (nickname !== undefined) {
    const matches = await scanContent(nickname);
    if (matches.length > 0) {
      return NextResponse.json(
        { error: "昵称包含敏感词", matches },
        { status: 400 },
      );
    }
  }

  // 确认用户存在
  const existing = await prisma.user.findUnique({
    where: { id: targetId },
    select: { id: true },
  });

  if (!existing) {
    return NextResponse.json({ error: "用户不存在" }, { status: 404 });
  }

  // 构建更新数据（仅包含提供的字段）
  const updateData: Record<string, string | undefined> = {};
  if (nickname !== undefined) updateData.nickname = nickname;
  if (avatar !== undefined) updateData.avatar = avatar;
  if (bio !== undefined) updateData.bio = bio;

  const updatedUser = await prisma.user.update({
    where: { id: targetId },
    data: updateData,
    select: {
      id: true,
      nickname: true,
      avatar: true,
      bio: true,
      role: true,
      createdAt: true,
    },
  });

  return NextResponse.json({ user: updatedUser });
});
