"use client";

import Link from "next/link";
import {
  FileEdit,
  BookOpen,
  FolderOpen,
  ShieldAlert,
  ArrowRight,
  AlertTriangle,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { PrivacyBanner } from "@/components/shared/PrivacyBanner";

/* ========== Page ========== */

export default function DCREntryPage() {
  return (
    <div className="min-h-screen bg-slate-50/40 dark:bg-slate-950/10">
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
          合规信息互助服务模块，提供政策参考、委托表审核与互助匹配
        </p>

        {/* 三块卡片 */}
        <div className="grid gap-4">
          {/* 卡片1: 提交委托表 */}
          <Card className="group border-l-4 border-l-primary hover:shadow-md transition-shadow">
            <CardContent className="flex items-center gap-4 p-5">
              <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-xl bg-primary/10">
                <FileEdit className="h-6 w-6 text-primary" />
              </div>
              <div className="flex-1 min-w-0">
                <h2 className="text-base font-semibold text-foreground">提交委托表</h2>
                <p className="text-sm text-muted-foreground">
                  如实描述学校情况和需求，系统自动抽取关键信息
                </p>
              </div>
              <Button asChild variant="ghost" size="sm" className="shrink-0 group-hover:translate-x-0.5 transition-transform">
                <Link href="/dcr/delegate">
                  <ArrowRight className="h-4 w-4" />
                </Link>
              </Button>
            </CardContent>
          </Card>

          {/* 卡片2: 知识库与模板 */}
          <Card className="group border-l-4 border-l-blue-500 hover:shadow-md transition-shadow">
            <CardContent className="flex items-center gap-4 p-5">
              <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-xl bg-blue-500/10">
                <BookOpen className="h-6 w-6 text-blue-500" />
              </div>
              <div className="flex-1 min-w-0">
                <h2 className="text-base font-semibold text-foreground">知识库与模板</h2>
                <p className="text-sm text-muted-foreground">
                  政策法规、合规指引和委托表填写模板
                </p>
              </div>
              <Button asChild variant="ghost" size="sm" className="shrink-0 group-hover:translate-x-0.5 transition-transform">
                <Link href="/kb">
                  <ArrowRight className="h-4 w-4" />
                </Link>
              </Button>
            </CardContent>
          </Card>

          {/* 卡片3: 我的案件 */}
          <Card className="group border-l-4 border-l-green-500 hover:shadow-md transition-shadow">
            <CardContent className="flex items-center gap-4 p-5">
              <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-xl bg-green-500/10">
                <FolderOpen className="h-6 w-6 text-green-500" />
              </div>
              <div className="flex-1 min-w-0">
                <h2 className="text-base font-semibold text-foreground">我的委托表</h2>
                <p className="text-sm text-muted-foreground">
                  查看委托表审核状态、补交材料和案件进度
                </p>
              </div>
              <Button asChild variant="ghost" size="sm" className="shrink-0 group-hover:translate-x-0.5 transition-transform">
                <Link href="/dcr/requests">
                  <ArrowRight className="h-4 w-4" />
                </Link>
              </Button>
            </CardContent>
          </Card>
        </div>

        {/* 底部引导 */}
        <div className="mt-8 flex flex-col gap-3">
          <Button asChild variant="outline" size="sm" className="w-full">
            <Link href="/dcr/guide">新手引导：了解如何使用 DCR 模块</Link>
          </Button>
          <Button asChild variant="outline" size="sm" className="w-full">
            <Link href="/dcr/tickets">查看我的工单案件</Link>
          </Button>
        </div>

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
