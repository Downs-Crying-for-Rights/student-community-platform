import type { Prisma, PrismaClient } from "@prisma/client";

type AccountNameClient = PrismaClient | Prisma.TransactionClient;

export function normalizeAccountName(value: string): string {
  return value.trim().normalize("NFKC").toLowerCase();
}

export function buildPrimaryAccountIdentifierWhere(identifier: string): Prisma.UserWhereInput {
  const normalized = identifier.toLowerCase();
  return {
    OR: [
      { email: identifier },
      ...(normalized === identifier ? [] : [{ email: normalized }]),
      { username: normalized },
      { phone: identifier },
    ],
  };
}

export function buildNicknameIdentifierWhere(identifier: string): Prisma.UserWhereInput {
  return { nickname: { equals: normalizeAccountName(identifier), mode: "insensitive" } };
}

export async function findAccountNameConflict(
  client: AccountNameClient,
  value: string,
  excludeUserId?: string,
): Promise<{ id: string } | null> {
  const name = normalizeAccountName(value);
  if (!name) return null;

  return client.user.findFirst({
    where: {
      deactivatedAt: null,
      ...(excludeUserId ? { id: { not: excludeUserId } } : {}),
      OR: [
        { username: { equals: name, mode: "insensitive" } },
        { nickname: { equals: name, mode: "insensitive" } },
      ],
    },
    select: { id: true },
  });
}
