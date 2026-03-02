"use client";

import React from "react";
import { Button } from "@/components/ui/button";
import Link from "next/link";

/**
 * 500 Error page — Next.js error boundary for unhandled errors.
 * Must be a client component (Next.js requirement).
 *
 * Validates: Requirements 37.6, 38.4
 */
export default function ErrorPage({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  return (
    <div className="flex min-h-[60vh] flex-col items-center justify-center gap-6 px-4 text-center">
      <div className="text-6xl" aria-hidden="true">
        ⚠️
      </div>
      <h1 className="text-2xl font-bold">服务器错误</h1>
      <p className="text-muted-foreground max-w-md">
        抱歉，服务器遇到了问题。请稍后重试。
      </p>
      <div className="flex gap-3">
        <Button onClick={() => reset()}>重试</Button>
        <Button variant="outline" asChild>
          <Link href="/">返回首页</Link>
        </Button>
      </div>
    </div>
  );
}
