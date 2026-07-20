"use client";

import React from "react";
import Image from "next/image";
import { Check, User } from "lucide-react";

import { cn } from "@/lib/utils";

type UserAvatarProps = {
  src?: string | null;
  name?: string | null;
  size?: number;
  isVerified?: boolean;
  anonymous?: boolean;
  className?: string;
};

export function UserAvatar({ src, name, size = 40, isVerified = false, anonymous = false, className }: UserAvatarProps) {
  const verified = isVerified && !anonymous;
  const markerSize = Math.max(10, Math.round(size * 0.34));
  return (
    <span className={cn("relative inline-flex shrink-0", className)} style={{ width: size, height: size }}>
      {src && !anonymous ? (
        <Image src={src} alt={`${name || "用户"} 头像`} width={size} height={size} className="h-full w-full rounded-full object-cover" />
      ) : (
        <span className="flex h-full w-full items-center justify-center rounded-full bg-muted" aria-hidden="true">
          <User className="h-1/2 w-1/2 text-muted-foreground" />
        </span>
      )}
      {verified && (
        <span
          className="absolute bottom-0 right-0 flex items-center justify-center rounded-full bg-blue-600 text-white ring-2 ring-background"
          style={{ width: markerSize, height: markerSize }}
          title="已认证"
          aria-label="已认证"
        >
          <Check className="h-3/4 w-3/4 stroke-[3]" aria-hidden="true" />
        </span>
      )}
    </span>
  );
}
