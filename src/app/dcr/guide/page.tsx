"use client";

import Link from "next/link";
import {
  BookOpen,
  FileEdit,
  ShieldCheck,
  AlertTriangle,
  HelpCircle,
  ArrowRight,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { PrivacyBanner } from "@/components/shared/PrivacyBanner";

/* ========== Pure Functions ========== */

export function getGuideSections() {
  return [
    {
      icon: HelpCircle,
      title: "什么是信息互助",
      content:
        "DCR 模块是站内的合规信息互助服务，提供政策信息查询、委托表填写指导和互助匹配服务。\n\n我们不代办、不组织线下活动、不动员、不提供规避监管或逃避责任的方法。",
    },
    {
      icon: FileEdit,
      title: "委托表怎么写",
      content:
        "委托表不需要固定格式，只需在文本框中如实描述学校情况和您的需求。\n\n关键信息包括：学校名称和地址（至少到市区）、年级、补课类型、时间范围、收费情况、举报途径。系统会自动抽取这些信息。\n\n请勿包含真实姓名、教师姓名等可识别个人信息。",
    },
    {
      icon: ShieldCheck,
      title: "隐私注意事项",
      content:
        "所有委托内容默认仅您自己、匹配的互助人和管理人员可见。\n\n提交前系统会自动扫描敏感信息（手机号、身份证、学号等），命中后将提示您删除后再提交。\n\n我们不承诺'绝对匿名'——管理端可在必要时查看脱敏信息用于审核。",
    },
    {
      icon: AlertTriangle,
      title: "常见误区",
      content:
        "× 委托表不是举报信——请以事实描述为主，不要写态度句（如'请通过''给我链接'等）。\n\n× 每次仅限提交一所学校的信息。\n\n× 委托表不能只有链接，需要至少 80 字的文字描述。\n\n× 类型选择'其他'会转入人工审核队列。",
    },
  ];
}

/* ========== Page ========== */

export default function GuidePage() {
  const sections = getGuideSections();

  return (
    <div className="min-h-screen bg-slate-50/40 dark:bg-slate-950/10">
      <div className="mx-auto max-w-2xl px-4 py-8">
        <div className="mb-6">
          <PrivacyBanner message="本模块不提供法律建议，仅供信息交流参考" />
        </div>

        <h1 className="mb-2 text-2xl font-bold text-foreground">新手引导</h1>
        <p className="mb-8 text-sm text-muted-foreground">
          了解 DCR 模块的使用方式和注意事项
        </p>

        <div className="space-y-4">
          {sections.map((section, i) => {
            const Icon = section.icon;
            return (
              <Card key={i}>
                <CardHeader className="pb-2">
                  <CardTitle className="flex items-center gap-2 text-base">
                    <Icon className="h-5 w-5 text-primary" />
                    {section.title}
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <p className="whitespace-pre-line text-sm text-muted-foreground leading-relaxed">
                    {section.content}
                  </p>
                </CardContent>
              </Card>
            );
          })}
        </div>

        <div className="mt-8 flex flex-col gap-3">
          <Button asChild size="lg" className="w-full">
            <Link href="/dcr/delegate">
              开始提交委托表
              <ArrowRight className="ml-2 h-4 w-4" />
            </Link>
          </Button>
          <Button asChild variant="outline" className="w-full">
            <Link href="/kb">浏览知识库与模板</Link>
          </Button>
        </div>

        <p className="mt-6 text-center text-xs text-muted-foreground">
          AI 生成内容仅供参考
        </p>
      </div>
    </div>
  );
}
