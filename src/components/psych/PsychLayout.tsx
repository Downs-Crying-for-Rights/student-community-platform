"use client";

import { useState } from "react";
import { Phone, Heart } from "lucide-react";
import { Button } from "@/components/ui/button";
import { PrivacyBanner } from "@/components/shared/PrivacyBanner";
import { CrisisAlert } from "@/components/shared/CrisisAlert";
import { cn } from "@/lib/utils";

/* ========== Pure Helper Functions (exported for testing) ========== */

export interface CrisisHotline {
  name: string;
  number: string;
}

/**
 * Returns the list of crisis hotlines for the psychology zone.
 */
export function getCrisisHotlines(): CrisisHotline[] {
  return [
    { name: "全国心理援助热线", number: "400-161-9995" },
    { name: "北京心理危机研究与干预中心", number: "010-82951332" },
    { name: "希望 24 热线", number: "400-161-9995" },
    { name: "生命热线", number: "400-821-1215" },
  ];
}

/**
 * Returns the safety banner text displayed at the top of all psychology zone pages.
 */
export function getSafetyBannerText(): string {
  return "这是一个安全的同伴支持空间。如需专业帮助，请联系可信成人或拨打心理援助热线";
}

/**
 * Checks whether a given path belongs to the psychology zone.
 */
export function isPsychZonePath(path: string): boolean {
  const normalized = path.replace(/\/+$/, "");
  return (
    normalized === "/psych" ||
    normalized.startsWith("/psych/") ||
    normalized === "/apply" ||
    normalized.startsWith("/apply/")
  );
}

/* ========== Layout Component ========== */

export interface PsychLayoutProps {
  children: React.ReactNode;
  className?: string;
}

export function PsychLayout({ children, className }: PsychLayoutProps) {
  const [crisisOpen, setCrisisOpen] = useState(false);

  const hotlines = getCrisisHotlines();
  const crisisResources = hotlines.map((h) => ({
    name: h.name,
    phone: h.number,
  }));

  return (
    <div
      className={cn(
        "min-h-screen bg-orange-50/40 dark:bg-orange-950/10",
        className
      )}
    >
      {/* Safety Banner — always visible at top */}
      <PrivacyBanner
        message={getSafetyBannerText()}
        className="rounded-none border-b border-orange-100 dark:border-orange-900/30"
      />

      {/* Page content */}
      <div className="pb-20">{children}</div>

      {/* Floating crisis alert button — bottom-right */}
      <Button
        onClick={() => setCrisisOpen(true)}
        className="fixed bottom-20 right-4 z-40 h-12 gap-2 rounded-full bg-rose-600 px-4 text-white shadow-lg hover:bg-rose-700 dark:bg-rose-700 dark:hover:bg-rose-600 lg:bottom-6"
        aria-label="一键求助 — 查看紧急求助资源和热线信息"
      >
        <Phone className="h-4 w-4" aria-hidden="true" />
        <span className="text-sm font-medium">一键求助</span>
      </Button>

      {/* Crisis Alert Dialog */}
      <CrisisAlert
        open={crisisOpen}
        onOpenChange={setCrisisOpen}
        resources={crisisResources}
      />
    </div>
  );
}
