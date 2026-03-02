"use client";

import { useState } from "react";
import {
  Heart,
  ShieldCheck,
  Users,
  Eye,
  HandHeart,
  AlertTriangle,
  Phone,
  CheckCircle2,
  Clock,
  Loader2,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

/* ========== Pure Helper Functions (exported for testing) ========== */

/**
 * Returns human-readable status text for an application status.
 */
export function getApplicationStatusText(status: string): string {
  switch (status) {
    case "pending":
      return "您的申请正在审核中，请耐心等待";
    case "approved":
      return "您已获得心理交流区访问权限";
    case "rejected":
      return "您的申请未通过审核，如有疑问请联系管理员";
    case "hasAccess":
      return "您已拥有心理交流区访问权限";
    default:
      return "";
  }
}

/**
 * Returns CSS class string for the given application status.
 */
export function getApplicationStatusColor(status: string): string {
  switch (status) {
    case "pending":
      return "bg-amber-50 text-amber-800 dark:bg-amber-950/40 dark:text-amber-200";
    case "approved":
    case "hasAccess":
      return "bg-green-50 text-green-800 dark:bg-green-950/40 dark:text-green-200";
    case "rejected":
      return "bg-red-50 text-red-800 dark:bg-red-950/40 dark:text-red-200";
    default:
      return "";
  }
}

/**
 * Checks whether the user is allowed to submit a new application.
 */
export function isApplicationAllowed(
  hasAccess: boolean,
  hasPending: boolean
): boolean {
  return !hasAccess && !hasPending;
}

/* ========== Static Data ========== */

const ADMISSION_NOTES = [
  {
    icon: Users,
    title: "匿名同伴支持空间",
    description: "这是一个安全的匿名交流空间，所有对话均使用随机匿名标识，保护您的隐私。",
  },
  {
    icon: ShieldCheck,
    title: "需要准入审核",
    description: "为保障社区安全，进入心理交流区需要提交申请并通过审核。",
  },
  {
    icon: Eye,
    title: "完全匿名交流",
    description: "所有发帖和对话均为匿名，其他用户无法看到您的真实身份。",
  },
  {
    icon: AlertTriangle,
    title: "非专业医疗服务",
    description: "心理交流区提供的是同伴支持，不替代专业心理咨询或治疗。如需专业帮助，请联系心理援助热线。",
  },
];

const LISTENER_GUIDELINES = [
  { icon: ShieldCheck, text: "尊重隐私：不追问、不记录、不传播对方的个人信息" },
  { icon: Heart, text: "不评判：以接纳和理解的态度倾听，不对倾诉者进行道德评判" },
  { icon: HandHeart, text: "鼓励专业求助：在必要时引导倾诉者寻求专业心理帮助" },
  { icon: AlertTriangle, text: "报告风险：发现严重风险信号时及时上报，保护倾诉者安全" },
];

/* ========== Page Component ========== */

export default function PsychApplyPage() {
  const [loading, setLoading] = useState(false);
  const [status, setStatus] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const handleApply = async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/psych/apply", { method: "POST" });
      if (res.status === 201) {
        setStatus("pending");
      } else if (res.status === 409) {
        const data = await res.json();
        if (data.error?.includes("已拥有")) {
          setStatus("hasAccess");
        } else {
          setStatus("pending");
        }
      } else {
        setError("提交申请失败，请稍后重试");
      }
    } catch {
      setError("网络错误，请检查连接后重试");
    } finally {
      setLoading(false);
    }
  };

  const canApply = isApplicationAllowed(
    status === "hasAccess" || status === "approved",
    status === "pending"
  );

  return (
    <div className="min-h-screen bg-orange-50/40 dark:bg-orange-950/10">
      <div className="mx-auto max-w-2xl px-4 py-8">
        {/* Header */}
        <div className="mb-8 text-center">
          <div className="mx-auto mb-4 flex h-16 w-16 items-center justify-center rounded-full bg-orange-100 dark:bg-orange-900/40">
            <Heart
              className="h-8 w-8 text-orange-600 dark:text-orange-400"
              aria-hidden="true"
            />
          </div>
          <h1 className="text-2xl font-bold text-foreground">
            心理交流区准入申请
          </h1>
          <p className="mt-2 text-sm text-muted-foreground">
            一个安全、温暖的匿名同伴支持空间
          </p>
        </div>

        {/* Status Banner */}
        {status && (
          <div
            role="status"
            className={`mb-6 flex items-center gap-2 rounded-2xl px-4 py-3 text-sm ${getApplicationStatusColor(status)}`}
          >
            {status === "pending" && <Clock className="h-4 w-4 shrink-0" aria-hidden="true" />}
            {(status === "approved" || status === "hasAccess") && (
              <CheckCircle2 className="h-4 w-4 shrink-0" aria-hidden="true" />
            )}
            {status === "rejected" && (
              <AlertTriangle className="h-4 w-4 shrink-0" aria-hidden="true" />
            )}
            <span>{getApplicationStatusText(status)}</span>
          </div>
        )}

        {/* 准入说明 */}
        <Card className="mb-6 border-orange-100 dark:border-orange-900/30">
          <CardHeader>
            <CardTitle className="text-lg">准入说明</CardTitle>
          </CardHeader>
          <CardContent>
            <ul className="space-y-4" role="list">
              {ADMISSION_NOTES.map((note) => {
                const Icon = note.icon;
                return (
                  <li key={note.title} className="flex gap-3">
                    <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-orange-100 dark:bg-orange-900/40">
                      <Icon
                        className="h-4 w-4 text-orange-600 dark:text-orange-400"
                        aria-hidden="true"
                      />
                    </div>
                    <div>
                      <p className="font-medium text-sm text-foreground">
                        {note.title}
                      </p>
                      <p className="text-sm text-muted-foreground">
                        {note.description}
                      </p>
                    </div>
                  </li>
                );
              })}
            </ul>
          </CardContent>
        </Card>

        {/* 倾听者守则摘要 */}
        <Card className="mb-6 border-orange-100 dark:border-orange-900/30">
          <CardHeader>
            <CardTitle className="text-lg">倾听者守则摘要</CardTitle>
          </CardHeader>
          <CardContent>
            <ul className="space-y-3" role="list">
              {LISTENER_GUIDELINES.map((item) => {
                const Icon = item.icon;
                return (
                  <li key={item.text} className="flex items-start gap-3">
                    <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-orange-100 dark:bg-orange-900/40">
                      <Icon
                        className="h-4 w-4 text-orange-600 dark:text-orange-400"
                        aria-hidden="true"
                      />
                    </div>
                    <span className="text-sm text-muted-foreground pt-1">
                      {item.text}
                    </span>
                  </li>
                );
              })}
            </ul>
          </CardContent>
        </Card>

        {/* Crisis Hotline Info */}
        <div className="mb-6 rounded-2xl bg-rose-50 p-4 dark:bg-rose-950/20">
          <div className="flex items-center gap-2 mb-2">
            <Phone className="h-4 w-4 text-rose-600 dark:text-rose-400" aria-hidden="true" />
            <span className="text-sm font-medium text-rose-800 dark:text-rose-200">
              紧急求助资源
            </span>
          </div>
          <p className="text-xs text-rose-700 dark:text-rose-300">
            如需专业帮助，请拨打全国心理援助热线：
            <a
              href="tel:400-161-9995"
              className="ml-1 font-medium underline"
              aria-label="拨打全国心理援助热线 400-161-9995"
            >
              400-161-9995
            </a>
          </p>
        </div>

        {/* Error */}
        {error && (
          <div
            role="alert"
            className="mb-4 rounded-lg bg-red-50 px-4 py-2.5 text-sm text-red-800 dark:bg-red-950/40 dark:text-red-200"
          >
            {error}
          </div>
        )}

        {/* Apply Button */}
        <Button
          className="w-full rounded-2xl bg-orange-600 hover:bg-orange-700 text-white dark:bg-orange-700 dark:hover:bg-orange-600"
          size="lg"
          disabled={!canApply || loading}
          onClick={handleApply}
          aria-label="提交心理交流区准入申请"
        >
          {loading && <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />}
          {loading ? "提交中..." : canApply ? "提交准入申请" : "申请已提交"}
        </Button>
      </div>
    </div>
  );
}
