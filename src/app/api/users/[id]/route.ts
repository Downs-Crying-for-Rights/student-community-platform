import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import prisma from "@/lib/prisma";
import { withAuth, type AuthenticatedRequest } from "@/lib/rbac";
import { updateProfileSchema } from "@/lib/validators";
import { scanContent } from "@/lib/sensitive-engine";
import { findAccountNameConflict } from "@/lib/auth/account-name";
import { isProfileComplete } from "@/lib/profile-completion";
import { createPrivateMediaUrl, parsePrivateMediaUrl } from "@/lib/oss";

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
        qqNumber: true,
        role: true,
        realVerifiedAt: true,
        studentVerifiedAt: true,
        createdAt: true,
        onboardingDone: true,
        psychAccess: true,
        dcrAccess: true,
        dcrHelperAccess: true,
        quizPassed: true,
        passwordHash: true,
        profileCompletionRequired: true,
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
    return NextResponse.json({ user: {
      ...rest,
      isAdministrator: rest.role === "ADMIN" || rest.role === "SUPER_ADMIN",
      realVerified: Boolean(rest.realVerifiedAt),
      studentVerified: Boolean(rest.studentVerifiedAt),
      isVerified: Boolean(rest.realVerifiedAt || rest.studentVerifiedAt),
      realVerifiedAt: undefined,
      studentVerifiedAt: undefined,
      hasPassword: !!passwordHash,
    } });
  }

  // 查看他人资料：仅返回公开字段
  const user = await prisma.user.findUnique({
    where: { id: targetId },
    select: {
      id: true,
      nickname: true,
      avatar: true,
      bio: true,
      role: true,
      realVerifiedAt: true,
      studentVerifiedAt: true,
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

  const { realVerifiedAt, studentVerifiedAt, role, ...publicUser } = user;
  return NextResponse.json({ user: {
    ...publicUser,
    isAdministrator: role === "ADMIN" || role === "SUPER_ADMIN",
    realVerified: Boolean(realVerifiedAt),
    studentVerified: Boolean(studentVerifiedAt),
    isVerified: Boolean(realVerifiedAt || studentVerifiedAt),
  } });
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

  const { nickname, avatar, bio, qqNumber } = parsed.data;

  // 昵称更新时执行敏感词检测
  if (nickname !== undefined) {
    const matches = await scanContent(nickname);
    if (matches.length > 0) {
      return NextResponse.json(
        { error: "昵称包含敏感词", matches },
        { status: 400 },
      );
    }
    const nicknameOwner = await findAccountNameConflict(prisma, nickname, targetId);
    if (nicknameOwner) {
      return NextResponse.json({ error: "该昵称已被使用" }, { status: 409 });
    }
  }

  // 确认用户存在
  const existing = await prisma.user.findUnique({
    where: { id: targetId },
    select: { id: true, nickname: true, avatar: true, bio: true, qqNumber: true, profileCompletionRequired: true },
  });

  if (!existing) {
    return NextResponse.json({ error: "用户不存在" }, { status: 404 });
  }

  let normalizedAvatar = avatar;
  if (avatar !== undefined && avatar !== existing.avatar) {
    const avatarKey = parsePrivateMediaUrl(avatar);
    if (!avatarKey) {
      return NextResponse.json({ error: "头像必须通过平台上传接口提交" }, { status: 400 });
    }
    normalizedAvatar = createPrivateMediaUrl(avatarKey);
  }

  // 构建更新数据（仅包含提供的字段）
  const updateData: Record<string, string | undefined> = {};
  if (nickname !== undefined) updateData.nickname = nickname;
  if (normalizedAvatar !== undefined) updateData.avatar = normalizedAvatar;
  if (bio !== undefined) updateData.bio = bio;
  if (qqNumber !== undefined) updateData.qqNumber = qqNumber;

  const nextProfile = {
    nickname: nickname ?? existing.nickname,
    avatar: normalizedAvatar ?? existing.avatar,
    qqNumber: qqNumber ?? existing.qqNumber,
  };
  if (existing.profileCompletionRequired && !isProfileComplete(nextProfile)) {
    return NextResponse.json(
      { error: "请完整填写昵称、头像和QQ号" },
      { status: 400 },
    );
  }

  const updatedUser = await prisma.user.update({
    where: { id: targetId },
    data: {
      ...updateData,
      ...(existing.profileCompletionRequired ? { profileCompletionRequired: false } : {}),
    },
    select: {
      id: true,
      nickname: true,
      avatar: true,
      bio: true,
      qqNumber: true,
      role: true,
      createdAt: true,
      profileCompletionRequired: true,
    },
  });

  return NextResponse.json({ user: updatedUser });
});
