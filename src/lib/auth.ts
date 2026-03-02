import type { NextAuthOptions } from "next-auth";
import type { JWT } from "next-auth/jwt";
import EmailProvider from "next-auth/providers/email";
import CredentialsProvider from "next-auth/providers/credentials";
import { PrismaAdapter } from "@auth/prisma-adapter";
import type { Adapter } from "next-auth/adapters";
import { prisma } from "@/lib/prisma";
import nodemailer from "nodemailer";
import bcrypt from "bcryptjs";
import { loginPasswordSchema, loginSmsSchema } from "@/lib/validators";
import { verifyCode } from "@/lib/sms/verification";
import QQProvider from "@/lib/auth/qq-provider";

export const authOptions: NextAuthOptions = {
  adapter: PrismaAdapter(prisma) as Adapter,
  providers: [
    EmailProvider({
      server: {
        host: process.env.SMTP_HOST,
        port: Number(process.env.SMTP_PORT) || 587,
        auth: {
          user: process.env.SMTP_USER,
          pass: process.env.SMTP_PASSWORD,
        },
      },
      from: process.env.SMTP_FROM || "noreply@example.com",
      maxAge: 15 * 60, // 魔法链接有效期 15 分钟
      async sendVerificationRequest({ identifier: email, url, provider }) {
        const transport = nodemailer.createTransport(provider.server);
        await transport.sendMail({
          to: email,
          from: provider.from,
          subject: "登录学生交流社区",
          text: `点击以下链接登录学生交流社区：\n\n${url}\n\n此链接将在 15 分钟后过期。`,
          html: `
            <div style="max-width: 480px; margin: 0 auto; font-family: sans-serif;">
              <h2 style="color: #1a1a1a;">登录学生交流社区</h2>
              <p>点击下方按钮登录您的账户：</p>
              <a href="${url}" style="display: inline-block; padding: 12px 24px; background: #1a1a1a; color: #fff; text-decoration: none; border-radius: 8px; margin: 16px 0;">
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
        email: { label: "邮箱", type: "email" },
        password: { label: "密码", type: "password" },
      },
      async authorize(credentials) {
        // 1. Validate input with loginPasswordSchema
        const parsed = loginPasswordSchema.safeParse(credentials);
        if (!parsed.success) {
          throw new Error("邮箱或密码错误");
        }

        const { email, password } = parsed.data;

        // 2. Find user by email
        const user = await prisma.user.findUnique({
          where: { email },
          select: { id: true, email: true, nickname: true, role: true, phone: true, passwordHash: true },
        });

        // 3. If no user or no passwordHash, throw unified error
        if (!user || !user.passwordHash) {
          throw new Error("邮箱或密码错误");
        }

        // 4. bcrypt.compare(password, user.passwordHash)
        const isValid = await bcrypt.compare(password, user.passwordHash);

        // 5. If mismatch, throw unified error
        if (!isValid) {
          throw new Error("邮箱或密码错误");
        }

        // 6. Return user object
        return {
          id: user.id,
          email: user.email,
          name: user.nickname,
          role: user.role,
          phone: user.phone,
        };
      },
    }),
    CredentialsProvider({
      id: "credentials-sms",
      name: "SMS",
      credentials: {
        phone: { label: "手机号", type: "text" },
        code: { label: "验证码", type: "text" },
      },
      async authorize(credentials) {
        // 1. Validate input with loginSmsSchema
        const parsed = loginSmsSchema.safeParse(credentials);
        if (!parsed.success) {
          throw new Error("验证码错误或已过期");
        }

        const { phone, code } = parsed.data;

        // 2. Call verifyCode(phone, code, "login")
        const isValid = await verifyCode(phone, code, "login");

        // 3. If verification fails, throw error
        if (!isValid) {
          throw new Error("验证码错误或已过期");
        }

        // 4. Find user by phone, or create new user with phone set
        let user = await prisma.user.findFirst({
          where: { phone },
          select: { id: true, email: true, nickname: true, role: true, phone: true },
        });

        if (!user) {
          user = await prisma.user.create({
            data: { phone },
            select: { id: true, email: true, nickname: true, role: true, phone: true },
          });
        }

        // 5. Return user object
        return {
          id: user.id,
          email: user.email,
          name: user.nickname,
          role: user.role,
          phone: user.phone,
        };
      },
    }),
    QQProvider({
      clientId: process.env.QQ_APP_ID ?? "",
      clientSecret: process.env.QQ_APP_SECRET ?? "",
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
    async jwt({ token, user }) {
      if (user) {
        // First sign-in: inject user info into the JWT token
        token.id = user.id;
        const dbUser = await prisma.user.findUnique({
          where: { id: user.id },
          select: { role: true, phone: true },
        });
        token.role = dbUser?.role ?? "USER";
        token.phone = dbUser?.phone ?? null;
      }
      return token;
    },
    async session({ session, token }) {
      if (session.user) {
        session.user.id = token.id as string;
        session.user.role = (token.role as string) ?? "USER";
        session.user.phone = (token.phone as string | null) ?? null;
      }
      return session;
    },
  },
};
