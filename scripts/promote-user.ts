/**
 * 提升用户角色 CLI 脚本
 *
 * 用法:
 *   npx tsx scripts/promote-user.ts --email admin@example.com --role ADMIN
 *   npx tsx scripts/promote-user.ts --phone 13800138000 --role MODERATOR
 *
 * 可用角色: USER, TRUSTED_USER, DCR_HELPER, MODERATOR, ADMIN
 */

import { PrismaClient, Role } from "@prisma/client";

const VALID_ROLES = Object.values(Role);

function usage(): never {
  console.log(`
用法:
  npx tsx scripts/promote-user.ts --email <邮箱> --role <角色>
  npx tsx scripts/promote-user.ts --phone <手机号> --role <角色>

可用角色: ${VALID_ROLES.join(", ")}
`);
  process.exit(1);
}

async function main() {
  const args = process.argv.slice(2);
  let email: string | undefined;
  let phone: string | undefined;
  let role: string | undefined;

  for (let i = 0; i < args.length; i++) {
    if (args[i] === "--email" && args[i + 1]) {
      email = args[++i];
    } else if (args[i] === "--phone" && args[i + 1]) {
      phone = args[++i];
    } else if (args[i] === "--role" && args[i + 1]) {
      role = args[++i];
    }
  }

  if (!role || (!email && !phone)) usage();
  if (!VALID_ROLES.includes(role as Role)) {
    console.error(`❌ 无效角色: ${role}`);
    console.error(`   可用角色: ${VALID_ROLES.join(", ")}`);
    process.exit(1);
  }

  const prisma = new PrismaClient();

  try {
    const where = email ? { email } : { phone };
    const user = await prisma.user.findFirst({ where, select: { id: true, email: true, phone: true, nickname: true, role: true } });

    if (!user) {
      console.error(`❌ 未找到用户: ${email || phone}`);
      process.exit(1);
    }

    console.log(`找到用户: ${user.nickname || user.email || user.phone} (当前角色: ${user.role})`);

    const updated = await prisma.user.update({
      where: { id: user.id },
      data: { role: role as Role },
      select: { id: true, email: true, phone: true, nickname: true, role: true },
    });

    console.log(`✅ 角色已更新: ${updated.role}`);
  } finally {
    await prisma.$disconnect();
  }
}

main().catch((err) => {
  console.error("❌ 执行失败:", err.message);
  process.exit(1);
});
