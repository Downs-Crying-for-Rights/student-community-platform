export interface ProfileCompletionInput {
  nickname: string | null | undefined;
  avatar: string | null | undefined;
  qqNumber: string | null | undefined;
}

export function isProfileComplete(profile: ProfileCompletionInput): boolean {
  return Boolean(
    profile.nickname?.trim()
      && profile.avatar?.trim()
      && profile.qqNumber?.trim(),
  );
}
