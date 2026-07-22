import prisma from "@/lib/prisma";

export const ACCOUNT_DELETION_NOTICE_KEY = "account_deletion_notice";
export const DEFAULT_ACCOUNT_DELETION_NOTICE_TITLE = "注销须知";
export const DEFAULT_ACCOUNT_DELETION_NOTICE_CONTENT = `# 注销须知

1. 账号注销申请经管理员审核通过后生效，完成后无法恢复登录。
2. 邮箱、手机号、QQ、密码、头像和个人资料将被清除。
3. 已发布的公开帖子、评论以及依法或为平台安全所必需的审计记录会继续保留，并显示为“已注销用户”。
4. 注销申请审核期间可以撤回；审核完成后不能撤销。
5. 提交申请前，请自行备份仍需保留的信息，并确认当前账号不存在尚未处理完成的重要事项。`;

export function getAccountDeletionNotice() {
  return prisma.siteContent.upsert({
    where: { key: ACCOUNT_DELETION_NOTICE_KEY },
    update: {},
    create: {
      key: ACCOUNT_DELETION_NOTICE_KEY,
      title: DEFAULT_ACCOUNT_DELETION_NOTICE_TITLE,
      content: DEFAULT_ACCOUNT_DELETION_NOTICE_CONTENT,
    },
  });
}
