"use client";

import { useState, useEffect } from "react";
import Link from "next/link";
import { useSession } from "next-auth/react";
import {
  FileEdit,
  ClipboardCheck,
  GraduationCap,
  MessageSquareText,
  ArrowRight,
  AlertTriangle,
  ShieldAlert,
  CheckCircle2,
  Clock,
  Lock,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { hasEffectiveDcrAccess } from "@/lib/dcr-access-status";

/* ========== Types ========== */

interface DCRProgress {
  hasSubmitted: boolean;
  hasApproved: boolean;
  dcrAccess: boolean;
}

interface ApplicationStatus {
  id?: string;
  status: "PENDING" | "APPROVED" | "REJECTED" | "NONE";
  reviewNote?: string | null;
  reviewedAt?: string | null;
}

/* ========== Step Config ========== */

interface StepConfig {
  icon: typeof FileEdit;
  title: string;
  description: string;
  buttonText: string;
  buttonHref: string;
  lockedText?: string;
}

function getSteps(progress: DCRProgress): (StepConfig & { status: "done" | "current" | "locked" })[] {
  // 3-step flow: 提交 → 审核 → 交流
  const currentStep = progress.hasApproved
    ? 3
    : progress.hasSubmitted
      ? 2
      : 1;

  const allSteps: StepConfig[] = [
    {
      icon: FileEdit,
      title: "① 提交委托表",
      description: "通过委托表生成器填写学校信息、行为描述与诉求，并签署自愿自主声明。",
      buttonText: "填写委托表",
      buttonHref: "/dcr/delegate",
    },
    {
      icon: ClipboardCheck,
      title: "② 管理员审核",
      description: "管理员检查委托表信息是否完整、真实、合规，审核通过后进入下一阶段。",
      buttonText: "查看审核状态",
      buttonHref: "/dcr/requests",
      lockedText: "请先提交委托表",
    },
    {
      icon: MessageSquareText,
      title: "③ 信息参考与交流",
      description: "在社区内进行经验分享、政策学习和互助交流，获取信息层面的参考与风险提示。",
      buttonText: "进入互助任务",
      buttonHref: "/dcr/tasks",
      lockedText: "审核通过后可进入",
    },
  ];

  return allSteps.map((step, i) => ({
    ...step,
    status: i + 1 < currentStep ? "done" : i + 1 === currentStep ? "current" : "locked",
  }));
}

/* ========== Status Badge ========== */

function StepStatusBadge({ status }: { status: "done" | "current" | "locked" }) {
  if (status === "done") {
    return (
      <span className="inline-flex items-center gap-1 rounded-full bg-green-100 px-2 py-0.5 text-xs font-medium text-green-700 dark:bg-green-950/40 dark:text-green-300">
        <CheckCircle2 className="h-3 w-3" />
        已完成
      </span>
    );
  }
  if (status === "current") {
    return (
      <span className="inline-flex items-center gap-1 rounded-full bg-blue-100 px-2 py-0.5 text-xs font-medium text-blue-700 dark:bg-blue-950/40 dark:text-blue-300">
        <Clock className="h-3 w-3" />
        进行中
      </span>
    );
  }
  return (
    <span className="inline-flex items-center gap-1 rounded-full bg-slate-100 px-2 py-0.5 text-xs text-slate-500 dark:bg-slate-800/40 dark:text-slate-400">
      <Lock className="h-3 w-3" />
      未解锁
    </span>
  );
}

/* ========== Page ========== */

export default function DCREntryPage() {
  const { data: session, status: sessionStatus, update } = useSession();
  const hasDcrAccess = (session?.user as any)?.dcrAccess === true;
  const [progress, setProgress] = useState<DCRProgress>({
    hasSubmitted: false,
    hasApproved: false,
    dcrAccess: false,
  });
  const [appStatus, setAppStatus] = useState<ApplicationStatus>({ status: "NONE" });
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;

    async function loadCurrentStatus() {
      try {
        const [progressRes, applicationRes] = await Promise.all([
          fetch("/api/dcr/progress", { cache: "no-store" }),
          fetch("/api/dcr/application-status", { cache: "no-store" }),
        ]);

        let nextProgress: DCRProgress | null = null;
        if (progressRes.ok) {
          const data = await progressRes.json();
          nextProgress = data.progress;
          if (!cancelled) setProgress(data.progress);
        }
        if (applicationRes.ok) {
          const data = await applicationRes.json();
          if (!cancelled) setAppStatus(data);
        }

        // Admin approval updates the database immediately, while the JWT in
        // the browser may still contain dcrAccess=false. Refresh it once the
        // real-time progress endpoint confirms access was granted.
        if (nextProgress?.dcrAccess && !hasDcrAccess) {
          await update();
        }
      } catch {
        // Keep the last known state and allow a later navigation to retry.
      } finally {
        if (!cancelled) setLoading(false);
      }
    }

    if (sessionStatus === "authenticated") {
      setLoading(true);
      loadCurrentStatus();
    } else if (sessionStatus === "unauthenticated") {
      setLoading(false);
    }

    return () => { cancelled = true; };
  }, [sessionStatus, hasDcrAccess, update]);

  const effectiveDcrAccess = hasEffectiveDcrAccess(
    hasDcrAccess,
    progress.dcrAccess,
    appStatus.status,
  );
  const steps = getSteps(progress);

  return (
    <div className="bg-slate-50/40 dark:bg-slate-950/10 min-h-screen">
      <div className="mx-auto max-w-2xl px-4 py-8">
        {/* 风险提示条 */}
        <div className="mb-6 rounded-2xl border border-amber-200 bg-amber-50 px-4 py-3 dark:border-amber-800/30 dark:bg-amber-950/20">
          <div className="flex items-start gap-2">
            <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-amber-600" />
            <div className="text-sm text-amber-800 dark:text-amber-200">
              <p className="font-medium">使用须知</p>
              <ul className="mt-1 list-disc pl-4 space-y-0.5 text-xs">
                <li>请勿在委托表中包含真实姓名、手机号等可识别个人信息</li>
                <li>本模块仅供信息交流与合规参考，不代办、不组织线下活动</li>
                <li>平台不承诺绝对匿名——管理人员可在审核需要时查看脱敏信息</li>
              </ul>
            </div>
          </div>
        </div>

        <h1 className="mb-1 text-2xl font-bold text-foreground">DCR 信息互助</h1>
        <p className="mb-8 text-sm text-muted-foreground">
          {effectiveDcrAccess
            ? "DCR 入频审核已通过，可以使用信息互助服务"
            : "合规信息互助服务模块，先通过入频测试获取访问权限"}
        </p>

        {!loading && effectiveDcrAccess && (
          <div className="mb-8 rounded-2xl border-2 border-green-300 bg-green-50/60 p-6 text-center shadow-md dark:border-green-700/50 dark:bg-green-950/20">
            <CheckCircle2 className="mx-auto mb-3 h-11 w-11 text-green-600 dark:text-green-400" />
            <h2 className="mb-2 text-lg font-semibold text-green-800 dark:text-green-300">
              DCR 入频审核已通过
            </h2>
            <p className="text-sm text-green-700/90 dark:text-green-300/90">
              你已获得 DCR 专区访问权限，可继续查看审核通过的委托、参与信息互助和任务交流。
            </p>
            {appStatus.reviewedAt && (
              <p className="mt-2 text-xs text-muted-foreground">
                审核时间：{new Date(appStatus.reviewedAt).toLocaleString("zh-CN")}
              </p>
            )}
          </div>
        )}

        {/* Gate: no dcrAccess → different states */}
        {!loading && !effectiveDcrAccess && (
          <>
          {appStatus.status === "PENDING" ? (
            /* Delegate submitted, awaiting admin review */
            <div className="mb-8 rounded-2xl border-2 border-amber-300 bg-amber-50/50 p-6 text-center shadow-md dark:border-amber-700/50 dark:bg-amber-950/20">
              <Clock className="mx-auto mb-3 h-10 w-10 text-amber-600 dark:text-amber-400" />
              <h2 className="mb-2 text-lg font-semibold">等待审核</h2>
              <p className="mb-1 text-sm text-muted-foreground">
                你的委托表已提交，正在等待管理员审核。
              </p>
              <p className="mb-3 text-sm text-muted-foreground">
                审核通过后将自动开通 DCR 专区访问权限。
              </p>
              <div className="flex items-center justify-center gap-2 text-xs text-muted-foreground">
                <div className="flex gap-1.5">
                  <span className="flex h-6 w-6 items-center justify-center rounded-full bg-green-100 text-xs text-green-700">✓</span>
                  <span className="self-center">考核</span>
                </div>
                <span>→</span>
                <div className="flex gap-1.5">
                  <span className="flex h-6 w-6 items-center justify-center rounded-full bg-green-100 text-xs text-green-700">✓</span>
                  <span className="self-center">委托表</span>
                </div>
                <span>→</span>
                <div className="flex gap-1.5">
                  <span className="flex h-6 w-6 items-center justify-center rounded-full bg-amber-100 text-xs text-amber-700 animate-pulse">…</span>
                  <span className="self-center font-medium text-amber-700">审核中</span>
                </div>
              </div>
            </div>
          ) : appStatus.status === "REJECTED" ? (
            /* Application rejected */
            <div className="mb-8 rounded-2xl border-2 border-red-300 bg-red-50/50 p-6 text-center shadow-md dark:border-red-700/50 dark:bg-red-950/20">
              <AlertTriangle className="mx-auto mb-3 h-10 w-10 text-red-600 dark:text-red-400" />
              <h2 className="mb-2 text-lg font-semibold text-red-700 dark:text-red-400">审核被驳回</h2>
              {appStatus.reviewNote && (
                <p className="mb-3 text-sm font-medium text-red-700 dark:text-red-300">
                  驳回原因：{appStatus.reviewNote}
                </p>
              )}
              <p className="mb-4 text-xs text-muted-foreground">
                如有疑问请联系管理员。你可以重新提交委托表。
              </p>
              <Button asChild size="lg">
                <Link href="/dcr/delegate">
                  重新提交委托表
                  <ArrowRight className="ml-2 h-4 w-4" />
                </Link>
              </Button>
            </div>
          ) : (
            /* No application yet — prompt to start */
            <div className="mb-8 rounded-2xl border-2 border-blue-300 bg-blue-50/50 p-6 text-center shadow-md dark:border-blue-700/50 dark:bg-blue-950/20">
              <GraduationCap className="mx-auto mb-3 h-10 w-10 text-blue-600 dark:text-blue-400" />
              <h2 className="mb-2 text-lg font-semibold">申请 DCR 访问权限</h2>
              <p className="mb-4 text-sm text-muted-foreground">
                你需要完成以下步骤来申请 DCR 专区的访问权限：
              </p>
              <div className="mb-4 flex items-center justify-center gap-2 text-xs text-muted-foreground">
                <span className="rounded-full bg-blue-100 px-2 py-1 text-blue-700">① 入频考核</span>
                <span>→</span>
                <span className="rounded-full bg-slate-100 px-2 py-1">② 填写委托表</span>
                <span>→</span>
                <span className="rounded-full bg-slate-100 px-2 py-1">③ 管理员审核</span>
              </div>
              <Button asChild size="lg">
                <Link href="/dcr/quiz">
                  开始入频考核
                  <ArrowRight className="ml-2 h-4 w-4" />
                </Link>
              </Button>
            </div>
          )}
          </>
        )}

        {/* 四步流程 — only visible to users with dcrAccess */}
        {!loading && effectiveDcrAccess && (
        <>
        <div className="space-y-3">
          {steps.map((step, i) => {
            const Icon = step.icon;
            const isLocked = step.status === "locked";
            const isCurrent = step.status === "current";
            const isDone = step.status === "done";

            return (
              <div
                key={i}
                className={`rounded-2xl border-2 p-5 transition-all ${
                  isCurrent
                    ? "border-blue-300 bg-blue-50/50 shadow-md dark:border-blue-700/50 dark:bg-blue-950/20"
                    : isDone
                      ? "border-green-200 bg-green-50/30 dark:border-green-800/30 dark:bg-green-950/10"
                      : "border-slate-200 bg-white dark:border-slate-700/50 dark:bg-slate-900/50"
                } ${isLocked ? "opacity-70" : ""}`}
              >
                <div className="flex items-start gap-4">
                  {/* Icon */}
                  <div
                    className={`flex h-11 w-11 shrink-0 items-center justify-center rounded-xl ${
                      isDone
                        ? "bg-green-100 text-green-600 dark:bg-green-950/40 dark:text-green-400"
                        : isCurrent
                          ? "bg-blue-100 text-blue-600 dark:bg-blue-950/40 dark:text-blue-400"
                          : "bg-slate-100 text-slate-400 dark:bg-slate-800/60 dark:text-slate-500"
                    }`}
                  >
                    {isDone ? <CheckCircle2 className="h-5 w-5" /> : <Icon className="h-5 w-5" />}
                  </div>

                  {/* Content */}
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 mb-1">
                      <h3 className={`text-sm font-semibold ${isLocked ? "text-muted-foreground" : "text-foreground"}`}>
                        {step.title}
                      </h3>
                      <StepStatusBadge status={step.status} />
                    </div>
                    <p className="text-xs text-muted-foreground leading-relaxed mb-3">
                      {isLocked && step.lockedText ? step.lockedText : step.description}
                    </p>
                    {!isLocked && (
                      <Button asChild size="sm" variant={isCurrent ? "default" : "outline"}>
                        <Link href={step.buttonHref}>
                          {step.buttonText}
                          <ArrowRight className="ml-1.5 h-3.5 w-3.5" />
                        </Link>
                      </Button>
                    )}
                    {isDone && (
                      <Button asChild size="sm" variant="ghost" className="text-green-600 dark:text-green-400">
                        <Link href={step.buttonHref}>
                          回顾
                          <ArrowRight className="ml-1.5 h-3.5 w-3.5" />
                        </Link>
                      </Button>
                    )}
                  </div>
                </div>
              </div>
            );
          })}
        </div>

        {/* 底部引导 */}
        <div className="mt-8 flex flex-col gap-3">
          <Button asChild variant="outline" size="sm" className="w-full">
            <Link href="/dcr/guide">新手引导：了解如何使用 DCR 模块</Link>
          </Button>
          <Button asChild variant="outline" size="sm" className="w-full">
            <Link href="/kb">浏览知识库与政策模板</Link>
          </Button>
          <Button asChild variant="outline" size="sm" className="w-full">
            <Link href="/dcr/posts">查看并发布关联工单的 DCR 帖子</Link>
          </Button>
          <Button asChild variant="outline" size="sm" className="w-full">
            <Link href="/dcr/cycles">创建双方或三方互助闭环</Link>
          </Button>
        </div>
        </>
        )}

        {/* 页面底部 */}
        <div className="mt-8 rounded-lg bg-muted/30 px-4 py-3">
          <div className="flex items-start gap-2">
            <ShieldAlert className="mt-0.5 h-4 w-4 shrink-0 text-muted-foreground" />
            <p className="text-xs text-muted-foreground leading-relaxed">
              本模块仅提供信息交流与合规参考服务，不提供法律建议。所有内容均经过脱敏处理，遵循最小化数据原则。
              <br />
              AI 生成内容仅供参考。
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}
