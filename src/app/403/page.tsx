import Link from "next/link";
import { Button } from "@/components/ui/button";

/**
 * 403 Forbidden page — shown when a user lacks permission.
 *
 * Validates: Requirements 38.3
 */
export default function ForbiddenPage() {
  return (
    <div className="flex min-h-[60vh] flex-col items-center justify-center gap-6 px-4 text-center">
      <div className="text-6xl" aria-hidden="true">
        🚫
      </div>
      <h1 className="text-2xl font-bold">无权限访问</h1>
      <p className="text-muted-foreground max-w-md">
        您没有权限访问此页面。如果您认为这是一个错误，请联系管理员。
      </p>
      <Button asChild>
        <Link href="/">返回首页</Link>
      </Button>
    </div>
  );
}
