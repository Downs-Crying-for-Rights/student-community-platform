export const publicUserSelect = {
  id: true,
  nickname: true,
  avatar: true,
  role: true,
  realVerifiedAt: true,
  studentVerifiedAt: true,
} as const;

export function toPublicUser<T extends { role?: string; realVerifiedAt?: Date | null; studentVerifiedAt?: Date | null }>(user: T): Omit<T, "role" | "realVerifiedAt" | "studentVerifiedAt"> & { isAdministrator: boolean; isVerified: boolean };
export function toPublicUser(user: undefined): undefined;
export function toPublicUser<T extends { role?: string; realVerifiedAt?: Date | null; studentVerifiedAt?: Date | null }>(user: T | undefined) {
  if (!user) return undefined;
  const { role, realVerifiedAt, studentVerifiedAt, ...rest } = user;
  return {
    ...rest,
    isAdministrator: role === "ADMIN" || role === "SUPER_ADMIN",
    isVerified: Boolean(realVerifiedAt || studentVerifiedAt),
  };
}
