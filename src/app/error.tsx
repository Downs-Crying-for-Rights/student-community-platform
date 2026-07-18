"use client";

import React, { useEffect } from "react";
import { Button } from "@/components/ui/button";
import Link from "next/link";
import { reportClientTelemetry } from "@/components/providers/TelemetryProvider";

export function ErrorReporter({ error }: { error: Error & { digest?: string } }) {
  useEffect(() => {
    reportClientTelemetry({
      type: "error",
      name: error.name || "react_error_boundary",
      route: window.location.pathname,
      metadata: {
        message: error.message.slice(0, 2_000),
        stack: (error.stack || "").slice(0, 8_000),
        source: error.digest ? `next-digest:${error.digest}` : "next-error-boundary",
      },
    });
  }, [error]);

  return null;
}

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
      <ErrorReporter error={error} />
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
