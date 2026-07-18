"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import {
  Heart,
  MessageCircleHeart,
  Users,
  Phone,
  TreePine,
  Headphones,
  BookOpen,
} from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { PsychLayout, getCrisisHotlines } from "@/components/psych/PsychLayout";

/* ========== Pure Helper Functions (exported for testing) ========== */

export interface PsychSection {
  id: string;
  title: string;
  description: string;
  href: string;
  iconName: string;
}

/**
 * Returns the list of sections displayed on the psychology zone main page.
 */
export function getPsychSections(): PsychSection[] {
  return [
    {
      id: "tree-hole",
      title: "匿名树洞",
      description: "在安全的匿名空间中自由表达，所有发言均使用随机匿名标识",
      href: "/psych/posts",
      iconName: "TreePine",
    },
    {
      id: "confide",
      title: "倾诉匹配（暂停）",
      description: "该功能正在进行安全与隐私流程完善，暂不接收新的匹配请求",
      href: "#confide-paused",
      iconName: "Headphones",
    },
    {
      id: "resources",
      title: "求助资源",
      description: "查看紧急求助热线和专业心理援助资源",
      href: "#resources",
      iconName: "BookOpen",
    },
  ];
}

/**
 * Returns the welcome message for the psychology zone.
 */
export function getPsychWelcomeMessage(): string {
  return "这里是一个温暖、安全的同伴支持空间。你可以匿名倾诉、寻求倾听，或查看求助资源。";
}

export function getPsychEntryAction(progress: unknown): { label: string; href: string } {
  const data = progress as { accessGranted?: boolean; application?: { status?: string } } | null;
  if (data?.accessGranted) return { label: "进入心理区", href: "/psych/posts" };
  if (data?.application?.status === "PENDING") return { label: "查看申请状态", href: "/apply" };
  return { label: "申请加入心理区", href: "/apply" };
}

/* ========== Icon Mapping ========== */

const ICON_MAP: Record<string, React.ComponentType<{ className?: string }>> = {
  TreePine,
  Headphones,
  BookOpen,
};

/* ========== Page Component ========== */

export default function PsychMainPage() {
  const sections = getPsychSections();
  const hotlines = getCrisisHotlines();
  const [progress, setProgress] = useState<unknown>(null);
  useEffect(() => {
    fetch("/api/psych/progress", { cache: "no-store" })
      .then((response) => response.ok ? response.json() : null)
      .then(setProgress)
      .catch(() => setProgress(null));
  }, []);
  const entryAction = getPsychEntryAction(progress);

  return (
    <div className="min-h-screen bg-background">
      <PsychLayout>
        <div className="mx-auto max-w-2xl px-4 py-8">
        {/* Header */}
        <div className="mb-8 text-center">
          <div className="mx-auto mb-4 flex h-16 w-16 items-center justify-center rounded-full bg-orange-100 dark:bg-orange-900/40">
            <Heart
              className="h-8 w-8 text-orange-600 dark:text-orange-400"
              aria-hidden="true"
            />
          </div>
          <h1 className="text-2xl font-bold text-foreground">心理交流区</h1>
          <p className="mt-2 text-sm text-muted-foreground">
            {getPsychWelcomeMessage()}
          </p>
          <Button asChild className="mt-4 rounded-full bg-orange-600 text-white hover:bg-orange-700">
            <Link href={entryAction.href}>{entryAction.label}</Link>
          </Button>
        </div>

        {/* Section Cards */}
        <div className="space-y-4 mb-8">
          {sections.map((section) => {
            const Icon = ICON_MAP[section.iconName] ?? Heart;
            const href = section.id === "tree-hole" ? entryAction.href : section.href;
            const isAnchor = href.startsWith("#");

            const cardContent = (
              <Card
                className="border-orange-100 transition-shadow hover:shadow-md dark:border-orange-900/30 cursor-pointer"
              >
                <CardContent className="flex items-center gap-4 p-4">
                  <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-full bg-orange-100 dark:bg-orange-900/40">
                    <Icon
                      className="h-6 w-6 text-orange-600 dark:text-orange-400"
                      aria-hidden="true"
                    />
                  </div>
                  <div className="min-w-0">
                    <h2 className="font-semibold text-foreground">
                      {section.title}
                    </h2>
                    <p className="text-sm text-muted-foreground">
                      {section.description}
                    </p>
                  </div>
                </CardContent>
              </Card>
            );

            if (isAnchor) {
              return (
                <a key={section.id} href={href}>
                  {cardContent}
                </a>
              );
            }

            return (
              <Link key={section.id} href={href}>
                {cardContent}
              </Link>
            );
          })}
        </div>

        <Card id="confide-paused" className="mb-8 border-amber-200 bg-amber-50/60 dark:border-amber-900/50 dark:bg-amber-950/20">
          <CardContent className="p-4 text-sm text-muted-foreground">
            倾诉匹配暂时关闭。平台不会创建新的匿名匹配或聊天；如有紧急情况，请优先联系监护人、学校专业人员或下方专业求助资源。
          </CardContent>
        </Card>

        {/* Crisis Resources Section */}
        <div id="resources">
          <Card className="border-rose-100 dark:border-rose-900/30">
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-lg">
                <Phone
                  className="h-5 w-5 text-rose-600 dark:text-rose-400"
                  aria-hidden="true"
                />
                紧急求助资源
              </CardTitle>
            </CardHeader>
            <CardContent>
              <p className="mb-4 text-sm text-muted-foreground">
                 平台不是紧急服务，也不替代专业医疗帮助。请避免分享任何个人身份信息；紧急危险请拨打 110 或 120。
              </p>
              <ul className="space-y-3" role="list">
                {hotlines.map((hotline) => (
                  <li
                    key={`${hotline.name}-${hotline.number}`}
                    className="flex items-center justify-between rounded-lg border border-rose-100 p-3 dark:border-rose-900/30"
                  >
                    <span className="text-sm font-medium text-foreground">
                      {hotline.name}
                    </span>
                    <Button
                      size="sm"
                      variant="destructive"
                      className="ml-3 shrink-0 gap-1"
                      asChild
                    >
                      <a
                        href={`tel:${hotline.number}`}
                        aria-label={`拨打 ${hotline.name} ${hotline.number}`}
                      >
                        <Phone className="h-3.5 w-3.5" />
                        {hotline.number}
                      </a>
                    </Button>
                  </li>
                ))}
              </ul>
            </CardContent>
          </Card>
        </div>
        </div>
      </PsychLayout>
    </div>
  );
}
