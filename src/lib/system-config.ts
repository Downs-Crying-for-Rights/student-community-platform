import prisma from "@/lib/prisma";

export async function getSmsVerificationEnabled(): Promise<boolean> {
  const config = await prisma.systemConfig.findUnique({
    where: { id: "default" },
    select: { smsVerificationEnabled: true },
  });
  return config?.smsVerificationEnabled ?? true;
}
