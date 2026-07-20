export const publicUserSelect = {
  id: true,
  nickname: true,
  avatar: true,
  realVerifiedAt: true,
  studentVerifiedAt: true,
} as const;

export function toPublicUser<T extends { realVerifiedAt?: Date | null; studentVerifiedAt?: Date | null }>(user: T): Omit<T, "realVerifiedAt" | "studentVerifiedAt"> & { isVerified: boolean };
export function toPublicUser(user: undefined): undefined;
export function toPublicUser<T extends { realVerifiedAt?: Date | null; studentVerifiedAt?: Date | null }>(user: T | undefined) {
  if (!user) return undefined;
  const { realVerifiedAt, studentVerifiedAt, ...rest } = user;
  return { ...rest, isVerified: Boolean(realVerifiedAt || studentVerifiedAt) };
}
