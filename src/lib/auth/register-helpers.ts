import bcrypt from "bcryptjs";
import prisma from "@/lib/prisma";
import type { Prisma } from "@prisma/client";

export interface CreateUserParams {
  email: string;
  password: string;
  phone: string;
  nickname: string;
  /** Additional fields to set on the user record (e.g. dcrAccess, dcrPledgeSigned) */
  extraData?: Record<string, unknown>;
  /**
   * Optional callback that runs inside the same transaction after user creation.
   * Use this for related updates (e.g. marking an invite code as used).
   */
  afterCreate?: (tx: Prisma.TransactionClient, userId: string) => Promise<void>;
}

export interface CreateUserSuccess {
  userId: string;
}

export type CreateUserResult =
  | { success: true; data: CreateUserSuccess }
  | { success: false; error: string; status: number };

/**
 * 检查邮箱是否已注册
 */
export async function checkEmailUnique(email: string): Promise<{ error: string; status: number } | null> {
  const existing = await prisma.user.findUnique({
    where: { email },
    select: { id: true },
  });
  if (existing) {
    return { error: "该邮箱已被注册", status: 409 };
  }
  return null;
}

/**
 * 检查手机号是否已被绑定
 */
export async function checkPhoneUnique(phone: string): Promise<{ error: string; status: number } | null> {
  const existing = await prisma.user.findFirst({
    where: { phone },
    select: { id: true },
  });
  if (existing) {
    return { error: "该手机号已被其他账户绑定", status: 409 };
  }
  return null;
}

/**
 * 创建用户。
 *
 * 封装邮箱、手机号唯一性检查和密码哈希，供
 * register 和 invite 注册流程复用。登录会话由客户端在注册成功后通过
 * NextAuth Credentials Provider 创建，避免把数据库 Session 与 JWT 会话混用。
 *
 * @param afterCreate - 可选的事务内回调，用于创建用户后在同一事务中执行额外操作（如标记邀请码已使用）
 */
export async function createUserWithSession({
  email,
  password,
  phone,
  nickname,
  extraData = {},
  afterCreate,
}: CreateUserParams): Promise<CreateUserResult> {
  // 邮箱唯一性检查
  const emailError = await checkEmailUnique(email);
  if (emailError) {
    return { success: false, ...emailError };
  }

  const phoneError = await checkPhoneUnique(phone);
  if (phoneError) {
    return { success: false, ...phoneError };
  }

  // 密码哈希
  const passwordHash = await bcrypt.hash(password, 10);

  // 在事务中创建用户和 session
  const result = await prisma.$transaction(async (tx) => {
    const user = await tx.user.create({
      data: {
        email,
        passwordHash,
        phone,
        nickname,
        ...extraData,
        profileCompletionRequired: true,
      },
    });

    // 执行额外的事务内操作（如标记邀请码）
    if (afterCreate) {
      await afterCreate(tx, user.id);
    }

    return { userId: user.id };
  });

  return { success: true, data: result };
}

/**
 * 校验 nickname 非空且符合规范。
 * 返回 null 表示校验通过，否则返回错误信息。
 */
export function validateNickname(nickname: unknown): { error: string; status: number } | null {
  if (!nickname || (typeof nickname === "string" && nickname.trim().length === 0)) {
    return { error: "请输入用户名", status: 400 };
  }
  // nicknameSchema 已在 registerSchema / inviteRegisterSchema 中通过 Zod 校验
  // 此处做额外的前置兜底校验
  if (typeof nickname !== "string") {
    return { error: "请输入用户名", status: 400 };
  }
  return null;
}
