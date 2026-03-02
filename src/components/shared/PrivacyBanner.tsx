"use client";

import { useState } from "react";
import { ShieldCheck, X } from "lucide-react";
import { cn } from "@/lib/utils";

export interface PrivacyBannerProps {
  /** Banner message text */
  message?: string;
  /** Whether the banner can be dismissed */
  dismissible?: boolean;
  className?: string;
}

const DEFAULT_MESSAGE =
  "请勿在帖子中包含真实姓名、学校名称、教师姓名等可识别信息";

export function PrivacyBanner({
  message = DEFAULT_MESSAGE,
  dismissible = false,
  className,
}: PrivacyBannerProps) {
  const [visible, setVisible] = useState(true);

  if (!visible) return null;

  return (
    <div
      role="status"
      aria-live="polite"
      className={cn(
        "flex items-center gap-2 rounded-lg bg-amber-50 px-4 py-2.5 text-sm text-amber-900 dark:bg-amber-950/40 dark:text-amber-200",
        className
      )}
    >
      <ShieldCheck className="h-4 w-4 shrink-0" aria-hidden="true" />
      <span className="flex-1">{message}</span>
      {dismissible && (
        <button
          type="button"
          onClick={() => setVisible(false)}
          className="shrink-0 rounded p-2 min-h-[44px] min-w-[44px] flex items-center justify-center hover:bg-amber-200/50 dark:hover:bg-amber-800/50 active:scale-[0.97] active:transition-transform active:duration-75"
          aria-label="关闭提示"
        >
          <X className="h-4 w-4" />
        </button>
      )}
    </div>
  );
}
