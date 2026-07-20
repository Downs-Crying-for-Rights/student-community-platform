ALTER TYPE "QQGrantPurpose" ADD VALUE 'REGISTRATION_FINALIZE';

ALTER TABLE "User" ADD COLUMN "username" TEXT;
CREATE UNIQUE INDEX "User_username_key" ON "User"("username");

CREATE TABLE "PendingQQRegistration" (
    "id" TEXT NOT NULL,
    "username" TEXT NOT NULL,
    "passwordHash" TEXT,
    "agreementRevisions" JSONB NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "consumedAt" TIMESTAMP(3),
    "userId" TEXT,
    CONSTRAINT "PendingQQRegistration_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "PendingQQRegistration_username_key" ON "PendingQQRegistration"("username");
CREATE UNIQUE INDEX "PendingQQRegistration_userId_key" ON "PendingQQRegistration"("userId");
CREATE INDEX "PendingQQRegistration_expiresAt_idx" ON "PendingQQRegistration"("expiresAt");

ALTER TABLE "QQGrant" ADD COLUMN "pendingRegistrationId" TEXT;
CREATE INDEX "QQGrant_pendingRegistrationId_idx" ON "QQGrant"("pendingRegistrationId");
ALTER TABLE "QQGrant" ADD CONSTRAINT "QQGrant_pendingRegistrationId_fkey" FOREIGN KEY ("pendingRegistrationId") REFERENCES "PendingQQRegistration"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "PendingQQRegistration" ADD CONSTRAINT "PendingQQRegistration_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

INSERT INTO "SiteContent" ("id", "key", "title", "content", "revision", "updatedAt")
VALUES
  ('system-user-agreement', 'user-agreement', '用户协议', '# 用户协议\n\n注册和使用本平台即表示您同意遵守法律法规、社区规范和平台治理规则。机器人注册仅验证 QQ 身份，不替代 DCR 所需的手机号验证。', 1, CURRENT_TIMESTAMP),
  ('system-privacy-policy', 'privacy-policy', '隐私政策', '# 隐私政策\n\n机器人注册收集登录用户名、密码哈希和经个人 QQ 机器人验证的加密 QQ 身份。密码明文不会发送给 QQ 机器人，也不会写入数据库或审计日志。', 1, CURRENT_TIMESTAMP)
ON CONFLICT ("key") DO NOTHING;
