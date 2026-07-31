"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useSession } from "next-auth/react";
import {
  AlertTriangle,
  ArrowRight,
  CheckCircle2,
  CircleDot,
  FileText,
  Loader2,
  RefreshCw,
  Repeat2,
  ShieldAlert,
  UsersRound,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  DCR_ADMISSION_STEPS,
  DCR_STEP_CTA,
  DCR_TASK_HALL_CARD,
  DCR_WORKSPACE_CARDS,
  getDcrEntryMode,
  type DcrCurrentStep,
  type DcrProgressDto,
} from "@/components/dcr/dcr-workbench-contract";

const STEP_ORDER: DcrCurrentStep[] = ["PHONE", "QUIZ", "CASE", "REVIEW", "COMPLETE"];
const WORKSPACE_ICONS = { cases: FileText, tasks: UsersRound, cycles: Repeat2 } as const;

function formatDate(value: string): string {
  return new Date(value).toLocaleDateString("zh-CN");
}

function admissionStepState(step: Exclude<DcrCurrentStep, "COMPLETE">, current: DcrCurrentStep) {
  const stepIndex = STEP_ORDER.indexOf(step);
  const currentIndex = STEP_ORDER.indexOf(current);
  return stepIndex < currentIndex ? "done" : stepIndex === currentIndex ? "current" : "locked";
}

export default function DCREntryPage() {
  const { data: session, status: sessionStatus, update } = useSession();
  const sessionAccess = (session?.user as { dcrAccess?: boolean } | undefined)?.dcrAccess === true;
  const [progress, setProgress] = useState<DcrProgressDto | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [reloadKey, setReloadKey] = useState(0);
  const sessionRefreshRequested = useRef(false);

  useEffect(() => {
    let cancelled = false;

    async function loadProgress() {
      setLoading(true);
      setError(null);
      try {
        const response = await fetch("/api/dcr/progress", { cache: "no-store" });
        if (!response.ok) throw new Error("无法获取 DCR 进度");
        const dto = (await response.json()) as DcrProgressDto;
        if (cancelled) return;
        setProgress(dto);

        // Database-backed progress is authoritative. Refresh a stale JWT only
        // after the unified endpoint confirms effective DCR access.
        if (dto.admission.accessGranted && !sessionAccess && !sessionRefreshRequested.current) {
          sessionRefreshRequested.current = true;
          await update();
        }
      } catch (caught) {
        if (!cancelled) {
          setError(caught instanceof Error ? caught.message : "加载失败，请稍后重试");
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    }

    if (sessionStatus === "authenticated") {
      void loadProgress();
    } else if (sessionStatus === "unauthenticated") {
      setLoading(false);
      setError("请先登录后使用 DCR 信息互助服务");
    }

    return () => {
      cancelled = true;
    };
  }, [reloadKey, sessionAccess, sessionStatus, update]);

  const mode = getDcrEntryMode(progress?.admission ?? null, loading, Boolean(error));

  return (
    <div className="min-h-screen bg-slate-50/40 dark:bg-slate-950/10">
      <div className="mx-auto max-w-5xl px-4 py-8">
        <div className="mb-6 rounded-2xl border border-amber-200 bg-amber-50 px-4 py-3 dark:border-amber-800/30 dark:bg-amber-950/20">
          <div className="flex items-start gap-2">
            <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-amber-600" />
            <div className="text-sm text-amber-800 dark:text-amber-200">
              <p className="font-medium">使用须知</p>
              <ul className="mt-1 list-disc space-y-0.5 pl-4 text-xs">
                <li>请勿提交真实姓名、手机号等可识别个人信息</li>
                <li>本模块仅供信息交流与合规参考，不代办、不组织线下活动</li>
                <li>平台不承诺绝对匿名，管理人员仅在审核需要时查看脱敏信息</li>
              </ul>
            </div>
          </div>
        </div>

        <div className="mb-8">
          <h1 className="text-2xl font-bold text-foreground">DCR 工作台</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            {mode === "WORKSPACE"
              ? "集中跟进你的求助、互助任务和互助闭环"
              : "完成一次清晰的四步准入流程，再进入信息互助工作台"}
          </p>
        </div>

        {mode === "LOADING" && (
          <div className="flex items-center justify-center rounded-2xl border bg-background py-20 text-muted-foreground">
            <Loader2 className="mr-2 h-5 w-5 animate-spin" />
            正在加载 DCR 进度…
          </div>
        )}

        {mode === "ERROR" && (
          <div className="rounded-2xl border border-red-200 bg-red-50 p-6 text-center dark:border-red-900/50 dark:bg-red-950/20">
            <AlertTriangle className="mx-auto mb-2 h-8 w-8 text-red-600" />
            <p className="text-sm text-red-800 dark:text-red-200">{error ?? "进度数据暂不可用"}</p>
            {sessionStatus === "authenticated" && (
              <Button className="mt-4" variant="outline" onClick={() => setReloadKey((value) => value + 1)}>
                <RefreshCw className="mr-2 h-4 w-4" />重新加载
              </Button>
            )}
          </div>
        )}

        {mode === "ADMISSION" && progress && (
          <section aria-labelledby="admission-title">
            <div className="mb-4">
              <h2 id="admission-title" className="text-lg font-semibold">四步准入</h2>
              <p className="text-sm text-muted-foreground">所有状态均来自统一进度接口，不以申请通过状态替代实际权限。</p>
            </div>

            <div className="grid gap-3 md:grid-cols-4">
              {DCR_ADMISSION_STEPS.map((step, index) => {
                const state = admissionStepState(step.key, progress.admission.currentStep);
                return (
                  <div
                    key={step.key}
                    className={`rounded-2xl border-2 p-4 ${
                      state === "current"
                        ? "border-blue-300 bg-blue-50/60 dark:border-blue-800 dark:bg-blue-950/20"
                        : state === "done"
                          ? "border-green-200 bg-green-50/40 dark:border-green-900 dark:bg-green-950/10"
                          : "border-slate-200 bg-background opacity-70 dark:border-slate-800"
                    }`}
                  >
                    <div className="mb-3 flex items-center justify-between">
                      <span className="text-xs font-medium text-muted-foreground">步骤 {index + 1}</span>
                      {state === "done" ? (
                        <CheckCircle2 className="h-4 w-4 text-green-600" />
                      ) : (
                        <CircleDot className={`h-4 w-4 ${state === "current" ? "text-blue-600" : "text-slate-400"}`} />
                      )}
                    </div>
                    <h3 className="text-sm font-semibold">{step.title}</h3>
                    <p className="mt-2 text-xs text-muted-foreground">
                      {state === "done" ? "已完成" : state === "current" ? "当前待完成" : "完成前一步后进入"}
                    </p>
                  </div>
                );
              })}
            </div>

            <div className="mt-5 rounded-2xl border bg-background p-5">
              {progress.admission.capabilities.canCreateDcrPost && !progress.admission.accessGranted && (
                <div className="mb-5 rounded-xl border border-blue-200 bg-blue-50/50 p-4 dark:border-blue-900 dark:bg-blue-950/20">
                  <p className="font-medium">邀请码投稿权限已启用</p>
                  <p className="mt-1 text-sm text-muted-foreground">你可以发布 DCR 帖子和提交委托，但互助任务、循环和完整工作台仍需完成正式准入。</p>
                  <div className="mt-3 flex flex-wrap gap-2">
                    <Button asChild><Link href="/create?zone=DCR">发布 DCR 帖子</Link></Button>
                    <Button asChild variant="outline"><Link href="/dcr/delegate">填写委托表</Link></Button>
                  </div>
                </div>
              )}
              {progress.admission.blockers.length > 0 ? (
                <div className="space-y-4">
                  {progress.admission.blockers.map((blocker) => (
                    <div key={blocker.code} className="flex flex-col justify-between gap-3 sm:flex-row sm:items-center">
                      <div>
                        <p className="font-medium">{blocker.message}</p>
                        {blocker.code === "APPLICATION_PENDING" && (
                          <p className="mt-1 text-xs text-muted-foreground">无需重复提交；审核结果会在此处更新。</p>
                        )}
                        {blocker.code === "APPLICATION_CASE_UNLINKED" && (
                          <p className="mt-1 text-xs text-muted-foreground">为避免错绑他人委托，系统不会自动猜测关联关系。</p>
                        )}
                      </div>
                      {blocker.href && blocker.cta && (
                        <Button asChild className="shrink-0">
                          <Link href={blocker.href}>{blocker.cta}<ArrowRight className="ml-2 h-4 w-4" /></Link>
                        </Button>
                      )}
                    </div>
                  ))}
                </div>
              ) : progress.admission.currentStep !== "COMPLETE" ? (
                <Button asChild>
                  <Link href={DCR_STEP_CTA[progress.admission.currentStep].href}>
                    {DCR_STEP_CTA[progress.admission.currentStep].label}<ArrowRight className="ml-2 h-4 w-4" />
                  </Link>
                </Button>
              ) : null}
            </div>
          </section>
        )}

        {mode === "WORKSPACE" && progress && (
          <section aria-labelledby="workspace-title">
            <div className="mb-5 flex items-start gap-3 rounded-2xl border border-green-200 bg-green-50/50 p-4 dark:border-green-900/50 dark:bg-green-950/10">
              <CheckCircle2 className="mt-0.5 h-5 w-5 shrink-0 text-green-600" />
              <div>
                <h2 id="workspace-title" className="font-semibold text-green-900 dark:text-green-200">DCR 准入已完成</h2>
                <p className="mt-1 text-sm text-green-800/80 dark:text-green-300/80">以下仅汇总你自己提交或实际参与的项目。</p>
              </div>
            </div>

            <article className="mb-4 flex flex-col justify-between gap-4 rounded-2xl border border-blue-200 bg-blue-50/40 p-5 sm:flex-row sm:items-center dark:border-blue-900 dark:bg-blue-950/20">
              <div className="flex items-start gap-3">
                <div className="rounded-xl bg-blue-100 p-2.5 text-blue-700 dark:bg-blue-900/50 dark:text-blue-200">
                  <UsersRound className="h-5 w-5" />
                </div>
                <div>
                  <h3 className="font-semibold">{DCR_TASK_HALL_CARD.title}</h3>
                  <p className="mt-1 max-w-2xl text-sm text-muted-foreground">{DCR_TASK_HALL_CARD.description}</p>
                </div>
              </div>
              <Button asChild className="shrink-0">
                <Link href={DCR_TASK_HALL_CARD.href}>{DCR_TASK_HALL_CARD.cta}<ArrowRight className="ml-2 h-4 w-4" /></Link>
              </Button>
            </article>

            <div className="grid gap-4 lg:grid-cols-2">
              {DCR_WORKSPACE_CARDS.map((card) => {
                const section = progress.workspace[card.key];
                const Icon = WORKSPACE_ICONS[card.key];
                return (
                  <article key={card.key} className="flex min-h-[320px] flex-col rounded-2xl border bg-background p-5 shadow-sm">
                    <div className="flex items-start justify-between gap-3">
                      <div className="flex items-center gap-3">
                        <div className="rounded-xl bg-blue-50 p-2.5 text-blue-600 dark:bg-blue-950/30 dark:text-blue-300">
                          <Icon className="h-5 w-5" />
                        </div>
                        <div>
                          <h3 className="font-semibold">{card.title}</h3>
                          <p className="text-xs text-muted-foreground">共 {section.count} 项</p>
                        </div>
                      </div>
                      <span className="rounded-full bg-amber-50 px-2.5 py-1 text-xs font-medium text-amber-700 dark:bg-amber-950/30 dark:text-amber-300">
                        待办 {section.todoCount}
                      </span>
                    </div>
                    <p className="mt-3 text-sm text-muted-foreground">{card.description}</p>

                    <div className="mt-4 flex-1 border-t pt-3">
                      <p className="mb-2 text-xs font-medium text-muted-foreground">最近项目</p>
                      {section.recent.length === 0 ? (
                        <p className="rounded-xl bg-muted/40 px-3 py-4 text-center text-xs text-muted-foreground">暂无相关项目</p>
                      ) : (
                        <ul className="space-y-2">
                          {section.recent.map((item) => (
                            <li key={item.id}>
                              <Link href={item.href} className="block rounded-xl bg-muted/30 px-3 py-2 hover:bg-muted/60">
                                <div className="flex items-center justify-between gap-2">
                                  <span className="truncate text-sm font-medium">{item.title}</span>
                                  <ArrowRight className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
                                </div>
                                <p className="mt-1 text-xs text-muted-foreground">{item.status} · {formatDate(item.updatedAt)}</p>
                              </Link>
                            </li>
                          ))}
                        </ul>
                      )}
                    </div>

                    <Button asChild className="mt-4 w-full" variant="outline">
                      <Link href={card.href}>{card.cta}<ArrowRight className="ml-2 h-4 w-4" /></Link>
                    </Button>
                  </article>
                );
              })}
            </div>
          </section>
        )}

        <div className="mt-8 grid gap-3 sm:grid-cols-2">
          <Button asChild variant="outline"><Link href="/dcr/guide">DCR 使用指南</Link></Button>
          <Button asChild variant="outline"><Link href="/kb">知识库与政策模板</Link></Button>
        </div>

        <div className="mt-6 rounded-lg bg-muted/30 px-4 py-3">
          <div className="flex items-start gap-2">
            <ShieldAlert className="mt-0.5 h-4 w-4 shrink-0 text-muted-foreground" />
            <p className="text-xs leading-relaxed text-muted-foreground">
              本模块仅提供信息交流与合规参考服务，不提供法律建议。所有内容遵循最小化数据原则，AI 生成内容仅供参考。
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}
