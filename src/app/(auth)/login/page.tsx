"use client";

import { Suspense, useState, useEffect, useCallback, useRef } from "react";
import { signIn } from "next-auth/react";
import { useSearchParams, useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
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
  resetPasswordSchema,
} from "@/lib/validators";
import { SafeMarkdown } from "@/components/shared/SafeMarkdown";
import { useSmsVerificationRequired } from "@/lib/sms/use-verification-required";
import { verificationCodeSchema } from "@/lib/validators";

type ViewState = "form" | "verify" | "expired" | "error" | "register" | "reset-password";
export type LoginTab = "email" | "password" | "sms";

const USAGE_CONSENT_KEYS = new Set(["dm_consent", "chat_monitoring_consent"]);

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
              <CardTitle className="text-2xl">登录学互会</CardTitle>
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
  const verificationRequired = useSmsVerificationRequired();

  // View state
  const [view, setView] = useState<ViewState>("form");
  const [errorMessage, setErrorMessage] = useState("");
  const [successMessage, setSuccessMessage] = useState("");
  const [loading, setLoading] = useState(false);

  // Active tab
  const [activeTab, setActiveTab] = useState<LoginTab>("email");
  const [loginAgreementAccepted, setLoginAgreementAccepted] = useState(false);

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

  // Password reset state
  const [resetPhone, setResetPhone] = useState("");
  const [resetCode, setResetCode] = useState("");
  const [resetPassword, setResetPassword] = useState("");
  const [resetConfirmPassword, setResetConfirmPassword] = useState("");
  const [resetErrors, setResetErrors] = useState<Record<string, string>>({});
  const [resetCountdown, setResetCountdown] = useState(0);
  const resetCountdownRef = useRef<ReturnType<typeof setInterval> | null>(null);

  // Invite code state
  const [showInvite, setShowInvite] = useState(false);
  const [inviteCode, setInviteCode] = useState("");
  const [inviteErrors, setInviteErrors] = useState<Record<string, string>>({});

  // Registration state
  const [regEmail, setRegEmail] = useState("");
  const [regPassword, setRegPassword] = useState("");
  const [regNickname, setRegNickname] = useState("");
  const [regErrors, setRegErrors] = useState<Record<string, string>>({});
  const [agreedKeys, setAgreedKeys] = useState<Record<string, boolean>>({});
  const [showAgreement, setShowAgreement] = useState("");
  const [agreementContent, setAgreementContent] = useState("");
  const [allKeys, setAllKeys] = useState<{ key: string; title: string }[]>([]);

  // Load site content keys when entering register view
  useEffect(() => {
    if (view === "register" && allKeys.length === 0) {
      fetch("/api/site-content")
        .then(r => r.json())
        .then(d => {
          const registrationAgreements = (d.items ?? []).filter(
            (item: { key: string }) => !USAGE_CONSENT_KEYS.has(item.key),
          );
          setAllKeys(registrationAgreements);
          // Initialize all as unchecked
          const init: Record<string, boolean> = {};
          registrationAgreements.forEach((item: { key: string }) => { init[item.key] = false; });
          setAgreedKeys(init);
        })
        .catch(() => {});
    }
  }, [view, allKeys.length]);

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
      if (resetCountdownRef.current) clearInterval(resetCountdownRef.current);
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
    if (!loginAgreementAccepted) return;
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
    if (!loginAgreementAccepted) return;
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
    if (!loginAgreementAccepted) return;
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
    if (!loginAgreementAccepted) return;
    setSmsErrors({});
    setErrorMessage("");

    const result = loginSmsSchema.safeParse({
      phone: smsPhone.trim(),
      ...(verificationRequired ? { code: smsCode.trim() } : {}),
    });

    if (!result.success || (verificationRequired && !verificationCodeSchema.safeParse(smsCode.trim()).success)) {
      const fieldErrors: Record<string, string> = {};
      if (!result.success) {
        for (const issue of result.error.issues) {
          const field = issue.path[0] as string;
          if (!fieldErrors[field]) fieldErrors[field] = issue.message;
        }
      }
      if (verificationRequired && !fieldErrors.code) fieldErrors.code = "验证码为 6 位数字";
      setSmsErrors(fieldErrors);
      return;
    }

    setLoading(true);

    try {
      const res = await signIn("credentials-sms", {
        phone: smsPhone.trim(),
        ...(verificationRequired ? { code: smsCode.trim() } : {}),
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

  async function handleResetSendCode() {
    setResetErrors({});
    const parsed = phoneSchema.safeParse(resetPhone.trim());
    if (!parsed.success) {
      setResetErrors({ phone: parsed.error.issues[0].message });
      return;
    }
    setLoading(true);
    try {
      const response = await fetch("/api/auth/password/reset/send", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ phone: resetPhone.trim() }),
      });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) {
        setResetErrors({ phone: data.error || "验证码发送失败" });
        return;
      }
      setResetCountdown(60);
      if (resetCountdownRef.current) clearInterval(resetCountdownRef.current);
      resetCountdownRef.current = setInterval(() => {
        setResetCountdown((previous) => {
          if (previous <= 1) {
            if (resetCountdownRef.current) clearInterval(resetCountdownRef.current);
            resetCountdownRef.current = null;
            return 0;
          }
          return previous - 1;
        });
      }, 1000);
    } catch {
      setResetErrors({ phone: "网络错误，请稍后重试" });
    } finally {
      setLoading(false);
    }
  }

  async function handleResetPassword(e: React.FormEvent) {
    e.preventDefault();
    setResetErrors({});
    const parsed = resetPasswordSchema.safeParse({
      phone: resetPhone.trim(),
      ...(verificationRequired ? { code: resetCode.trim() } : {}),
      password: resetPassword,
      confirmPassword: resetConfirmPassword,
    });
    if (!parsed.success || (verificationRequired && !verificationCodeSchema.safeParse(resetCode.trim()).success)) {
      const errors: Record<string, string> = {};
      if (!parsed.success) {
        for (const issue of parsed.error.issues) {
          const field = String(issue.path[0]);
          if (!errors[field]) errors[field] = issue.message;
        }
      }
      if (verificationRequired && !errors.code) errors.code = "验证码为 6 位数字";
      setResetErrors(errors);
      return;
    }
    setLoading(true);
    try {
      const response = await fetch("/api/auth/password/reset", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(parsed.data),
      });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) {
        setResetErrors({ form: data.error || "密码重置失败" });
        return;
      }
      setResetPhone("");
      setResetCode("");
      setResetPassword("");
      setResetConfirmPassword("");
      setActiveTab("password");
      setSuccessMessage("密码已重置，请使用新密码登录");
      setView("form");
    } catch {
      setResetErrors({ form: "网络错误，请稍后重试" });
    } finally {
      setLoading(false);
    }
  }

  // ===== QQ login =====
  function handleQQLogin() {
    if (!loginAgreementAccepted) return;
    signIn("qq");
  }

  // ===== Registration =====
  async function handleRegisterSubmit(e: React.FormEvent) {
    e.preventDefault();
    setRegErrors({});
    setInviteErrors({});
    setErrorMessage("");

    const registrationData = {
      email: regEmail.trim(),
      password: regPassword,
      nickname: regNickname.trim(),
      ...(showInvite ? { inviteCode: inviteCode.trim() } : {}),
    };
    const result = (showInvite ? inviteRegisterSchema : registerSchema).safeParse(registrationData);

    if (!result.success) {
      const fieldErrors: Record<string, string> = {};
      for (const issue of result.error.issues) {
        const field = issue.path[0] as string;
        if (!fieldErrors[field]) fieldErrors[field] = issue.message;
      }
      setRegErrors(fieldErrors);
      if (fieldErrors.inviteCode) setInviteErrors({ inviteCode: fieldErrors.inviteCode });
      return;
    }

    setLoading(true);

    try {
      const res = await fetch(showInvite ? "/api/auth/invite" : "/api/auth/register", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(registrationData),
      });

      const data = await res.json();

      if (!res.ok) {
        setErrorMessage(data.error || "注册失败，请重试");
        return;
      }

      const signInRes = await signIn("credentials-password", {
        email: regEmail.trim(),
        password: regPassword,
        redirect: false,
        callbackUrl: "/",
      });

      if (signInRes?.error) {
        setErrorMessage("注册成功，但自动登录失败，请使用邮箱和密码登录");
        setView("form");
        setActiveTab("password");
        setPwEmail(regEmail.trim());
        return;
      }

      router.push(signInRes?.url || "/");
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
  if (view === "error") {
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

  // ===== Password reset view =====
  if (view === "reset-password") {
    return (
      <div className="flex min-h-screen items-center justify-center px-4">
        <Card className="w-full max-w-md">
          <CardHeader className="text-center">
            <div className="mx-auto mb-3 flex h-14 w-14 items-center justify-center rounded-full bg-primary/10">
              <KeyRound className="h-7 w-7 text-primary" />
            </div>
            <CardTitle>重置密码</CardTitle>
            <CardDescription>使用账户已绑定的手机号验证身份</CardDescription>
          </CardHeader>
          <CardContent>
            <form onSubmit={handleResetPassword} className="space-y-4">
              {resetErrors.form && <p className="rounded-md bg-red-50 p-3 text-sm text-red-600" role="alert">{resetErrors.form}</p>}
              <div className="space-y-2">
                <Label htmlFor="reset-phone">已绑定手机号</Label>
                <div className="flex gap-2">
                  <Input id="reset-phone" type="tel" value={resetPhone} maxLength={11} autoComplete="tel" onChange={(event) => setResetPhone(event.target.value)} disabled={loading} />
                  {verificationRequired && (
                    <Button type="button" variant="outline" onClick={() => void handleResetSendCode()} disabled={loading || resetCountdown > 0 || !resetPhone.trim()}>
                      {resetCountdown > 0 ? `${resetCountdown}s` : "发送验证码"}
                    </Button>
                  )}
                </div>
                {resetErrors.phone && <p className="text-xs text-red-500" role="alert">{resetErrors.phone}</p>}
              </div>
              {verificationRequired && <div className="space-y-2">
                <Label htmlFor="reset-code">验证码</Label>
                <Input id="reset-code" inputMode="numeric" autoComplete="one-time-code" maxLength={6} value={resetCode} onChange={(event) => setResetCode(event.target.value)} disabled={loading} />
                {resetErrors.code && <p className="text-xs text-red-500" role="alert">{resetErrors.code}</p>}
              </div>}
              <div className="space-y-2">
                <Label htmlFor="reset-password">新密码</Label>
                <Input id="reset-password" type="password" autoComplete="new-password" value={resetPassword} onChange={(event) => setResetPassword(event.target.value)} disabled={loading} />
                {resetErrors.password && <p className="text-xs text-red-500" role="alert">{resetErrors.password}</p>}
              </div>
              <div className="space-y-2">
                <Label htmlFor="reset-confirm-password">确认新密码</Label>
                <Input id="reset-confirm-password" type="password" autoComplete="new-password" value={resetConfirmPassword} onChange={(event) => setResetConfirmPassword(event.target.value)} disabled={loading} />
                {resetErrors.confirmPassword && <p className="text-xs text-red-500" role="alert">{resetErrors.confirmPassword}</p>}
              </div>
              <Button type="submit" className="w-full" disabled={loading}>{loading ? "重置中..." : "确认重置密码"}</Button>
            </form>
          </CardContent>
          <CardFooter className="justify-center">
            <Button type="button" variant="ghost" onClick={() => { setResetErrors({}); setView("form"); }}>
              <ArrowLeft className="mr-2 h-4 w-4" />返回登录
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
            <CardTitle className="text-2xl">注册学互会</CardTitle>
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

            <div className="rounded-md bg-muted/50 px-3 py-2 text-sm text-muted-foreground">
              普通注册无需邀请码，填写以下信息并同意协议即可注册。
            </div>
            <form onSubmit={handleRegisterSubmit} className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="reg-nickname">用户名</Label>
                <Input
                  id="reg-nickname"
                  type="text"
                  placeholder="设置你的用户名"
                  value={regNickname}
                  onChange={(e) => {
                    setRegNickname(e.target.value);
                    if (regErrors.nickname) setRegErrors((prev) => ({ ...prev, nickname: "" }));
                  }}
                  autoComplete="username"
                  disabled={loading}
                  aria-invalid={!!regErrors.nickname}
                  aria-describedby={regErrors.nickname ? "reg-nickname-error" : undefined}
                />
                {regErrors.nickname && (
                  <p id="reg-nickname-error" className="text-xs text-red-500" role="alert">
                    {regErrors.nickname}
                  </p>
                )}
              </div>

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

              {showInvite && (
                <div className="space-y-2">
                  <Label htmlFor="reg-invite-code">邀请码</Label>
                  <Input
                    id="reg-invite-code"
                    type="text"
                    placeholder="请输入邀请码"
                    value={inviteCode}
                    onChange={(event) => {
                      setInviteCode(event.target.value);
                      if (inviteErrors.inviteCode) setInviteErrors({});
                    }}
                    maxLength={32}
                    disabled={loading}
                    aria-invalid={Boolean(inviteErrors.inviteCode)}
                    aria-describedby={inviteErrors.inviteCode ? "reg-invite-code-error" : undefined}
                  />
                  {inviteErrors.inviteCode && (
                    <p id="reg-invite-code-error" className="text-xs text-red-500" role="alert">
                      {inviteErrors.inviteCode}
                    </p>
                  )}
                  <p className="text-xs text-muted-foreground">邀请码只用于注册资格，不会跳过 DCR 安全准入流程。</p>
                </div>
              )}

              {/* 用户协议 */}
              <div className="space-y-2">
                {allKeys.map(({ key, title }) => (
                  <div key={key} className="flex min-h-11 items-center gap-2">
                    <input
                      type="checkbox"
                      id={`reg-${key}`}
                      checked={agreedKeys[key] ?? false}
                      onChange={(e) => setAgreedKeys(prev => ({ ...prev, [key]: e.target.checked }))}
                      className="h-4 w-4 shrink-0 accent-primary"
                    />
                    <label htmlFor={`reg-${key}`} className="text-xs text-muted-foreground leading-relaxed">
                      我已阅读并同意
                      <button type="button" className="ml-1 underline text-primary hover:text-primary/80" onClick={async () => {
                        try {
                          const r = await fetch(`/api/site-content/${key}`);
                          const d = await r.json();
                          setAgreementContent(d.content || "暂无内容");
                        } catch { setAgreementContent("加载失败"); }
                        setShowAgreement(key);
                      }}>
                        《{title}》
                      </button>
                    </label>
                  </div>
                ))}
              </div>

              <Button
                type="submit"
                className="w-full"
                disabled={loading || allKeys.some(({ key }) => !agreedKeys[key])}
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

            <Button
              type="button"
              variant="ghost"
              className="w-full"
              onClick={() => {
                setShowInvite((current) => !current);
                setInviteCode("");
                setInviteErrors({});
                setErrorMessage("");
              }}
            >
              <KeyRound className="mr-2 h-4 w-4" />
              {showInvite ? "不使用邀请码" : "我有邀请码"}
            </Button>

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

        {/* 用户协议弹窗 */}
        <Dialog open={!!showAgreement} onOpenChange={(v) => { if (!v) setShowAgreement(""); }}>
          <DialogContent className="max-h-[80vh] max-w-lg overflow-y-auto">
            <DialogHeader>
              <DialogTitle>{allKeys.find(k => k.key === showAgreement)?.title ?? "协议"}</DialogTitle>
            </DialogHeader>
            <SafeMarkdown content={agreementContent || "暂无内容"} />
          </DialogContent>
        </Dialog>
      </div>
    );
  }

  // ===== Main form view =====
  return (
    <div className="flex min-h-screen items-center justify-center px-4">
      <Card className="w-full max-w-md">
        <CardHeader className="text-center">
          <CardTitle className="text-2xl">登录学互会</CardTitle>
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
          {successMessage && (
            <div role="status" className="flex items-center gap-2 rounded-md bg-green-50 p-3 text-sm text-green-700 dark:bg-green-900/20 dark:text-green-400">
              <CheckCircle className="h-4 w-4 shrink-0" />{successMessage}
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
                  disabled={loading || !email.trim() || !loginAgreementAccepted}
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
                  disabled={loading || !loginAgreementAccepted}
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
                <button
                  type="button"
                  className="w-full text-center text-sm text-primary hover:underline"
                  onClick={() => { setResetErrors({}); setSuccessMessage(""); setView("reset-password"); }}
                >
                  忘记密码？
                </button>
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
                    {verificationRequired && <Button
                      type="button"
                      variant="outline"
                      onClick={handleSendCode}
                      disabled={loading || countdown > 0 || !smsPhone.trim() || !loginAgreementAccepted}
                      className="shrink-0 whitespace-nowrap"
                      aria-label={countdown > 0 ? `${countdown} 秒后可重新发送` : "发送验证码"}
                    >
                      {countdown > 0 ? `${countdown}s` : "发送验证码"}
                    </Button>}
                  </div>
                  {smsErrors.phone && (
                    <p id="sms-phone-error" className="text-xs text-red-500" role="alert">
                      {smsErrors.phone}
                    </p>
                  )}
                </div>
                {verificationRequired && <div className="space-y-2">
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
                </div>}
                <Button
                  type="submit"
                  className="w-full"
                  disabled={loading || !loginAgreementAccepted}
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

          <div className="flex items-start gap-2 rounded-md border bg-muted/30 p-3">
            <input
              id="login-agreement"
              type="checkbox"
              checked={loginAgreementAccepted}
              onChange={(event) => setLoginAgreementAccepted(event.target.checked)}
              className="mt-0.5 h-4 w-4 shrink-0 accent-primary"
            />
            <label htmlFor="login-agreement" className="text-xs leading-relaxed text-muted-foreground">
              我已阅读并同意
              <a href="/help/policies?document=user-agreement" target="_blank" rel="noreferrer" className="mx-1 text-primary underline hover:text-primary/80">《用户协议》</a>
              和
              <a href="/help/policies?document=privacy-policy" target="_blank" rel="noreferrer" className="ml-1 text-primary underline hover:text-primary/80">《隐私政策》</a>
            </label>
          </div>

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
            disabled={!loginAgreementAccepted}
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
