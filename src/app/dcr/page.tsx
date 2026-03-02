"use client";

import { useEffect, useState } from "react";
import { useSession } from "next-auth/react";
import { useRouter } from "next/navigation";
import {
  Lock,
  Loader2,
  FileEdit,
  Clock,
  BookOpen,
  Users,
  CheckCircle2,
  XCircle,
  ArrowRight,
  Scale,
  ShieldCheck,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { PrivacyBanner } from "@/components/shared/PrivacyBanner";
import { WizardStepper } from "@/components/dcr/WizardStepper";
import type { WizardStep } from "@/components/dcr/WizardStepper";
import { computeFlowStep } from "@/lib/dcr-flow-helpers";

/* ========== Pure Functions (exported for testing) ========== */

export interface DCRRequirement {
  title: string;
  description: string;
}

/**
 * Returns the list of DCR zone admission requirements.
 */
export function getDCRRequirements(): DCRRequirement[] {
  return [
    {
      title: "账号年龄 ≥ 7 天",
      description: "注册满 7 天的用户方可申请进入私密区",
    },
    {
      title: "违规记录 < 3 次",
      description: "近期违规次数不超过 3 次",
    },
    {
      title: "信誉等级 ≥ 60",
      description: "信誉分达到 60 分以上",
    },
    {
      title: "签署守则声明",
      description: "需签署私密区守则声明，确认了解平台合规要求",
    },
  ];
}

/**
 * Returns the list of DCR compliance statements.
 */
export function getDCRComplianceStatements(): string[] {
  return [
    "平台不组织、不指挥、不实施任何举报或对抗行动",
    "平台不提供法律建议，仅提供信息互助与合规渠道说明",
    "遵循最小化数据原则，不收集不必要的敏感信息",
    "所有工单内容须经脱敏处理，禁止包含可识别个人信息",
    "平台保留对违规内容进行审核和处理的权利",
  ];
}

/**
 * Returns the DCR zone description text.
 */
export function getDCRDescription(): string {
  return "DCR 私密区是一个权益信息互助与合规工单流转空间。在这里，您可以通过结构化表单提交互助请求，由经过审核的 DCR 协助者进行一对一跟进。所有信息均经过脱敏处理，确保隐私安全。";
}

/* ========== Flow Steps ========== */

export const FLOW_STEPS: WizardStep[] = [
  { label: "填写委托表" },
  { label: "审核" },
  { label: "考核" },
  { label: "加入互助队伍" },
];

/* ========== Page Component ========== */

interface CaseData {
  id: string;
  status: string;
  rejectionReason?: string;
}

export default function DCREntryPage() {
  const { data: session } = useSession();
  const router = useRouter();
  const [loading, setLoading] = useState(true);
  const [quizPassed, setQuizPassed] = useState(false);
  const [dcrAccess, setDcrAccess] = useState(false);
  const [latestCase, setLatestCase] = useState<CaseData | null>(null);
  const [joining, setJoining] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const userId = (session?.user as { id?: string } | undefined)?.id;

  useEffect(() => {
    if (!userId) {
      setLoading(false);
      return;
    }

    let cancelled = false;

    async function fetchData() {
      try {
        const [userRes, casesRes] = await Promise.all([
          fetch(`/api/users/${userId}`),
          fetch("/api/cases?pageSize=1"),
        ]);

        if (cancelled) return;

        if (userRes.ok) {
          const userData = await userRes.json();
          setQuizPassed(userData.user?.quizPassed ?? false);
          setDcrAccess(userData.user?.dcrAccess ?? false);
        }

        if (casesRes.ok) {
          const casesData = await casesRes.json();
          const cases = casesData.cases ?? casesData.data ?? [];
          if (cases.length > 0) {
            setLatestCase({
              id: cases[0].id,
              status: cases[0].status,
              rejectionReason: cases[0].rejectionReason,
            });
          }
        }
      } catch {
        // ignore fetch errors during init
      } finally {
        if (!cancelled) setLoading(false);
      }
    }

    fetchData();
    return () => { cancelled = true; };
  }, [userId]);

  const caseStatus = latestCase?.status ?? null;
  const flowStep = computeFlowStep(caseStatus, quizPassed, dcrAccess);
  const currentStepIndex = flowStep - 1; // 0-indexed for WizardStepper

  const complianceStatements = getDCRComplianceStatements();

  const handleJoin = async () => {
    setJoining(true);
    setError(null);
    try {
      const res = await fetch("/api/dcr/join", { method: "POST" });
      if (res.ok) {
        setDcrAccess(true);
      } else {
        const data = await res.json().catch(() => ({}));
        setError(data.error ?? "加入失败，请稍后重试");
      }
    } catch {
      setError("网络错误，请检查连接后重试");
    } finally {
      setJoining(false);
    }
  };

  const isRejected = caseStatus === "CLOSED" && latestCase?.rejectionReason;

  return (
    <div className="min-h-screen bg-slate-50/40 dark:bg-slate-950/10">
      <div className="mx-auto max-w-2xl px-4 py-8">
        {/* Privacy Banner */}
        <div className="mb-6">
          <PrivacyBanner />
        </div>

        {/* Header */}
        <div className="mb-8 text-center">
          <div className="mx-auto mb-4 flex h-16 w-16 items-center justify-center rounded-full bg-slate-100 dark:bg-slate-800/60">
            <Lock
              className="h-8 w-8 text-slate-600 dark:text-slate-400"
              aria-hidden="true"
            />
          </div>
          <h1 className="text-2xl font-bold text-foreground">DCR 私密区</h1>
          <p className="mt-2 text-sm text-muted-foreground">
            权益信息互助与合规工单流转
          </p>
        </div>

        {/* Loading State */}
        {loading ? (
          <div className="flex items-center justify-center py-12">
            <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" aria-hidden="true" />
            <span className="ml-2 text-sm text-muted-foreground">加载中...</span>
          </div>
        ) : (
          <>
            {/* Wizard Stepper */}
            <div className="mb-8">
              <WizardStepper steps={FLOW_STEPS} currentStep={currentStepIndex} />
            </div>

            {/* Step Cards */}
            <div className="space-y-4 mb-8">
              {/* Step 1: 填写委托表 */}
              {flowStep === 1 && (
                <Card>
                  <CardContent className="flex items-center gap-4 py-6">
                    <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-primary/10 text-primary">
                      <FileEdit className="h-5 w-5" aria-hidden="true" />
                    </div>
                    <div className="flex-1">
                      <p className="font-medium text-foreground">步骤 1：填写委托表</p>
                      <p className="text-sm text-muted-foreground">
                        填写结构化委托表，提交您的互助请求
                      </p>
                    </div>
                    <Button onClick={() => router.push("/dcr/delegate")}>
                      开始填写
                      <ArrowRight className="ml-1 h-4 w-4" aria-hidden="true" />
                    </Button>
                  </CardContent>
                </Card>
              )}

              {/* Step 2: 审核 */}
              {flowStep === 2 && (
                <Card>
                  <CardContent className="flex items-center gap-4 py-6">
                    <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-amber-100 text-amber-600 dark:bg-amber-950/40 dark:text-amber-400">
                      <Clock className="h-5 w-5" aria-hidden="true" />
                    </div>
                    <div className="flex-1">
                      <p className="font-medium text-foreground">步骤 2：等待审核</p>
                      <p className="text-sm text-muted-foreground">
                        您的委托表已提交，正在等待管理员审核
                      </p>
                    </div>
                  </CardContent>
                </Card>
              )}

              {/* Rejection notice */}
              {isRejected && (
                <Card className="border-red-200 dark:border-red-800">
                  <CardContent className="flex items-center gap-4 py-6">
                    <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-red-100 text-red-600 dark:bg-red-950/40 dark:text-red-400">
                      <XCircle className="h-5 w-5" aria-hidden="true" />
                    </div>
                    <div className="flex-1">
                      <p className="font-medium text-red-700 dark:text-red-300">审核未通过</p>
                      <p className="text-sm text-red-600 dark:text-red-400">
                        拒绝原因：{latestCase?.rejectionReason}
                      </p>
                    </div>
                    <Button
                      variant="outline"
                      onClick={() => router.push("/dcr/delegate")}
                    >
                      重新提交
                    </Button>
                  </CardContent>
                </Card>
              )}

              {/* Step 3: 考核 */}
              {flowStep === 3 && (
                <Card>
                  <CardContent className="flex items-center gap-4 py-6">
                    <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-blue-100 text-blue-600 dark:bg-blue-950/40 dark:text-blue-400">
                      <BookOpen className="h-5 w-5" aria-hidden="true" />
                    </div>
                    <div className="flex-1">
                      <p className="font-medium text-foreground">步骤 3：参加考核</p>
                      <p className="text-sm text-muted-foreground">
                        学习教程并完成考核测试
                      </p>
                    </div>
                    <Button onClick={() => router.push("/dcr/quiz")}>
                      开始考核
                      <ArrowRight className="ml-1 h-4 w-4" aria-hidden="true" />
                    </Button>
                  </CardContent>
                </Card>
              )}

              {/* Step 4: 加入互助队伍 */}
              {flowStep === 4 && !dcrAccess && (
                <Card>
                  <CardContent className="flex items-center gap-4 py-6">
                    <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-green-100 text-green-600 dark:bg-green-950/40 dark:text-green-400">
                      <Users className="h-5 w-5" aria-hidden="true" />
                    </div>
                    <div className="flex-1">
                      <p className="font-medium text-foreground">步骤 4：加入互助队伍</p>
                      <p className="text-sm text-muted-foreground">
                        考核已通过，点击加入互助队伍
                      </p>
                    </div>
                    <Button onClick={handleJoin} disabled={joining}>
                      {joining && <Loader2 className="mr-1 h-4 w-4 animate-spin" aria-hidden="true" />}
                      加入互助队伍
                    </Button>
                  </CardContent>
                </Card>
              )}

              {/* Already joined - show entry to DCR area */}
              {flowStep === 4 && dcrAccess && (
                <Card className="border-green-200 dark:border-green-800">
                  <CardContent className="flex items-center gap-4 py-6">
                    <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-green-100 text-green-600 dark:bg-green-950/40 dark:text-green-400">
                      <CheckCircle2 className="h-5 w-5" aria-hidden="true" />
                    </div>
                    <div className="flex-1">
                      <p className="font-medium text-green-700 dark:text-green-300">
                        已加入互助队伍
                      </p>
                      <p className="text-sm text-muted-foreground">
                        您已成功加入 DCR 互助队伍
                      </p>
                    </div>
                    <Button onClick={() => router.push("/dcr/tickets")}>
                      进入互助区
                      <ArrowRight className="ml-1 h-4 w-4" aria-hidden="true" />
                    </Button>
                  </CardContent>
                </Card>
              )}
            </div>

            {/* Error */}
            {error && (
              <div
                role="alert"
                className="mb-6 rounded-lg bg-red-50 px-4 py-2.5 text-sm text-red-800 dark:bg-red-950/40 dark:text-red-200"
              >
                {error}
              </div>
            )}

            {/* 合规声明 */}
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2 text-lg">
                  <Scale className="h-5 w-5" aria-hidden="true" />
                  合规声明
                </CardTitle>
              </CardHeader>
              <CardContent>
                <ul className="space-y-3" role="list">
                  {complianceStatements.map((statement) => (
                    <li
                      key={statement}
                      className="flex items-start gap-2 text-sm text-muted-foreground"
                    >
                      <ShieldCheck
                        className="mt-0.5 h-4 w-4 shrink-0 text-slate-500"
                        aria-hidden="true"
                      />
                      <span>{statement}</span>
                    </li>
                  ))}
                </ul>
              </CardContent>
            </Card>
          </>
        )}
      </div>
    </div>
  );
}
