import type { NextAuthOptions } from "next-auth";
import type { JWT } from "next-auth/jwt";
import EmailProvider from "next-auth/providers/email";
import CredentialsProvider from "next-auth/providers/credentials";
import { PrismaAdapter } from "@auth/prisma-adapter";
import type { Adapter, AdapterUser } from "next-auth/adapters";
import { prisma } from "@/lib/prisma";
import nodemailer from "nodemailer";
import bcrypt from "bcryptjs";
import { loginPasswordSchema } from "@/lib/validators";
import { getCurrentPunishmentStatus } from "@/lib/punishment-service";
import {
  captchaTargetKey,
  consumeEmailCaptchaVerified,
  consumeRecentRegistration,
  validateCaptchaProof,
} from "@/lib/captcha";
import { checkRateLimit } from "@/lib/rate-limiter";

export function escapeHtmlAttribute(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/"/g, "&quot;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}

// ==================== Auth Options ====================

const baseAdapter = PrismaAdapter(prisma) as Adapter;
const adapter: Adapter = {
  ...baseAdapter,
  createUser: (async (_user: AdapterUser | Omit<AdapterUser, "id">) => {
    throw new Error("RegistrationRequired");
  }) as NonNullable<Adapter["createUser"]>,
};

export const authOptions: NextAuthOptions = {
  adapter,
  providers: [
    EmailProvider({
      server: {
        host: process.env.SMTP_HOST,
        port: Number(process.env.SMTP_PORT) || 587,
        secure: Number(process.env.SMTP_PORT) === 465,
        auth: {
          user: process.env.SMTP_USER,
          pass: process.env.SMTP_PASSWORD,
        },
        tls: process.env.SMTP_TLS_SERVERNAME
          ? { servername: process.env.SMTP_TLS_SERVERNAME }
          : undefined,
      },
      from: process.env.SMTP_FROM || "noreply@example.com",
      maxAge: 15 * 60,
      async sendVerificationRequest({ identifier: email, url, provider }) {
        if (!await consumeEmailCaptchaVerified(email)) {
          throw new Error("CaptchaRequired");
        }
        const emailLimit = await checkRateLimit(
          `email-login:${captchaTargetKey(email)}`,
          5,
          60 * 60 * 1000,
        );
        if (!emailLimit.allowed) throw new Error("EmailRateLimited");
        const transport = nodemailer.createTransport(provider.server);
        const escapedUrl = escapeHtmlAttribute(url);
        await transport.sendMail({
          to: email,
          from: provider.from,
          subject: "登录学互会",
          text: `点击以下链接登录学互会：\n\n${url}\n\n此链接将在 15 分钟后过期。`,
          html: `
            <div style="max-width: 480px; margin: 0 auto; font-family: sans-serif;">
              <h2 style="color: #1a1a1a;">登录学互会</h2>
              <p>点击下方按钮登录您的账户：</p>
              <a href="${escapedUrl}" style="display: inline-block; padding: 12px 24px; background: #1a1a1a; color: #fff; text-decoration: none; border-radius: 8px; margin: 16px 0;">
                登录
              </a>
              <p style="color: #666; font-size: 14px;">此链接将在 15 分钟后过期。如果您没有请求此邮件，请忽略。</p>
            </div>
          `,
        });
      },
    }),
    CredentialsProvider({
      id: "credentials-password",
      name: "Password",
      credentials: {
        identifier: { label: "邮箱、用户名或手机号", type: "text" },
        password: { label: "密码", type: "password" },
        captchaProof: { label: "图形验证码凭据", type: "text" },
      },
      async authorize(credentials) {
        const parsed = loginPasswordSchema.safeParse(credentials);
        if (!parsed.success) throw new Error("账号或密码错误");
        const { identifier, password } = parsed.data;
        const normalized = identifier.toLowerCase();
        const loginLimit = await checkRateLimit(
          `password-login:${captchaTargetKey(normalized)}`,
          10,
          15 * 60 * 1000,
        );
        if (!loginLimit.allowed) throw new Error("账号或密码错误");
        const user = await prisma.user.findFirst({
          where: { OR: [
            { email: identifier },
            ...(normalized === identifier ? [] : [{ email: normalized }]),
            { username: normalized },
            { phone: identifier },
          ] },
          select: { id: true, email: true, nickname: true, role: true, phone: true, passwordHash: true, isBanned: true, banUntil: true, deactivatedAt: true },
        });
        if (!user || !user.passwordHash || user.deactivatedAt) throw new Error("账号或密码错误");
        const isValid = await bcrypt.compare(password, user.passwordHash);
        if (!isValid) throw new Error("账号或密码错误");
        const captchaValid = await validateCaptchaProof(credentials?.captchaProof, "login-password");
        if (!captchaValid && !await consumeRecentRegistration(user.id)) {
          throw new Error("账号或密码错误");
        }
        if (user.isBanned) {
          const punishmentStatus = await getCurrentPunishmentStatus(user.id);
          if (punishmentStatus?.isBanned) throw new Error("账号或密码错误");
        }
        return { id: user.id, email: user.email, name: user.nickname, role: user.role, phone: user.phone };
      },
    }),
  ],
  session: {
    strategy: "jwt",
  },
  pages: {
    signIn: "/login",
    verifyRequest: "/login?verify=true",
    error: "/login",
  },
  callbacks: {
    async signIn({ user }) {
      if (!user.id) return false;
      const account = await getCurrentPunishmentStatus(user.id);
      return Boolean(account && !account.isBanned);
    },
    async jwt({ token, user, trigger }) {
      if (user) {
        // First sign-in: inject user info into the JWT token
        token.id = user.id;
        const dbUser = await prisma.user.findUnique({
          where: { id: user.id },
            select: { role: true, phone: true, nickname: true, avatar: true, onboardingDone: true, quizPassed: true, dcrAccess: true, isBanned: true, banUntil: true, isMuted: true, muteUntil: true, securityVersion: true, profileCompletionRequired: true, realVerifiedAt: true, studentVerifiedAt: true, deactivatedAt: true },
        });
        token.role = dbUser?.role ?? "USER";
        token.phone = dbUser?.phone ?? null;
        token.nickname = dbUser?.nickname ?? null;
        token.avatar = dbUser?.avatar ?? null;
        token.onboardingDone = dbUser?.onboardingDone ?? false;
        token.quizPassed = dbUser?.quizPassed ?? false;
        token.dcrAccess = dbUser?.dcrAccess ?? false;
         token.isBanned = Boolean(dbUser?.isBanned || dbUser?.deactivatedAt);
        token.banUntil = dbUser?.banUntil?.toISOString() ?? null;
        token.isMuted = dbUser?.isMuted ?? false;
        token.muteUntil = dbUser?.muteUntil?.toISOString() ?? null;
        token.securityVersion = dbUser?.securityVersion ?? 0;
        token.profileCompletionRequired = dbUser?.profileCompletionRequired ?? false;
        token.isVerified = Boolean(dbUser?.realVerifiedAt || dbUser?.studentVerifiedAt);
      } else if (token.sub) {
        // Refresh security-sensitive claims on every server session read so revocations apply immediately.
        let dbUser = await prisma.user.findUnique({
          where: { id: token.sub },
            select: { id: true, role: true, phone: true, nickname: true, avatar: true, onboardingDone: true, quizPassed: true, dcrAccess: true, isBanned: true, banUntil: true, isMuted: true, muteUntil: true, securityVersion: true, profileCompletionRequired: true, realVerifiedAt: true, studentVerifiedAt: true, deactivatedAt: true },
        });
        if (dbUser && ((dbUser.isBanned && dbUser.banUntil && dbUser.banUntil <= new Date()) || (dbUser.isMuted && dbUser.muteUntil && dbUser.muteUntil <= new Date()))) {
          await getCurrentPunishmentStatus(dbUser.id);
          dbUser = await prisma.user.findUnique({
            where: { id: token.sub },
             select: { id: true, role: true, phone: true, nickname: true, avatar: true, onboardingDone: true, quizPassed: true, dcrAccess: true, isBanned: true, banUntil: true, isMuted: true, muteUntil: true, securityVersion: true, profileCompletionRequired: true, realVerifiedAt: true, studentVerifiedAt: true, deactivatedAt: true },
          });
        }
        const issuedSecurityVersion = typeof token.securityVersion === "number" ? token.securityVersion : null;
        if (!dbUser || dbUser.deactivatedAt || issuedSecurityVersion !== dbUser.securityVersion) {
          token.id = "";
          token.sub = undefined;
          token.isBanned = true;
          return token;
        }
        if (dbUser) {
          token.role = dbUser.role;
          token.phone = dbUser.phone;
          token.nickname = dbUser.nickname;
          token.avatar = dbUser.avatar;
          token.onboardingDone = dbUser.onboardingDone;
          token.quizPassed = dbUser.quizPassed;
          token.dcrAccess = dbUser.dcrAccess;
           token.isBanned = Boolean(dbUser.isBanned || dbUser.deactivatedAt);
          token.banUntil = dbUser.banUntil?.toISOString() ?? null;
          token.isMuted = dbUser.isMuted;
          token.muteUntil = dbUser.muteUntil?.toISOString() ?? null;
          token.securityVersion = dbUser.securityVersion;
          token.profileCompletionRequired = dbUser.profileCompletionRequired;
          token.isVerified = Boolean(dbUser.realVerifiedAt || dbUser.studentVerifiedAt);
        }
      }
      return token;
    },
    async session({ session, token }) {
      if (session.user) {
        (session.user as any).id = token.id;
        (session.user as any).role = token.role;
        (session.user as any).phone = token.phone;
        (session.user as any).onboardingDone = token.onboardingDone;
        (session.user as any).quizPassed = token.quizPassed;
        (session.user as any).dcrAccess = token.dcrAccess;
        (session.user as any).nickname = token.nickname;
        (session.user as any).avatar = token.avatar;
        (session.user as any).isBanned = token.isBanned;
        (session.user as any).banUntil = token.banUntil;
        (session.user as any).isMuted = token.isMuted;
        (session.user as any).muteUntil = token.muteUntil;
        (session.user as any).securityVersion = token.securityVersion;
        (session.user as any).profileCompletionRequired = token.profileCompletionRequired;
        (session.user as any).isVerified = token.isVerified;
      }
      return session;
    },
  },
};

export async function getAuthOptionsWithQQ(): Promise<NextAuthOptions> {
  return authOptions;
}
