import React from "react";
import Link from "next/link";
import { Button } from "@/components/ui/button";

/**
 * 404 Not Found page — shown when a route doesn't exist.
 *
 * Validates: Requirements 37.5, 38.2
 */
export default function NotFound() {
  return (
    <div className="flex min-h-[60vh] flex-col items-center justify-center gap-6 px-4 text-center">
      <div className="text-6xl" aria-hidden="true">
        🔍
      </div>
      <h1 className="text-2xl font-bold">页面未找到</h1>
      <p className="text-muted-foreground max-w-md">
        您访问的页面不存在或已被移除。请检查链接是否正确。
      </p>
      <Button asChild>
        <Link href="/">返回首页</Link>
      </Button>
    </div>
  );
}
