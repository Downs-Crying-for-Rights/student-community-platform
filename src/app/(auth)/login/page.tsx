"use client";

import { Suspense, useState, useEffect, useCallback, useRef } from "react";
import { signIn } from "next-auth/react";
import { useSearchParams, useRouter } from "next/navigation";
import Image from "next/image";
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
  UserPlus,
  Bot,
  Copy,
  RefreshCw,
  Loader2,
} from "lucide-react";
import {
  loginPasswordSchema,
  phoneSchema,
  registerSchema,
  inviteRegisterSchema,
  qqRegistrationSchema,
  resetPasswordSchema,
} from "@/lib/validators";
import { SafeMarkdown } from "@/components/shared/SafeMarkdown";
import { useSmsVerificationRequired } from "@/lib/sms/use-verification-required";
import { verificationCodeSchema } from "@/lib/validators";
import { LOGIN_POLICIES, REGISTRATION_POLICY_KEYS, type LoginPolicyId } from "@/lib/login-policies";
import { DEFAULT_REGISTRATION_ACCESS_POLICY, type RegistrationAccessPolicy } from "@/lib/phone-policy-shared";

type ViewState = "form" | "verify" | "expired" | "error" | "register" | "reset-password";
export type LoginTab = "email" | "password";

/** All tabs available on the login page */
export const LOGIN_TABS: LoginTab[] = ["email", "password"];

/** Represents the form state across all login tabs */
export interface LoginFormState {
  email: string;
  pwEmail: string;
  pwPassword: string;
  pwErrors: Record<string, string>;
  errorMessage: string;
}

/** Returns a blank form state (all fields empty / cleared) */
export function getEmptyFormState(): LoginFormState {
  return {
    email: "",
    pwEmail: "",
    pwPassword: "",
    pwErrors: {},
    errorMessage: "",
  };
}

function CaptchaField({
  image,
  code,
  loading,
  onCodeChange,
  onRefresh,
}: {
  image: string;
  code: string;
  loading: boolean;
  onCodeChange: (value: string) => void;
  onRefresh: () => void;
}) {
  return (
    <div className="space-y-2">
      <Label htmlFor="graphical-captcha">图形验证码</Label>
      <div className="flex items-stretch gap-2">
        <Input
          id="graphical-captcha"
          value={code}
          onChange={(event) => onCodeChange(event.target.value.replace(/[^A-Za-z0-9]/g, "").toUpperCase().slice(0, 5))}
          placeholder="输入图中字符"
          autoComplete="off"
          maxLength={5}
          className="min-w-0 uppercase"
          disabled={loading}
          required
        />
        <div className="flex h-12 w-[145px] shrink-0 items-center justify-center overflow-hidden rounded-md border bg-slate-50">
          {image ? <Image src={image} alt="图形验证码" width={145} height={48} unoptimized className="h-12 w-[145px] object-contain" /> : <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />}
        </div>
        <Button type="button" variant="outline" size="icon" className="h-12 w-12 shrink-0" onClick={onRefresh} title="换一张验证码" aria-label="换一张验证码">
          <RefreshCw className="h-4 w-4" aria-hidden="true" />
        </Button>
      </div>
    </div>
  );
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
  const [captchaId, setCaptchaId] = useState("");
  const [captchaImage, setCaptchaImage] = useState("");
  const [captchaCode, setCaptchaCode] = useState("");
  const [captchaLoading, setCaptchaLoading] = useState(false);

  // Active tab
  const [activeTab, setActiveTab] = useState<LoginTab>("email");
  const [loginAgreementAccepted, setLoginAgreementAccepted] = useState(false);

  // Email tab state
  const [email, setEmail] = useState("");

  // Password tab state
  const [pwEmail, setPwEmail] = useState("");
  const [pwPassword, setPwPassword] = useState("");
  const [pwErrors, setPwErrors] = useState<Record<string, string>>({});

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
  const [regPhone, setRegPhone] = useState("");
  const [regCode, setRegCode] = useState("");
  const [regCountdown, setRegCountdown] = useState(0);
  const regCountdownRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const [registrationPolicy, setRegistrationPolicy] = useState<RegistrationAccessPolicy>(DEFAULT_REGISTRATION_ACCESS_POLICY);
  const qqPollInFlightRef = useRef(false);
  const qqPollCompletedRef = useRef(false);
  const [regErrors, setRegErrors] = useState<Record<string, string>>({});
  const [regMethod, setRegMethod] = useState<"email" | "qq">("email");
  const [qqRegistration, setQQRegistration] = useState<{ credential: string; command: string; expiresAt: string } | null>(null);
  const [agreedKeys, setAgreedKeys] = useState<Record<string, boolean>>({});
  const [showAgreement, setShowAgreement] = useState("");
  const [agreementTitle, setAgreementTitle] = useState("");
  const [agreementContent, setAgreementContent] = useState("");
  const [allKeys, setAllKeys] = useState<{ key: string; title: string; revision: number }[]>([]);

  const currentCaptchaPurpose = view === "register"
    ? "register"
    : activeTab === "email" ? "login-email" : "login-password";

  const refreshCaptcha = useCallback(async (purpose = currentCaptchaPurpose) => {
    setCaptchaLoading(true);
    setCaptchaCode("");
    try {
      const response = await fetch(`/api/auth/captcha?purpose=${encodeURIComponent(purpose)}`, { cache: "no-store" });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(data.error || "验证码加载失败");
      setCaptchaId(data.captchaId || "");
      setCaptchaImage(data.image || "");
    } catch {
      setCaptchaId("");
      setCaptchaImage("");
      setErrorMessage("图形验证码加载失败，请稍后重试");
    } finally {
      setCaptchaLoading(false);
    }
  }, [currentCaptchaPurpose]);

  useEffect(() => {
    if (view === "form" || view === "register") void refreshCaptcha(currentCaptchaPurpose);
  }, [view, activeTab, currentCaptchaPurpose, refreshCaptcha]);

  const verifyLoginCaptcha = async (purpose: "login-email" | "login-password", subject?: string) => {
    if (!captchaId || captchaCode.length !== 5) throw new Error("请输入 5 位图形验证码");
    const response = await fetch("/api/auth/captcha", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ captchaId, captchaCode, purpose, ...(subject ? { subject } : {}) }),
    });
    const data = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(data.error || "图形验证码错误或已过期");
    return data.proof as string | undefined;
  };

  useEffect(() => {
    fetch("/api/access-policy", { cache: "no-store" })
      .then((response) => response.json())
      .then((data) => {
        if (data.registration) setRegistrationPolicy(data.registration);
      })
      .catch(() => {});
  }, []);

  // Login and registration share the same database-managed agreements.
  useEffect(() => {
    fetch("/api/site-content")
      .then(r => r.json())
      .then(d => {
        const registrationAgreements = (d.items ?? []).filter(
          (item: { key: string }) => REGISTRATION_POLICY_KEYS.includes(item.key as LoginPolicyId),
        );
        setAllKeys(registrationAgreements);
        const init: Record<string, boolean> = {};
        registrationAgreements.forEach((item: { key: string }) => { init[item.key] = false; });
        setAgreedKeys(init);
      })
      .catch(() => {});
  }, []);

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
      if (resetCountdownRef.current) clearInterval(resetCountdownRef.current);
      if (regCountdownRef.current) clearInterval(regCountdownRef.current);
    };
  }, []);

  useEffect(() => {
    if (!qqRegistration) return;
    qqPollCompletedRef.current = false;
    let stopped = false;
    const poll = async () => {
      if (qqPollInFlightRef.current || qqPollCompletedRef.current) return;
      qqPollInFlightRef.current = true;
      try {
        const response = await fetch("/api/auth/register/qq/status", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ credential: qqRegistration.credential }),
        });
        if (!response.ok) return;
        const data = await response.json();
        if (stopped) return;
        if (data.status === "EXPIRED") {
          setErrorMessage("注册凭据已过期，请重新生成");
          setQQRegistration(null);
          return;
        }
        if (data.status !== "COMPLETED") return;
        qqPollCompletedRef.current = true;
        const signedIn = await signIn("credentials-password", {
          identifier: regNickname.trim(),
          password: regPassword,
          redirect: false,
          callbackUrl: "/",
        });
        if (signedIn?.error) {
          setErrorMessage("注册成功，请使用用户名和密码登录");
          setView("form");
          setActiveTab("password");
          setPwEmail(regNickname.trim());
          return;
        }
        setRegPassword("");
        router.push(signedIn?.url || "/");
        router.refresh();
      } catch {
        // The next poll retries transient status failures.
      } finally {
        qqPollInFlightRef.current = false;
      }
    };
    void poll();
    const timer = window.setInterval(() => void poll(), 2_000);
    return () => {
      stopped = true;
      window.clearInterval(timer);
    };
  }, [qqRegistration, regNickname, regPassword, router]);

  function getErrorMessage(error: string): string {
    switch (error) {
      case "EmailSignin":
        return "邮件发送失败，请检查邮箱地址后重试。";
      case "Configuration":
        return "服务器配置错误，请联系管理员。";
      case "CredentialsSignin":
        return "账号或密码错误";
      case "EmailCreateAccount":
      case "OAuthCreateAccount":
        return "该账号尚未注册，请先使用邮箱完成注册。";
      default:
        return "登录过程中发生错误，请重试。";
    }
  }

  // Clear form state when switching tabs
  const handleTabChange = useCallback((value: string) => {
    const newTab = value as LoginTab;
    const prevState: LoginFormState = {
      email, pwEmail, pwPassword, pwErrors, errorMessage,
    };
    const result = computeTabChangeState(prevState, newTab);
    setActiveTab(result.activeTab);
    setEmail(result.formState.email);
    setPwEmail(result.formState.pwEmail);
    setPwPassword(result.formState.pwPassword);
    setPwErrors(result.formState.pwErrors);
    setErrorMessage(result.formState.errorMessage);
    if (view === "error") setView("form");
  }, [view, email, pwEmail, pwPassword, pwErrors, errorMessage]);

  // ===== Email magic link =====
  async function handleEmailSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!loginAgreementAccepted) return;
    if (!email.trim()) return;

    setLoading(true);
    setErrorMessage("");

    try {
      await verifyLoginCaptcha("login-email", email.trim());
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
      setErrorMessage("图形验证码错误、已过期或网络异常，请重试。");
      setView("error");
      void refreshCaptcha("login-email");
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
      identifier: pwEmail.trim(),
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
      const captchaProof = await verifyLoginCaptcha("login-password");
      const check = await fetch("/api/auth/punishment-check", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ identifier: pwEmail.trim(), password: pwPassword, captchaProof }),
      });
      const checkData = await check.json().catch(() => ({}));
      if (!check.ok) {
        setErrorMessage("账号或密码错误");
        void refreshCaptcha("login-password");
        return;
      }
      if (checkData.banned) {
        router.push("/ban-appeal");
        return;
      }
      const res = await signIn("credentials-password", {
        identifier: pwEmail.trim(),
        password: pwPassword,
        captchaProof: checkData.captchaProof,
        redirect: false,
        callbackUrl: "/",
      });

      if (res?.error) {
        setErrorMessage("账号或密码错误");
      } else if (res?.url) {
        router.push(res.url);
        router.refresh();
      }
    } catch {
      setErrorMessage("网络错误，请检查网络连接后重试。");
      void refreshCaptcha("login-password");
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

  async function openLoginPolicy(policyId: LoginPolicyId) {
    try {
      const response = await fetch(`/api/site-content/${policyId}`);
      const data = await response.json();
      setAgreementTitle(data.title || allKeys.find((item) => item.key === policyId)?.title || LOGIN_POLICIES[policyId].title);
      setAgreementContent(data.content || "暂无内容");
    } catch {
      setAgreementTitle(allKeys.find((item) => item.key === policyId)?.title || LOGIN_POLICIES[policyId].title);
      setAgreementContent("加载失败");
    }
    setShowAgreement(policyId);
  }

  // ===== Registration =====
  async function handleRegistrationSendCode() {
    const parsed = phoneSchema.safeParse(regPhone.trim());
    if (!parsed.success) {
      setRegErrors((current) => ({ ...current, phone: parsed.error.issues[0].message }));
      return;
    }
    setLoading(true);
    setRegErrors((current) => ({ ...current, phone: "", code: "" }));
    try {
      const response = await fetch("/api/sms/send", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ phone: regPhone.trim(), purpose: "register" }),
      });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) {
        setRegErrors((current) => ({ ...current, phone: data.error || "验证码发送失败" }));
        return;
      }
      setRegCountdown(60);
      if (regCountdownRef.current) clearInterval(regCountdownRef.current);
      regCountdownRef.current = setInterval(() => {
        setRegCountdown((previous) => {
          if (previous <= 1) {
            if (regCountdownRef.current) clearInterval(regCountdownRef.current);
            regCountdownRef.current = null;
            return 0;
          }
          return previous - 1;
        });
      }, 1000);
    } catch {
      setRegErrors((current) => ({ ...current, phone: "网络错误，请稍后重试" }));
    } finally {
      setLoading(false);
    }
  }

  async function handleRegisterSubmit(e: React.FormEvent) {
    e.preventDefault();
    setRegErrors({});
    setInviteErrors({});
    setErrorMessage("");

    if (regMethod === "email" && showInvite && !registrationPolicy.inviteEnabled) {
      setErrorMessage("邀请码注册当前已关闭");
      return;
    }
    if (regMethod === "email" && !showInvite && !registrationPolicy.emailEnabled) {
      setErrorMessage("邮箱注册当前已关闭，请使用其他开放的注册方式");
      return;
    }

    if (regMethod === "qq") {
      if (!registrationPolicy.qqEnabled || registrationPolicy.phoneRequired) {
        setErrorMessage("QQ 机器人注册当前已关闭");
        return;
      }
      const registrationData = {
        username: regNickname.trim(),
        password: regPassword,
        agreementRevisions: Object.fromEntries(allKeys.filter(({ key }) => agreedKeys[key]).map(({ key, revision }) => [key, revision])),
        captchaId,
        captchaCode,
      };
      const parsed = qqRegistrationSchema.safeParse(registrationData);
      if (!parsed.success) {
        const fieldErrors: Record<string, string> = {};
        for (const issue of parsed.error.issues) {
          const field = String(issue.path[0]) === "username" ? "nickname" : String(issue.path[0]);
          fieldErrors[field] ||= issue.message;
        }
        setRegErrors(fieldErrors);
        return;
      }
      setLoading(true);
      try {
        const response = await fetch("/api/auth/register/qq", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(registrationData),
        });
        const data = await response.json();
        if (!response.ok) {
          setErrorMessage(data.error || "注册凭据生成失败");
          return;
        }
        setQQRegistration(data);
      } catch {
        setErrorMessage("网络错误，请检查网络连接后重试。");
      } finally {
        setLoading(false);
      }
      return;
    }

    const registrationData = {
      email: regEmail.trim(),
      password: regPassword,
      nickname: regNickname.trim(),
      ...(registrationPolicy.phoneRequired ? { phone: regPhone.trim(), code: regCode.trim() } : {}),
      ...(showInvite ? { inviteCode: inviteCode.trim() } : {}),
      captchaId,
      captchaCode,
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
        void refreshCaptcha("register");
        return;
      }

      const signInRes = await signIn("credentials-password", {
        identifier: regEmail.trim(),
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
              {registrationPolicy.phoneRequired ? "当前注册必须完成手机号验证。" : "手机号可在注册后按需绑定。"}
            </div>
            <div className="grid grid-cols-2 gap-2 rounded-lg bg-muted p-1">
              <Button type="button" disabled={!registrationPolicy.emailEnabled && !registrationPolicy.inviteEnabled} variant={regMethod === "email" ? "secondary" : "ghost"} onClick={() => { setRegMethod("email"); setQQRegistration(null); setErrorMessage(""); }}>邮箱注册</Button>
              <Button type="button" disabled={!registrationPolicy.qqEnabled || registrationPolicy.phoneRequired} variant={regMethod === "qq" ? "secondary" : "ghost"} onClick={() => { setRegMethod("qq"); setShowInvite(false); setQQRegistration(null); setErrorMessage(""); }}><Bot className="mr-2 h-4 w-4" />QQ 机器人验证</Button>
            </div>
            {qqRegistration ? (
              <div className="space-y-4 rounded-xl border border-primary/30 bg-primary/5 p-4">
                <div>
                  <p className="font-medium">私聊机器人发送以下完整指令</p>
                  <p className="mt-1 text-xs text-muted-foreground">凭据 15 分钟内有效。指令不含密码，请勿向任何人发送密码。</p>
                </div>
                <code className="block break-all rounded-lg bg-background p-3 text-sm">{qqRegistration.command}</code>
                <Button type="button" variant="outline" className="w-full" onClick={() => void navigator.clipboard.writeText(qqRegistration.command)}><Copy className="mr-2 h-4 w-4" />复制机器人指令</Button>
                <p className="text-center text-sm text-muted-foreground">等待机器人确认，页面每 2 秒自动检测...</p>
                <Button type="button" variant="ghost" className="w-full" onClick={() => setQQRegistration(null)}>重新填写</Button>
              </div>
            ) : (
            <form onSubmit={handleRegisterSubmit} className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="reg-nickname">{regMethod === "qq" ? "登录用户名" : "用户名"}</Label>
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

              {regMethod === "email" && <div className="space-y-2">
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
              </div>}

              {regMethod === "email" && registrationPolicy.phoneRequired && (
                <div className="space-y-4 rounded-md border p-3">
                  <div className="space-y-2">
                    <Label htmlFor="reg-phone">手机号</Label>
                    <div className="flex gap-2">
                      <Input
                        id="reg-phone"
                        type="tel"
                        inputMode="numeric"
                        placeholder="11 位大陆手机号"
                        value={regPhone}
                        onChange={(event) => {
                          setRegPhone(event.target.value.replace(/\D/g, "").slice(0, 11));
                          if (regErrors.phone) setRegErrors((current) => ({ ...current, phone: "" }));
                        }}
                        autoComplete="tel"
                        disabled={loading}
                        aria-invalid={Boolean(regErrors.phone)}
                      />
                      <Button type="button" variant="outline" className="shrink-0" disabled={loading || regCountdown > 0} onClick={() => void handleRegistrationSendCode()}>
                        {regCountdown > 0 ? `${regCountdown}s` : "发送验证码"}
                      </Button>
                    </div>
                    {regErrors.phone && <p className="text-xs text-red-500" role="alert">{regErrors.phone}</p>}
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="reg-sms-code">短信验证码</Label>
                    <Input
                      id="reg-sms-code"
                      inputMode="numeric"
                      placeholder="6 位验证码"
                      value={regCode}
                      onChange={(event) => {
                        setRegCode(event.target.value.replace(/\D/g, "").slice(0, 6));
                        if (regErrors.code) setRegErrors((current) => ({ ...current, code: "" }));
                      }}
                      disabled={loading}
                      aria-invalid={Boolean(regErrors.code)}
                    />
                    {regErrors.code && <p className="text-xs text-red-500" role="alert">{regErrors.code}</p>}
                  </div>
                </div>
              )}

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

              {regMethod === "email" && showInvite && (
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
                  <p className="text-xs text-muted-foreground">特定邀请码可授予 DCR 发帖与委托提交权限，但不会开放互助任务、互助循环或完整 DCR 工作台。</p>
                </div>
              )}

              <CaptchaField
                image={captchaImage}
                code={captchaCode}
                loading={captchaLoading || loading}
                onCodeChange={setCaptchaCode}
                onRefresh={() => void refreshCaptcha("register")}
              />

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
                      <button type="button" className="ml-1 underline text-primary hover:text-primary/80" onClick={() => void openLoginPolicy(key as LoginPolicyId)}>
                        《{title}》
                      </button>
                    </label>
                  </div>
                ))}
              </div>

              <Button
                type="submit"
                className="w-full"
                disabled={loading || allKeys.length !== REGISTRATION_POLICY_KEYS.length || allKeys.some(({ key }) => !agreedKeys[key])}
              >
                {loading ? (
                  <span className="flex items-center">
                    <LoadingSpinner />
                     {regMethod === "qq" ? "生成凭据中..." : "注册中..."}
                  </span>
                ) : (
                  <span className="flex items-center">
                    <UserPlus className="mr-2 h-4 w-4" />
                     {regMethod === "qq" ? "生成机器人注册凭据" : "注册"}
                  </span>
                )}
              </Button>
            </form>
            )}

            {regMethod === "email" && registrationPolicy.inviteEnabled && <Button
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
            </Button>}

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
              <DialogTitle>{agreementTitle || allKeys.find(k => k.key === showAgreement)?.title || LOGIN_POLICIES[showAgreement as LoginPolicyId]?.title || "协议"}</DialogTitle>
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
            <TabsList className="grid w-full grid-cols-2" aria-label="登录方式">
              <TabsTrigger value="email">
                <Mail className="mr-1.5 h-4 w-4 hidden sm:inline-block" />
                邮箱登录
              </TabsTrigger>
              <TabsTrigger value="password">
                <Lock className="mr-1.5 h-4 w-4 hidden sm:inline-block" />
                密码登录
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
                <CaptchaField
                  image={captchaImage}
                  code={captchaCode}
                  loading={captchaLoading || loading}
                  onCodeChange={setCaptchaCode}
                  onRefresh={() => void refreshCaptcha("login-email")}
                />
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
                  <Label htmlFor="pw-email">邮箱、用户名或手机号</Label>
                  <Input
                    id="pw-email"
                    type="text"
                    placeholder="邮箱地址、用户名或手机号"
                    value={pwEmail}
                    onChange={(e) => {
                      setPwEmail(e.target.value);
                      if (pwErrors.identifier) setPwErrors((prev) => ({ ...prev, identifier: "" }));
                    }}
                    autoComplete="username"
                    disabled={loading}
                    aria-invalid={!!pwErrors.identifier}
                    aria-describedby={pwErrors.identifier ? "pw-email-error" : undefined}
                  />
                  {pwErrors.identifier && (
                    <p id="pw-email-error" className="text-xs text-red-500" role="alert">
                      {pwErrors.identifier}
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
                <CaptchaField
                  image={captchaImage}
                  code={captchaCode}
                  loading={captchaLoading || loading}
                  onCodeChange={setCaptchaCode}
                  onRefresh={() => void refreshCaptcha("login-password")}
                />
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

          </Tabs>

          <div className="flex items-start gap-2 rounded-md border bg-muted/30 p-3">
            <input
              id="login-agreement"
              type="checkbox"
              checked={loginAgreementAccepted}
              onChange={(event) => setLoginAgreementAccepted(event.target.checked)}
              className="mt-0.5 h-4 w-4 shrink-0 accent-primary"
              aria-label="同意用户协议和隐私政策"
            />
            <div className="text-xs leading-relaxed text-muted-foreground">
              我已阅读并同意
              {REGISTRATION_POLICY_KEYS.map((key, index) => {
                const title = allKeys.find((item) => item.key === key)?.title || LOGIN_POLICIES[key].title;
                return (
                  <span key={key}>
                    {index > 0 ? "和" : null}
                    <button type="button" onClick={() => void openLoginPolicy(key)} className="mx-1 text-primary underline hover:text-primary/80">《{title}》</button>
                  </span>
                );
              })}
            </div>
          </div>

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
      <Dialog open={!!showAgreement} onOpenChange={(open) => { if (!open) setShowAgreement(""); }}>
        <DialogContent className="max-h-[80vh] max-w-lg overflow-y-auto">
          <DialogHeader>
            <DialogTitle>{agreementTitle || allKeys.find(k => k.key === showAgreement)?.title || LOGIN_POLICIES[showAgreement as LoginPolicyId]?.title || "协议"}</DialogTitle>
          </DialogHeader>
          <SafeMarkdown content={agreementContent || "暂无内容"} />
        </DialogContent>
      </Dialog>
    </div>
  );
}
