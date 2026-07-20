import { BadgeCheck, GraduationCap, ShieldCheck } from "lucide-react";

export function IdentityBadges({
  administrator,
  realVerified,
  studentVerified,
}: {
  administrator?: boolean;
  realVerified?: boolean;
  studentVerified?: boolean;
}) {
  return (
    <div className="flex flex-wrap items-center justify-center gap-1.5" aria-label="身份标签">
      {administrator && (
        <span className="inline-flex items-center gap-1 rounded-full border border-rose-300 bg-rose-50 px-2 py-0.5 text-xs font-medium text-rose-700 dark:border-rose-900 dark:bg-rose-950/40 dark:text-rose-300">
          <ShieldCheck className="h-3.5 w-3.5" />管理员
        </span>
      )}
      {realVerified && (
        <span className="inline-flex items-center gap-1 rounded-full border border-sky-300 bg-sky-50 px-2 py-0.5 text-xs font-medium text-sky-700 dark:border-sky-900 dark:bg-sky-950/40 dark:text-sky-300">
          <BadgeCheck className="h-3.5 w-3.5" />真实用户
        </span>
      )}
      {studentVerified && (
        <span className="inline-flex items-center gap-1 rounded-full border border-emerald-300 bg-emerald-50 px-2 py-0.5 text-xs font-medium text-emerald-700 dark:border-emerald-900 dark:bg-emerald-950/40 dark:text-emerald-300">
          <GraduationCap className="h-3.5 w-3.5" />学生用户
        </span>
      )}
    </div>
  );
}
