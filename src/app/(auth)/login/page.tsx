"use client";

import { Suspense, useState, useEffect, useCallback, useRef } from "react";
import { signIn } from "next-auth/react";
import { useSearchParams, useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Card,
  CardHeader,
  CardTitle,
  CardDescription,
  CardContent,
  CardFooter,
} from "@/components/ui/card";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import {
  Mail,
  ArrowLeft,
  CheckCircle,
  AlertCircle,
  KeyRound,
  Lock,
  Smartphone,
  UserPlus,
} from "lucide-react";
import {
  loginPasswordSchema,
  loginSmsSchema,
  phoneSchema,
  registerSchema,
  inviteRegisterSchema,
} from "@/lib/validators";

type ViewState = "form" | "verify" | "expired" | "error" | "register";
export type LoginTab = "email" | "password" | "sms";

/** All tabs available on the login page */
export const LOGIN_TABS: LoginTab[] = ["email", "password", "sms"];

/** Represents the form state across all login tabs */
export interface LoginFormState {
  email: string;
  pwEmail: string;
  pwPassword: string;
  pwErrors: Record<string, string>;
  smsPhone: string;
  smsCode: string;
  smsErrors: Record<string, string>;
  errorMessage: string;
}

/** Returns a blank form state (all fields empty / cleared) */
export function getEmptyFormState(): LoginFormState {
  return {
    email: "",
    pwEmail: "",
    pwPassword: "",
    pwErrors: {},
    smsPhone: "",
    smsCode: "",
    smsErrors: {},
    errorMessage: "",
  };
}

/**
 * Pure function that computes the new form state after switching tabs.
 * All form inputs and error messages are cleared.
 */
export function computeTabChangeState(
  _prevState: LoginFormState,
  newTab: LoginTab,
): { activeTab: LoginTab; formState: LoginFormState } {
  return {
    activeTab: newTab,
    formState: getEmptyFormState(),
  };
}

export default function LoginPage() {
  return (
    <Suspense
      fallback={
        <div className="flex min-h-screen items-center justify-center px-4">
          <Card className="w-full max-w-md">
            <CardHeader className="text-center">
              <CardTitle className="text-2xl">登录学生交流社区</CardTitle>
              <CardDescription>加载中...</CardDescription>
            </CardHeader>
          </Card>
        </div>
      }
    >
      <LoginContent />
    </Suspense>
  );
}

function LoginContent() {
  const searchParams = useSearchParams();
  const router = useRouter();

  // View state
  const [view, setView] = useState<ViewState>("form");
  const [errorMessage, setErrorMessage] = useState("");
  const [loading, setLoading] = useState(false);

  // Active tab
  const [activeTab, setActiveTab] = useState<LoginTab>("email");

  // Email tab state
  const [email, setEmail] = useState("");

  // Password tab state
  const [pwEmail, setPwEmail] = useState("");
  const [pwPassword, setPwPassword] = useState("");
  const [pwErrors, setPwErrors] = useState<Record<string, string>>({});

  // SMS tab state
  const [smsPhone, setSmsPhone] = useState("");
  const [smsCode, setSmsCode] = useState("");
  const [smsErrors, setSmsErrors] = useState<Record<string, string>>({});
  const [countdown, setCountdown] = useState(0);
  const countdownRef = useRef<ReturnType<typeof setInterval> | null>(null);

  // Invite code state
  const [showInvite, setShowInvite] = useState(false);
  const [inviteCode, setInviteCode] = useState("");
  const [inviteEmail, setInviteEmail] = useState("");
  const [invitePassword, setInvitePassword] = useState("");
  const [invitePhone, setInvitePhone] = useState("");
  const [inviteSmsCode, setInviteSmsCode] = useState("");
  const [inviteErrors, setInviteErrors] = useState<Record<string, string>>({});
  const [inviteCountdown, setInviteCountdown] = useState(0);
  const inviteCountdownRef = useRef<ReturnType<typeof setInterval> | null>(null);

  // Registration state
  const [regEmail, setRegEmail] = useState("");
  const [regPassword, setRegPassword] = useState("");
  const [regPhone, setRegPhone] = useState("");
  const [regCode, setRegCode] = useState("");
  const [regErrors, setRegErrors] = useState<Record<string, string>>({});
  const [regCountdown, setRegCountdown] = useState(0);
  const regCountdownRef = useRef<ReturnType<typeof setInterval> | null>(null);

  // Handle URL params (verify, error)
  useEffect(() => {
    if (searchParams.get("verify") === "true") {
      setView("verify");
    }
    const error = searchParams.get("error");
    if (error === "Verification") {
      setView("expired");
    } else if (error) {
      setErrorMessage(getErrorMessage(error));
      setView("error");
    }
  }, [searchParams]);

  // Cleanup countdown on unmount
  useEffect(() => {
    return () => {
      if (countdownRef.current) clearInterval(countdownRef.current);
      if (regCountdownRef.current) clearInterval(regCountdownRef.current);
      if (inviteCountdownRef.current) clearInterval(inviteCountdownRef.current);
    };
  }, []);

  function getErrorMessage(error: string): string {
    switch (error) {
      case "EmailSignin":
        return "邮件发送失败，请检查邮箱地址后重试。";
      case "Configuration":
        return "服务器配置错误，请联系管理员。";
      case "CredentialsSignin":
        return "邮箱或密码错误";
      default:
        return "登录过程中发生错误，请重试。";
    }
  }

  // Clear form state when switching tabs
  const handleTabChange = useCallback((value: string) => {
    const newTab = value as LoginTab;
    const prevState: LoginFormState = {
      email, pwEmail, pwPassword, pwErrors,
      smsPhone, smsCode, smsErrors, errorMessage,
    };
    const result = computeTabChangeState(prevState, newTab);
    setActiveTab(result.activeTab);
    setEmail(result.formState.email);
    setPwEmail(result.formState.pwEmail);
    setPwPassword(result.formState.pwPassword);
    setPwErrors(result.formState.pwErrors);
    setSmsPhone(result.formState.smsPhone);
    setSmsCode(result.formState.smsCode);
    setSmsErrors(result.formState.smsErrors);
    setErrorMessage(result.formState.errorMessage);
    if (view === "error") setView("form");
  }, [view, email, pwEmail, pwPassword, pwErrors, smsPhone, smsCode, smsErrors, errorMessage]);

  // ===== Email magic link =====
  async function handleEmailSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!email.trim()) return;

    setLoading(true);
    setErrorMessage("");

    try {
      const result = await signIn("email", {
        email: email.trim(),
        redirect: false,
        callbackUrl: "/",
      });

      if (result?.error) {
        setErrorMessage(getErrorMessage(result.error));
        setView("error");
      } else {
        setView("verify");
      }
    } catch {
      setErrorMessage("网络错误，请检查网络连接后重试。");
      setView("error");
    } finally {
      setLoading(false);
    }
  }

  // ===== Password login =====
  async function handlePasswordSubmit(e: React.FormEvent) {
    e.preventDefault();
    setPwErrors({});
    setErrorMessage("");

    const result = loginPasswordSchema.safeParse({
      email: pwEmail.trim(),
      password: pwPassword,
    });

    if (!result.success) {
      const fieldErrors: Record<string, string> = {};
      for (const issue of result.error.issues) {
        const field = issue.path[0] as string;
        if (!fieldErrors[field]) fieldErrors[field] = issue.message;
      }
      setPwErrors(fieldErrors);
      return;
    }

    setLoading(true);

    try {
      const res = await signIn("credentials-password", {
        email: pwEmail.trim(),
        password: pwPassword,
        redirect: false,
        callbackUrl: "/",
      });

      if (res?.error) {
        setErrorMessage("邮箱或密码错误");
      } else if (res?.url) {
        router.push(res.url);
        router.refresh();
      }
    } catch {
      setErrorMessage("网络错误，请检查网络连接后重试。");
    } finally {
      setLoading(false);
    }
  }

  // ===== SMS login =====
  async function handleSendCode() {
    setSmsErrors({});

    const result = phoneSchema.safeParse(smsPhone.trim());
    if (!result.success) {
      setSmsErrors({ phone: result.error.issues[0].message });
      return;
    }

    setLoading(true);

    try {
      const res = await fetch("/api/sms/send", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ phone: smsPhone.trim(), purpose: "login" }),
      });

      if (res.status === 429) {
        setSmsErrors({ phone: "请求过于频繁，请稍后再试" });
        return;
      }

      if (!res.ok) {
        const data = await res.json();
        setSmsErrors({ phone: data.error || "验证码发送失败" });
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
      setSmsErrors({ phone: "网络错误，请检查网络连接后重试" });
    } finally {
      setLoading(false);
    }
  }

  async function handleSmsSubmit(e: React.FormEvent) {
    e.preventDefault();
    setSmsErrors({});
    setErrorMessage("");

    const result = loginSmsSchema.safeParse({
      phone: smsPhone.trim(),
      code: smsCode.trim(),
    });

    if (!result.success) {
      const fieldErrors: Record<string, string> = {};
      for (const issue of result.error.issues) {
        const field = issue.path[0] as string;
        if (!fieldErrors[field]) fieldErrors[field] = issue.message;
      }
      setSmsErrors(fieldErrors);
      return;
    }

    setLoading(true);

    try {
      const res = await signIn("credentials-sms", {
        phone: smsPhone.trim(),
        code: smsCode.trim(),
        redirect: false,
        callbackUrl: "/",
      });

      if (res?.error) {
        setErrorMessage("验证码错误或已过期");
      } else if (res?.url) {
        router.push(res.url);
        router.refresh();
      }
    } catch {
      setErrorMessage("网络错误，请检查网络连接后重试。");
    } finally {
      setLoading(false);
    }
  }

  // ===== QQ login =====
  function handleQQLogin() {
    signIn("qq");
  }

  // ===== Invite code =====
  async function handleInviteSendCode() {
    setInviteErrors({});

    const result = phoneSchema.safeParse(invitePhone.trim());
    if (!result.success) {
      setInviteErrors((prev) => ({ ...prev, phone: result.error.issues[0].message }));
      return;
    }

    setLoading(true);

    try {
      const res = await fetch("/api/sms/send", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ phone: invitePhone.trim(), purpose: "login" }),
      });

      if (res.status === 429) {
        setInviteErrors((prev) => ({ ...prev, phone: "请求过于频繁，请稍后再试" }));
        return;
      }

      if (!res.ok) {
        const data = await res.json();
        setInviteErrors((prev) => ({ ...prev, phone: data.error || "验证码发送失败" }));
        return;
      }

      setInviteCountdown(60);
      if (inviteCountdownRef.current) clearInterval(inviteCountdownRef.current);
      inviteCountdownRef.current = setInterval(() => {
        setInviteCountdown((prev) => {
          if (prev <= 1) {
            if (inviteCountdownRef.current) clearInterval(inviteCountdownRef.current);
            inviteCountdownRef.current = null;
            return 0;
          }
          return prev - 1;
        });
      }, 1000);
    } catch {
      setInviteErrors((prev) => ({ ...prev, phone: "网络错误，请检查网络连接后重试" }));
    } finally {
      setLoading(false);
    }
  }

  async function handleInviteSubmit(e: React.FormEvent) {
    e.preventDefault();
    setInviteErrors({});
    setErrorMessage("");

    const result = inviteRegisterSchema.safeParse({
      inviteCode: inviteCode.trim(),
      email: inviteEmail.trim(),
      password: invitePassword,
      phone: invitePhone.trim(),
      code: inviteSmsCode.trim(),
    });

    if (!result.success) {
      const fieldErrors: Record<string, string> = {};
      for (const issue of result.error.issues) {
        const field = issue.path[0] as string;
        if (!fieldErrors[field]) fieldErrors[field] = issue.message;
      }
      setInviteErrors(fieldErrors);
      return;
    }

    setLoading(true);

    try {
      const res = await fetch("/api/auth/invite", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          inviteCode: inviteCode.trim(),
          email: inviteEmail.trim(),
          password: invitePassword,
          phone: invitePhone.trim(),
          code: inviteSmsCode.trim(),
        }),
      });

      const data = await res.json();

      if (!res.ok) {
        setErrorMessage(data.error || "邀请码注册失败，请重试。");
        return;
      }

      router.push("/");
      router.refresh();
    } catch {
      setErrorMessage("网络错误，请检查网络连接后重试。");
    } finally {
      setLoading(false);
    }
  }

  // ===== Registration =====
  async function handleRegSendCode() {
    setRegErrors({});

    const result = phoneSchema.safeParse(regPhone.trim());
    if (!result.success) {
      setRegErrors((prev) => ({ ...prev, phone: result.error.issues[0].message }));
      return;
    }

    setLoading(true);

    try {
      const res = await fetch("/api/sms/send", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ phone: regPhone.trim(), purpose: "login" }),
      });

      if (res.status === 429) {
        setRegErrors((prev) => ({ ...prev, phone: "请求过于频繁，请稍后再试" }));
        return;
      }

      if (!res.ok) {
        const data = await res.json();
        setRegErrors((prev) => ({ ...prev, phone: data.error || "验证码发送失败" }));
        return;
      }

      setRegCountdown(60);
      if (regCountdownRef.current) clearInterval(regCountdownRef.current);
      regCountdownRef.current = setInterval(() => {
        setRegCountdown((prev) => {
          if (prev <= 1) {
            if (regCountdownRef.current) clearInterval(regCountdownRef.current);
            regCountdownRef.current = null;
            return 0;
          }
          return prev - 1;
        });
      }, 1000);
    } catch {
      setRegErrors((prev) => ({ ...prev, phone: "网络错误，请检查网络连接后重试" }));
    } finally {
      setLoading(false);
    }
  }

  async function handleRegisterSubmit(e: React.FormEvent) {
    e.preventDefault();
    setRegErrors({});
    setErrorMessage("");

    const result = registerSchema.safeParse({
      email: regEmail.trim(),
      password: regPassword,
      phone: regPhone.trim(),
      code: regCode.trim(),
    });

    if (!result.success) {
      const fieldErrors: Record<string, string> = {};
      for (const issue of result.error.issues) {
        const field = issue.path[0] as string;
        if (!fieldErrors[field]) fieldErrors[field] = issue.message;
      }
      setRegErrors(fieldErrors);
      return;
    }

    setLoading(true);

    try {
      const res = await fetch("/api/auth/register", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          email: regEmail.trim(),
          password: regPassword,
          phone: regPhone.trim(),
          code: regCode.trim(),
        }),
      });

      const data = await res.json();

      if (!res.ok) {
        setErrorMessage(data.error || "注册失败，请重试");
        return;
      }

      router.push("/");
      router.refresh();
    } catch {
      setErrorMessage("网络错误，请检查网络连接后重试。");
    } finally {
      setLoading(false);
    }
  }

  function handleResend() {
    setView("form");
    setErrorMessage("");
  }

  // Loading spinner component
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

  // ===== Verify view (email magic link sent) =====
  if (view === "verify") {
    return (
      <div className="flex min-h-screen items-center justify-center px-4">
        <Card className="w-full max-w-md">
          <CardHeader className="text-center">
            <div className="mx-auto mb-4 flex h-16 w-16 items-center justify-center rounded-full bg-green-100 dark:bg-green-900/30">
              <CheckCircle className="h-8 w-8 text-green-600 dark:text-green-400" />
            </div>
            <CardTitle>查看您的邮箱</CardTitle>
            <CardDescription>
              我们已向您的邮箱发送了一封包含魔法链接的邮件。
              点击邮件中的链接即可登录。
            </CardDescription>
          </CardHeader>
          <CardContent className="text-center">
            <p className="text-sm text-muted-foreground">
              链接将在 15 分钟后过期。如果没有收到邮件，请检查垃圾邮件文件夹。
            </p>
          </CardContent>
          <CardFooter className="justify-center">
            <Button variant="ghost" onClick={handleResend}>
              <ArrowLeft className="mr-2 h-4 w-4" />
              返回重新发送
            </Button>
          </CardFooter>
        </Card>
      </div>
    );
  }

  // ===== Expired view =====
  if (view === "expired") {
    return (
      <div className="flex min-h-screen items-center justify-center px-4">
        <Card className="w-full max-w-md">
          <CardHeader className="text-center">
            <div className="mx-auto mb-4 flex h-16 w-16 items-center justify-center rounded-full bg-orange-100 dark:bg-orange-900/30">
              <AlertCircle className="h-8 w-8 text-orange-600 dark:text-orange-400" />
            </div>
            <CardTitle>链接已过期</CardTitle>
            <CardDescription>
              您的魔法链接已过期或已被使用。请重新发送一封新的登录邮件。
            </CardDescription>
          </CardHeader>
          <CardFooter className="justify-center">
            <Button onClick={handleResend}>
              <Mail className="mr-2 h-4 w-4" />
              重新发送魔法链接
            </Button>
          </CardFooter>
        </Card>
      </div>
    );
  }

  // ===== Error view =====
  if (view === "error" && !activeTab) {
    return (
      <div className="flex min-h-screen items-center justify-center px-4">
        <Card className="w-full max-w-md">
          <CardHeader className="text-center">
            <div className="mx-auto mb-4 flex h-16 w-16 items-center justify-center rounded-full bg-red-100 dark:bg-red-900/30">
              <AlertCircle className="h-8 w-8 text-red-600 dark:text-red-400" />
            </div>
            <CardTitle>登录失败</CardTitle>
            <CardDescription>{errorMessage}</CardDescription>
          </CardHeader>
          <CardFooter className="justify-center">
            <Button onClick={handleResend}>
              <ArrowLeft className="mr-2 h-4 w-4" />
              返回重试
            </Button>
          </CardFooter>
        </Card>
      </div>
    );
  }

  // ===== Register view =====
  if (view === "register") {
    return (
      <div className="flex min-h-screen items-center justify-center px-4">
        <Card className="w-full max-w-md">
          <CardHeader className="text-center">
            <CardTitle className="text-2xl">注册学生交流社区</CardTitle>
            <CardDescription>创建账户，开始探索</CardDescription>
          </CardHeader>

          <CardContent className="space-y-4">
            {errorMessage && (
              <div
                role="alert"
                className="flex items-center gap-2 rounded-md bg-red-50 p-3 text-sm text-red-600 dark:bg-red-900/20 dark:text-red-400"
              >
                <AlertCircle className="h-4 w-4 shrink-0" />
                {errorMessage}
              </div>
            )}

            <form onSubmit={handleRegisterSubmit} className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="reg-email">邮箱地址</Label>
                <Input
                  id="reg-email"
                  type="email"
                  placeholder="you@example.com"
                  value={regEmail}
                  onChange={(e) => {
                    setRegEmail(e.target.value);
                    if (regErrors.email) setRegErrors((prev) => ({ ...prev, email: "" }));
                  }}
                  autoComplete="email"
                  disabled={loading}
                  aria-invalid={!!regErrors.email}
                  aria-describedby={regErrors.email ? "reg-email-error" : undefined}
                />
                {regErrors.email && (
                  <p id="reg-email-error" className="text-xs text-red-500" role="alert">
                    {regErrors.email}
                  </p>
                )}
              </div>

              <div className="space-y-2">
                <Label htmlFor="reg-password">密码</Label>
                <Input
                  id="reg-password"
                  type="password"
                  placeholder="至少 8 个字符"
                  value={regPassword}
                  onChange={(e) => {
                    setRegPassword(e.target.value);
                    if (regErrors.password) setRegErrors((prev) => ({ ...prev, password: "" }));
                  }}
                  autoComplete="new-password"
                  disabled={loading}
                  aria-invalid={!!regErrors.password}
                  aria-describedby={regErrors.password ? "reg-password-error" : undefined}
                />
                {regErrors.password && (
                  <p id="reg-password-error" className="text-xs text-red-500" role="alert">
                    {regErrors.password}
                  </p>
                )}
              </div>

              <div className="space-y-2">
                <Label htmlFor="reg-phone">手机号</Label>
                <div className="flex gap-2">
                  <Input
                    id="reg-phone"
                    type="tel"
                    placeholder="请输入手机号"
                    value={regPhone}
                    onChange={(e) => {
                      setRegPhone(e.target.value);
                      if (regErrors.phone) setRegErrors((prev) => ({ ...prev, phone: "" }));
                    }}
                    autoComplete="tel"
                    disabled={loading}
                    className="flex-1"
                    maxLength={11}
                    aria-invalid={!!regErrors.phone}
                    aria-describedby={regErrors.phone ? "reg-phone-error" : undefined}
                  />
                  <Button
                    type="button"
                    variant="outline"
                    onClick={handleRegSendCode}
                    disabled={loading || regCountdown > 0 || !regPhone.trim()}
                    className="shrink-0 whitespace-nowrap"
                    aria-label={regCountdown > 0 ? `${regCountdown} 秒后可重新发送` : "发送验证码"}
                  >
                    {regCountdown > 0 ? `${regCountdown}s` : "发送验证码"}
                  </Button>
                </div>
                {regErrors.phone && (
                  <p id="reg-phone-error" className="text-xs text-red-500" role="alert">
                    {regErrors.phone}
                  </p>
                )}
              </div>

              <div className="space-y-2">
                <Label htmlFor="reg-code">验证码</Label>
                <Input
                  id="reg-code"
                  type="text"
                  inputMode="numeric"
                  placeholder="请输入 6 位验证码"
                  value={regCode}
                  onChange={(e) => {
                    setRegCode(e.target.value);
                    if (regErrors.code) setRegErrors((prev) => ({ ...prev, code: "" }));
                  }}
                  autoComplete="one-time-code"
                  disabled={loading}
                  maxLength={6}
                  aria-invalid={!!regErrors.code}
                  aria-describedby={regErrors.code ? "reg-code-error" : undefined}
                />
                {regErrors.code && (
                  <p id="reg-code-error" className="text-xs text-red-500" role="alert">
                    {regErrors.code}
                  </p>
                )}
              </div>

              <Button
                type="submit"
                className="w-full"
                disabled={loading}
              >
                {loading ? (
                  <span className="flex items-center">
                    <LoadingSpinner />
                    注册中...
                  </span>
                ) : (
                  <span className="flex items-center">
                    <UserPlus className="mr-2 h-4 w-4" />
                    注册
                  </span>
                )}
              </Button>
            </form>

            {/* Divider for invite */}
            <div className="relative">
              <div className="absolute inset-0 flex items-center">
                <span className="w-full border-t" />
              </div>
              <div className="relative flex justify-center text-xs">
                <span className="bg-card px-2 text-muted-foreground">
                  或者
                </span>
              </div>
            </div>

            {/* Invite code registration */}
            {!showInvite ? (
              <Button
                type="button"
                variant="ghost"
                className="w-full"
                onClick={() => {
                  setShowInvite(true);
                  setErrorMessage("");
                }}
              >
                <KeyRound className="mr-2 h-4 w-4" />
                使用邀请码注册
              </Button>
            ) : (
              <form onSubmit={handleInviteSubmit} className="space-y-3">
                <div className="space-y-2">
                  <Label htmlFor="invite-code-reg">邀请码</Label>
                  <Input
                    id="invite-code-reg"
                    type="text"
                    placeholder="请输入邀请码"
                    value={inviteCode}
                    onChange={(e) => setInviteCode(e.target.value)}
                    required
                    disabled={loading}
                    maxLength={32}
                    aria-invalid={!!inviteErrors.inviteCode}
                    aria-describedby={inviteErrors.inviteCode ? "invite-code-error" : undefined}
                  />
                  {inviteErrors.inviteCode && (
                    <p id="invite-code-error" className="text-xs text-red-500" role="alert">
                      {inviteErrors.inviteCode}
                    </p>
                  )}
                </div>

                <div className="space-y-2">
                  <Label htmlFor="invite-email">邮箱地址</Label>
                  <Input
                    id="invite-email"
                    type="email"
                    placeholder="you@example.com"
                    value={inviteEmail}
                    onChange={(e) => {
                      setInviteEmail(e.target.value);
                      if (inviteErrors.email) setInviteErrors((prev) => ({ ...prev, email: "" }));
                    }}
                    autoComplete="email"
                    disabled={loading}
                    aria-invalid={!!inviteErrors.email}
                    aria-describedby={inviteErrors.email ? "invite-email-error" : undefined}
                  />
                  {inviteErrors.email && (
                    <p id="invite-email-error" className="text-xs text-red-500" role="alert">
                      {inviteErrors.email}
                    </p>
                  )}
                </div>

                <div className="space-y-2">
                  <Label htmlFor="invite-password">密码</Label>
                  <Input
                    id="invite-password"
                    type="password"
                    placeholder="至少 8 个字符"
                    value={invitePassword}
                    onChange={(e) => {
                      setInvitePassword(e.target.value);
                      if (inviteErrors.password) setInviteErrors((prev) => ({ ...prev, password: "" }));
                    }}
                    autoComplete="new-password"
                    disabled={loading}
                    aria-invalid={!!inviteErrors.password}
                    aria-describedby={inviteErrors.password ? "invite-password-error" : undefined}
                  />
                  {inviteErrors.password && (
                    <p id="invite-password-error" className="text-xs text-red-500" role="alert">
                      {inviteErrors.password}
                    </p>
                  )}
                </div>

                <div className="space-y-2">
                  <Label htmlFor="invite-phone">手机号</Label>
                  <div className="flex gap-2">
                    <Input
                      id="invite-phone"
                      type="tel"
                      placeholder="请输入手机号"
                      value={invitePhone}
                      onChange={(e) => {
                        setInvitePhone(e.target.value);
                        if (inviteErrors.phone) setInviteErrors((prev) => ({ ...prev, phone: "" }));
                      }}
                      autoComplete="tel"
                      disabled={loading}
                      className="flex-1"
                      maxLength={11}
                      aria-invalid={!!inviteErrors.phone}
                      aria-describedby={inviteErrors.phone ? "invite-phone-error" : undefined}
                    />
                    <Button
                      type="button"
                      variant="outline"
                      onClick={handleInviteSendCode}
                      disabled={loading || inviteCountdown > 0 || !invitePhone.trim()}
                      className="shrink-0 whitespace-nowrap"
                      aria-label={inviteCountdown > 0 ? `${inviteCountdown} 秒后可重新发送` : "发送验证码"}
                    >
                      {inviteCountdown > 0 ? `${inviteCountdown}s` : "发送验证码"}
                    </Button>
                  </div>
                  {inviteErrors.phone && (
                    <p id="invite-phone-error" className="text-xs text-red-500" role="alert">
                      {inviteErrors.phone}
                    </p>
                  )}
                </div>

                <div className="space-y-2">
                  <Label htmlFor="invite-sms-code">验证码</Label>
                  <Input
                    id="invite-sms-code"
                    type="text"
                    inputMode="numeric"
                    placeholder="请输入 6 位验证码"
                    value={inviteSmsCode}
                    onChange={(e) => {
                      setInviteSmsCode(e.target.value);
                      if (inviteErrors.code) setInviteErrors((prev) => ({ ...prev, code: "" }));
                    }}
                    autoComplete="one-time-code"
                    disabled={loading}
                    maxLength={6}
                    aria-invalid={!!inviteErrors.code}
                    aria-describedby={inviteErrors.code ? "invite-sms-code-error" : undefined}
                  />
                  {inviteErrors.code && (
                    <p id="invite-sms-code-error" className="text-xs text-red-500" role="alert">
                      {inviteErrors.code}
                    </p>
                  )}
                </div>

                <p className="text-xs text-muted-foreground">
                  使用邀请码注册将自动获得 DCR 区域访问权限
                </p>
                <div className="flex gap-2">
                  <Button
                    type="button"
                    variant="ghost"
                    className="flex-1"
                    onClick={() => {
                      setShowInvite(false);
                      setInviteCode("");
                      setInviteEmail("");
                      setInvitePassword("");
                      setInvitePhone("");
                      setInviteSmsCode("");
                      setInviteErrors({});
                      setErrorMessage("");
                    }}
                  >
                    取消
                  </Button>
                  <Button
                    type="submit"
                    className="flex-1"
                    disabled={loading}
                  >
                    {loading ? (
                      <span className="flex items-center">
                        <LoadingSpinner />
                        注册中...
                      </span>
                    ) : (
                      "注册"
                    )}
                  </Button>
                </div>
              </form>
            )}

            <div className="text-center">
              <Button
                type="button"
                variant="link"
                onClick={() => {
                  setView("form");
                  setErrorMessage("");
                  setRegErrors({});
                }}
              >
                已有账号？返回登录
              </Button>
            </div>
          </CardContent>
        </Card>
      </div>
    );
  }

  // ===== Main form view =====
  return (
    <div className="flex min-h-screen items-center justify-center px-4">
      <Card className="w-full max-w-md">
        <CardHeader className="text-center">
          <CardTitle className="text-2xl">登录学生交流社区</CardTitle>
          <CardDescription>选择您喜欢的方式登录</CardDescription>
        </CardHeader>

        <CardContent className="space-y-4">
          {/* Error message (shared across tabs) */}
          {errorMessage && (
            <div
              role="alert"
              className="flex items-center gap-2 rounded-md bg-red-50 p-3 text-sm text-red-600 dark:bg-red-900/20 dark:text-red-400"
            >
              <AlertCircle className="h-4 w-4 shrink-0" />
              {errorMessage}
            </div>
          )}

          {/* Login Tabs */}
          <Tabs
            value={activeTab}
            onValueChange={handleTabChange}
            className="w-full"
          >
            <TabsList className="grid w-full grid-cols-3" aria-label="登录方式">
              <TabsTrigger value="email">
                <Mail className="mr-1.5 h-4 w-4 hidden sm:inline-block" />
                邮箱登录
              </TabsTrigger>
              <TabsTrigger value="password">
                <Lock className="mr-1.5 h-4 w-4 hidden sm:inline-block" />
                密码登录
              </TabsTrigger>
              <TabsTrigger value="sms">
                <Smartphone className="mr-1.5 h-4 w-4 hidden sm:inline-block" />
                手机号登录
              </TabsTrigger>
            </TabsList>

            {/* Tab 1: Email magic link */}
            <TabsContent value="email">
              <form onSubmit={handleEmailSubmit} className="space-y-4">
                <div className="space-y-2">
                  <Label htmlFor="email-input">邮箱地址</Label>
                  <Input
                    id="email-input"
                    type="email"
                    placeholder="you@example.com"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    required
                    autoComplete="email"
                    disabled={loading}
                    aria-describedby="email-hint"
                  />
                  <p id="email-hint" className="text-xs text-muted-foreground">
                    我们将发送一封包含魔法链接的邮件
                  </p>
                </div>
                <Button
                  type="submit"
                  className="w-full"
                  disabled={loading || !email.trim()}
                >
                  {loading ? (
                    <span className="flex items-center">
                      <LoadingSpinner />
                      发送中...
                    </span>
                  ) : (
                    <span className="flex items-center">
                      <Mail className="mr-2 h-4 w-4" />
                      发送魔法链接
                    </span>
                  )}
                </Button>
              </form>
            </TabsContent>

            {/* Tab 2: Password login */}
            <TabsContent value="password">
              <form onSubmit={handlePasswordSubmit} className="space-y-4">
                <div className="space-y-2">
                  <Label htmlFor="pw-email">邮箱地址</Label>
                  <Input
                    id="pw-email"
                    type="email"
                    placeholder="you@example.com"
                    value={pwEmail}
                    onChange={(e) => {
                      setPwEmail(e.target.value);
                      if (pwErrors.email) setPwErrors((prev) => ({ ...prev, email: "" }));
                    }}
                    autoComplete="email"
                    disabled={loading}
                    aria-invalid={!!pwErrors.email}
                    aria-describedby={pwErrors.email ? "pw-email-error" : undefined}
                  />
                  {pwErrors.email && (
                    <p id="pw-email-error" className="text-xs text-red-500" role="alert">
                      {pwErrors.email}
                    </p>
                  )}
                </div>
                <div className="space-y-2">
                  <Label htmlFor="pw-password">密码</Label>
                  <Input
                    id="pw-password"
                    type="password"
                    placeholder="请输入密码"
                    value={pwPassword}
                    onChange={(e) => {
                      setPwPassword(e.target.value);
                      if (pwErrors.password) setPwErrors((prev) => ({ ...prev, password: "" }));
                    }}
                    autoComplete="current-password"
                    disabled={loading}
                    aria-invalid={!!pwErrors.password}
                    aria-describedby={pwErrors.password ? "pw-password-error" : undefined}
                  />
                  {pwErrors.password && (
                    <p id="pw-password-error" className="text-xs text-red-500" role="alert">
                      {pwErrors.password}
                    </p>
                  )}
                </div>
                <Button
                  type="submit"
                  className="w-full"
                  disabled={loading}
                >
                  {loading ? (
                    <span className="flex items-center">
                      <LoadingSpinner />
                      登录中...
                    </span>
                  ) : (
                    <span className="flex items-center">
                      <Lock className="mr-2 h-4 w-4" />
                      登录
                    </span>
                  )}
                </Button>
              </form>
            </TabsContent>

            {/* Tab 3: SMS login */}
            <TabsContent value="sms">
              <form onSubmit={handleSmsSubmit} className="space-y-4">
                <div className="space-y-2">
                  <Label htmlFor="sms-phone">手机号</Label>
                  <div className="flex gap-2">
                    <Input
                      id="sms-phone"
                      type="tel"
                      placeholder="请输入手机号"
                      value={smsPhone}
                      onChange={(e) => {
                        setSmsPhone(e.target.value);
                        if (smsErrors.phone) setSmsErrors((prev) => ({ ...prev, phone: "" }));
                      }}
                      autoComplete="tel"
                      disabled={loading}
                      className="flex-1"
                      maxLength={11}
                      aria-invalid={!!smsErrors.phone}
                      aria-describedby={smsErrors.phone ? "sms-phone-error" : undefined}
                    />
                    <Button
                      type="button"
                      variant="outline"
                      onClick={handleSendCode}
                      disabled={loading || countdown > 0 || !smsPhone.trim()}
                      className="shrink-0 whitespace-nowrap"
                      aria-label={countdown > 0 ? `${countdown} 秒后可重新发送` : "发送验证码"}
                    >
                      {countdown > 0 ? `${countdown}s` : "发送验证码"}
                    </Button>
                  </div>
                  {smsErrors.phone && (
                    <p id="sms-phone-error" className="text-xs text-red-500" role="alert">
                      {smsErrors.phone}
                    </p>
                  )}
                </div>
                <div className="space-y-2">
                  <Label htmlFor="sms-code">验证码</Label>
                  <Input
                    id="sms-code"
                    type="text"
                    inputMode="numeric"
                    placeholder="请输入 6 位验证码"
                    value={smsCode}
                    onChange={(e) => {
                      setSmsCode(e.target.value);
                      if (smsErrors.code) setSmsErrors((prev) => ({ ...prev, code: "" }));
                    }}
                    autoComplete="one-time-code"
                    disabled={loading}
                    maxLength={6}
                    aria-invalid={!!smsErrors.code}
                    aria-describedby={smsErrors.code ? "sms-code-error" : undefined}
                  />
                  {smsErrors.code && (
                    <p id="sms-code-error" className="text-xs text-red-500" role="alert">
                      {smsErrors.code}
                    </p>
                  )}
                </div>
                <Button
                  type="submit"
                  className="w-full"
                  disabled={loading}
                >
                  {loading ? (
                    <span className="flex items-center">
                      <LoadingSpinner />
                      登录中...
                    </span>
                  ) : (
                    <span className="flex items-center">
                      <Smartphone className="mr-2 h-4 w-4" />
                      登录
                    </span>
                  )}
                </Button>
              </form>
            </TabsContent>
          </Tabs>

          {/* Divider */}
          <div className="relative">
            <div className="absolute inset-0 flex items-center">
              <span className="w-full border-t" />
            </div>
            <div className="relative flex justify-center text-xs uppercase">
              <span className="bg-card px-2 text-muted-foreground">
                其他登录方式
              </span>
            </div>
          </div>

          {/* QQ Login */}
          <Button
            type="button"
            variant="outline"
            className="w-full"
            onClick={handleQQLogin}
            aria-label="使用 QQ 账号登录"
          >
            <svg
              className="mr-2 h-5 w-5"
              viewBox="0 0 24 24"
              fill="currentColor"
              aria-hidden="true"
            >
              <path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm0 3c1.66 0 3 1.34 3 3v1c0 1.66-1.34 3-3 3S9 10.66 9 9V8c0-1.66 1.34-3 3-3zm0 14c-2.5 0-4.71-1.28-6-3.22.03-2 4-3.08 6-3.08s5.97 1.08 6 3.08C16.71 17.72 14.5 19 12 19z" />
            </svg>
            QQ 登录
          </Button>

          {/* Divider for registration */}
          <div className="relative">
            <div className="absolute inset-0 flex items-center">
              <span className="w-full border-t" />
            </div>
            <div className="relative flex justify-center text-xs">
              <span className="bg-card px-2 text-muted-foreground">
                还没有账号？
              </span>
            </div>
          </div>

          {/* Registration button */}
          <Button
            type="button"
            variant="outline"
            className="w-full"
            onClick={() => {
              setView("register");
              setErrorMessage("");
            }}
          >
            <UserPlus className="mr-2 h-4 w-4" />
            注册新账号
          </Button>
        </CardContent>
      </Card>
    </div>
  );
}
