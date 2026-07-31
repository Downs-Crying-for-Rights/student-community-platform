"use client";

import React from "react";
import Image from "next/image";
import { BadgeCheck, User } from "lucide-react";

import { cn } from "@/lib/utils";

type UserAvatarProps = {
  src?: string | null;
  name?: string | null;
  size?: number;
  anonymous?: boolean;
  administratorVerified?: boolean;
  className?: string;
};

export function UserAvatar({ src, name, size = 40, anonymous = false, administratorVerified = false, className }: UserAvatarProps) {
  return (
    <span className={cn("relative inline-flex shrink-0", className)} style={{ width: size, height: size }}>
      {src && !anonymous ? (
        <Image src={src} alt={`${name || "用户"} 头像`} width={size} height={size} className="h-full w-full rounded-full object-cover" />
      ) : (
        <span className="flex h-full w-full items-center justify-center rounded-full bg-muted" aria-hidden="true">
          <User className="h-1/2 w-1/2 text-muted-foreground" />
        </span>
      )}
      {administratorVerified && !anonymous && (
        <span
          aria-label="平台管理员认证"
          title="平台管理员认证"
          className="absolute -bottom-1 -right-1 inline-flex rounded-full bg-background text-blue-600"
        >
          <BadgeCheck style={{ width: Math.max(14, size * 0.3), height: Math.max(14, size * 0.3) }} fill="currentColor" className="stroke-background" />
        </span>
      )}
    </span>
  );
}
