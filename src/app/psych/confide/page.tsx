"use client";

import Link from "next/link";
import { Headphones, Phone, ArrowLeft } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { PsychLayout, getCrisisHotlines } from "@/components/psych/PsychLayout";

export function validateConfideSummary(summary: string): string {
  const trimmed = summary.trim();
  if (trimmed.length === 0) return "请输入倾诉内容摘要";
  if (trimmed.length < 10) return "倾诉摘要至少需要 10 个字符";
  if (trimmed.length > 500) return "倾诉摘要不能超过 500 个字符";
  return "";
}

export function getConfideStatusText(status: string): string {
  switch (status) {
    case "WAITING": return "等待匹配中，请耐心等待倾听者领取";
    case "MATCHED": return "已匹配到倾听者，即将开始对话";
    case "ACTIVE": return "会话进行中";
    case "CLOSED": return "会话已结束";
    default: return "";
  }
}

export default function PsychConfidePage() {
  const hotlines = getCrisisHotlines();

  return (
    <PsychLayout>
      <div className="mx-auto max-w-2xl px-4 py-8">
        <div className="mb-8 text-center">
          <div className="mx-auto mb-4 flex h-16 w-16 items-center justify-center rounded-full bg-amber-100 dark:bg-amber-900/40">
            <Headphones className="h-8 w-8 text-amber-700 dark:text-amber-300" aria-hidden="true" />
          </div>
          <h1 className="text-2xl font-bold text-foreground">倾诉匹配暂时关闭</h1>
          <p className="mt-2 text-sm text-muted-foreground">
            平台正在完善未成年人安全、隐私保护和倾听者支持流程，目前不接收新的倾诉请求，也不开放等待队列。
          </p>
        </div>

        <Card className="mb-6 border-amber-200 bg-amber-50/60 dark:border-amber-900/50 dark:bg-amber-950/20">
          <CardContent className="space-y-3 p-5 text-sm text-muted-foreground">
            <p>如果你正在经历困难，请优先联系信任的监护人、老师、学校心理教师或其他专业人员。</p>
            <p>如存在即时伤害风险，请立即联系当地紧急服务，不要等待平台匹配。</p>
          </CardContent>
        </Card>

        <Card className="mb-6 border-rose-100 dark:border-rose-900/30">
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-lg">
              <Phone className="h-5 w-5 text-rose-600" aria-hidden="true" />
              专业求助资源
            </CardTitle>
          </CardHeader>
          <CardContent>
            <ul className="space-y-3">
              {hotlines.map((hotline) => (
                <li key={`${hotline.name}-${hotline.number}`} className="flex items-center justify-between rounded-lg border p-3">
                  <span className="text-sm font-medium">{hotline.name}</span>
                  <Button size="sm" variant="destructive" asChild>
                    <a href={`tel:${hotline.number}`}>{hotline.number}</a>
                  </Button>
                </li>
              ))}
            </ul>
          </CardContent>
        </Card>

        <Button variant="outline" asChild>
          <Link href="/psych">
            <ArrowLeft className="mr-2 h-4 w-4" />
            返回心理交流区
          </Link>
        </Button>
      </div>
    </PsychLayout>
  );
}
