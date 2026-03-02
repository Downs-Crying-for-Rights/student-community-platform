"use client";

import { useState } from "react";
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
      title: "倾诉匹配",
      description: "提交倾诉请求，匹配一位倾听者进行一对一匿名对话",
      href: "/psych/confide",
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

  return (
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
        </div>

        {/* Section Cards */}
        <div className="space-y-4 mb-8">
          {sections.map((section) => {
            const Icon = ICON_MAP[section.iconName] ?? Heart;
            const isAnchor = section.href.startsWith("#");

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
                <a key={section.id} href={section.href}>
                  {cardContent}
                </a>
              );
            }

            return (
              <Link key={section.id} href={section.href}>
                {cardContent}
              </Link>
            );
          })}
        </div>

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
                如果你或身边的人正在经历困难，请联系以下专业资源获取帮助。
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
  );
}
