"use client";

import { useState, Suspense } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { useSession } from "next-auth/react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from "@/components/ui/card";
import { User, AlertCircle, Loader2 } from "lucide-react";
import { nicknameSchema } from "@/lib/validators";

export default function SetUsernamePage() {
  return (
    <Suspense fallback={
      <div className="flex min-h-screen items-center justify-center px-4">
        <Card className="w-full max-w-md">
          <CardContent className="flex items-center justify-center py-12">
            <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
          </CardContent>
        </Card>
      </div>
    }>
      <SetUsernameContent />
    </Suspense>
  );
}

function SetUsernameContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const { update } = useSession();

  const [nickname, setNickname] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError("");

    const parsed = nicknameSchema.safeParse(nickname.trim());
    if (!parsed.success) {
      setError(parsed.error.issues[0]?.message || "无效的昵称");
      return;
    }

    setLoading(true);
    try {
      const res = await fetch("/api/auth/username", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ nickname: parsed.data }),
      });

      const data = await res.json();
      if (!res.ok) {
        setError(data.error || "设置失败，请重试");
        return;
      }

      // 刷新 session 以同步昵称，硬刷新确保 cookie 已写入
      await update();
      window.location.href = searchParams.get("callbackUrl") || "/";
    } catch {
      setError("网络错误，请检查连接后重试");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="flex min-h-screen items-center justify-center px-4 bg-slate-50/40 dark:bg-slate-950/10">
      <Card className="w-full max-w-md shadow-lg">
        <CardHeader className="text-center">
          <div className="mx-auto mb-3 flex h-12 w-12 items-center justify-center rounded-full bg-blue-100 dark:bg-blue-900/30">
            <User className="h-6 w-6 text-blue-600 dark:text-blue-400" />
          </div>
          <CardTitle className="text-xl">设置用户名</CardTitle>
          <CardDescription>
            请设置你的用户名，社区中其他用户将通过此名称识别你
          </CardDescription>
        </CardHeader>

        <CardContent className="space-y-4">
          <form onSubmit={handleSubmit} className="space-y-4">
            {error && (
              <div className="flex items-center gap-2 rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700 dark:bg-red-950/20 dark:text-red-400">
                <AlertCircle className="h-4 w-4 shrink-0" />
                {error}
              </div>
            )}

            <div className="space-y-2">
              <Label htmlFor="nickname">用户名</Label>
              <Input
                id="nickname"
                type="text"
                placeholder="2-20 个字符，支持中英文、数字、下划线和连字符"
                value={nickname}
                onChange={(e) => {
                  setNickname(e.target.value);
                  if (error) setError("");
                }}
                maxLength={20}
                autoFocus
                autoComplete="off"
              />
              <p className="text-xs text-muted-foreground">
                设置后可在设置页面中修改
              </p>
            </div>

            <Button type="submit" className="w-full" disabled={loading}>
              {loading ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  保存中...
                </>
              ) : (
                "确认设置"
              )}
            </Button>
          </form>
        </CardContent>
      </Card>
    </div>
  );
}
