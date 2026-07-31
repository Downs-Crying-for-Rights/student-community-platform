"use client";

import React from "react";
import Image from "next/image";
import { User } from "lucide-react";

import { cn } from "@/lib/utils";

type UserAvatarProps = {
  src?: string | null;
  name?: string | null;
  size?: number;
  anonymous?: boolean;
  className?: string;
};

export function UserAvatar({ src, name, size = 40, anonymous = false, className }: UserAvatarProps) {
  return (
    <span className={cn("relative inline-flex shrink-0", className)} style={{ width: size, height: size }}>
      {src && !anonymous ? (
        <Image src={src} alt={`${name || "用户"} 头像`} width={size} height={size} className="h-full w-full rounded-full object-cover" />
      ) : (
        <span className="flex h-full w-full items-center justify-center rounded-full bg-muted" aria-hidden="true">
          <User className="h-1/2 w-1/2 text-muted-foreground" />
        </span>
      )}
    </span>
  );
}
