"use client";

import { useState, useEffect, useRef, Suspense } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Card,
  CardHeader,
  CardTitle,
  CardDescription,
  CardContent,
} from "@/components/ui/card";
import { Smartphone, AlertCircle } from "lucide-react";
import { phoneSchema, verificationCodeSchema } from "@/lib/validators";

export default function BindPhonePage() {
  return (
    <Suspense fallback={
      <div className="flex min-h-screen items-center justify-center px-4">
        <Card className="w-full max-w-md">
          <CardContent className="flex items-center justify-center py-12">
            <div className="h-8 w-8 animate-spin rounded-full border-4 border-blue-600 border-t-transparent" />
          </CardContent>
        </Card>
      </div>
    }>
      <BindPhoneContent />
    </Suspense>
  );
}

function BindPhoneContent() {
  const router = useRouter();
  const searchParams = useSearchParams();

  const [phone, setPhone] = useState("");
  const [code, setCode] = useState("");
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [errorMessage, setErrorMessage] = useState("");
  const [loading, setLoading] = useState(false);
  const [countdown, setCountdown] = useState(0);
  const countdownRef = useRef<ReturnType<typeof setInterval> | null>(null);

  // Cleanup countdown on unmount
  useEffect(() => {
    return () => {
      if (countdownRef.current) clearInterval(countdownRef.current);
    };
  }, []);

  const LoadingSpinner = () => (
    <svg
      className="mr-2 h-4 w-4 animate-spin"
      viewBox="0 0 24 24"
      fill="none"
      aria-hidden="true"
    >
      <circle
        className="opacity-25"
        cx="12"
        cy="12"
        r="10"
        stroke="currentColor"
        strokeWidth="4"
      />
      <path
        className="opacity-75"
        fill="currentColor"
        d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"
      />
    </svg>
  );

  async function handleSendCode() {
    setErrors({});
    setErrorMessage("");

    const result = phoneSchema.safeParse(phone.trim());
    if (!result.success) {
      setErrors({ phone: result.error.issues[0].message });
      return;
    }

    setLoading(true);

    try {
      const res = await fetch("/api/sms/send", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ phone: phone.trim(), purpose: "bindphone" }),
      });

      if (res.status === 429) {
        setErrors({ phone: "请求过于频繁，请稍后再试" });
        return;
      }

      if (!res.ok) {
        const data = await res.json();
        setErrors({ phone: data.error || "验证码发送失败" });
        return;
      }

      // Start 60s countdown
      setCountdown(60);
      if (countdownRef.current) clearInterval(countdownRef.current);
      countdownRef.current = setInterval(() => {
        setCountdown((prev) => {
          if (prev <= 1) {
            if (countdownRef.current) clearInterval(countdownRef.current);
            countdownRef.current = null;
            return 0;
          }
          return prev - 1;
        });
      }, 1000);
    } catch {
      setErrors({ phone: "网络错误，请检查网络连接后重试" });
    } finally {
      setLoading(false);
    }
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setErrors({});
    setErrorMessage("");

    // Client-side validation
    const fieldErrors: Record<string, string> = {};
    const phoneResult = phoneSchema.safeParse(phone.trim());
    if (!phoneResult.success) {
      fieldErrors.phone = phoneResult.error.issues[0].message;
    }
    const codeResult = verificationCodeSchema.safeParse(code.trim());
    if (!codeResult.success) {
      fieldErrors.code = codeResult.error.issues[0].message;
    }
    if (Object.keys(fieldErrors).length > 0) {
      setErrors(fieldErrors);
      return;
    }

    setLoading(true);

    try {
      const res = await fetch("/api/auth/bindphone", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ phone: phone.trim(), code: code.trim() }),
      });

      if (!res.ok) {
        const data = await res.json();
        if (res.status === 409) {
          setErrorMessage(data.error || "该手机号已被其他账户绑定");
        } else {
          setErrorMessage(data.error || "绑定失败，请重试");
        }
        return;
      }

      // Redirect to original target page or home
      const callbackUrl = searchParams.get("callbackUrl") || "/";
      router.push(callbackUrl);
      router.refresh();
    } catch {
      setErrorMessage("网络错误，请检查网络连接后重试。");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="flex min-h-screen items-center justify-center px-4">
      <Card className="w-full max-w-md">
        <CardHeader className="text-center">
          <div className="mx-auto mb-4 flex h-16 w-16 items-center justify-center rounded-full bg-blue-100 dark:bg-blue-900/30">
            <Smartphone className="h-8 w-8 text-blue-600 dark:text-blue-400" />
          </div>
          <CardTitle className="text-2xl">绑定手机号</CardTitle>
          <CardDescription>
            为了账户安全，请绑定您的手机号
          </CardDescription>
        </CardHeader>

        <CardContent>
          <form onSubmit={handleSubmit} className="space-y-4">
            {/* Error message */}
            {errorMessage && (
              <div
                role="alert"
                className="flex items-center gap-2 rounded-md bg-red-50 p-3 text-sm text-red-600 dark:bg-red-900/20 dark:text-red-400"
              >
                <AlertCircle className="h-4 w-4 shrink-0" />
                {errorMessage}
              </div>
            )}

            {/* Phone input */}
            <div className="space-y-2">
              <Label htmlFor="bind-phone">手机号</Label>
              <div className="flex gap-2">
                <Input
                  id="bind-phone"
                  type="tel"
                  placeholder="请输入手机号"
                  value={phone}
                  onChange={(e) => {
                    setPhone(e.target.value);
                    if (errors.phone) setErrors((prev) => ({ ...prev, phone: "" }));
                  }}
                  autoComplete="tel"
                  disabled={loading}
                  className="flex-1"
                  maxLength={11}
                  aria-invalid={!!errors.phone}
                  aria-describedby={errors.phone ? "bind-phone-error" : undefined}
                  aria-label="手机号"
                />
                <Button
                  type="button"
                  variant="outline"
                  onClick={handleSendCode}
                  disabled={loading || countdown > 0 || !phone.trim()}
                  className="shrink-0 whitespace-nowrap"
                  aria-label={countdown > 0 ? `${countdown} 秒后可重新发送` : "发送验证码"}
                >
                  {countdown > 0 ? `${countdown}s` : "发送验证码"}
                </Button>
              </div>
              {errors.phone && (
                <p id="bind-phone-error" className="text-xs text-red-500" role="alert">
                  {errors.phone}
                </p>
              )}
            </div>

            {/* Verification code input */}
            <div className="space-y-2">
              <Label htmlFor="bind-code">验证码</Label>
              <Input
                id="bind-code"
                type="text"
                inputMode="numeric"
                placeholder="请输入 6 位验证码"
                value={code}
                onChange={(e) => {
                  setCode(e.target.value);
                  if (errors.code) setErrors((prev) => ({ ...prev, code: "" }));
                }}
                autoComplete="one-time-code"
                disabled={loading}
                maxLength={6}
                aria-invalid={!!errors.code}
                aria-describedby={errors.code ? "bind-code-error" : undefined}
                aria-label="验证码"
              />
              {errors.code && (
                <p id="bind-code-error" className="text-xs text-red-500" role="alert">
                  {errors.code}
                </p>
              )}
            </div>

            {/* Submit button */}
            <Button
              type="submit"
              className="w-full"
              disabled={loading}
            >
              {loading ? (
                <span className="flex items-center">
                  <LoadingSpinner />
                  绑定中...
                </span>
              ) : (
                <span className="flex items-center">
                  <Smartphone className="mr-2 h-4 w-4" />
                  绑定手机号
                </span>
              )}
            </Button>
          </form>
        </CardContent>
      </Card>
    </div>
  );
}
