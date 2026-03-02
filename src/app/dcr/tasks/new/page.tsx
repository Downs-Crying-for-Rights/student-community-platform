"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { Loader2, AlertTriangle, ArrowLeft } from "lucide-react";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { createTaskSchema } from "@/lib/validators";

/* ========== Types ========== */

type CreateTaskInput = z.input<typeof createTaskSchema>;

/* ========== Constants ========== */

export const CATEGORY_OPTIONS = [
  { value: "TUTORING", label: "补课" },
  { value: "FEES", label: "收费" },
  { value: "WEEKENDS", label: "双休" },
  { value: "OTHER", label: "其他" },
  { value: "EARLY_START", label: "提前开学" },
  { value: "NO_WEEKENDS", label: "不双休" },
  { value: "EXTERNAL_TRAINING", label: "校外培训" },
] as const;

export const URGENCY_OPTIONS = [
  { value: "LOW", label: "低" },
  { value: "MEDIUM", label: "中" },
  { value: "HIGH", label: "高" },
  { value: "URGENT", label: "紧急" },
] as const;

export const LOCATION_OPTIONS = [
  { value: "CITY", label: "市级" },
  { value: "DISTRICT", label: "区级" },
] as const;

export const HELP_CATEGORY_OPTIONS = [
  { value: "POLICY_CONSULT", label: "政策咨询" },
  { value: "COMMUNICATION_TEMPLATE", label: "沟通模板" },
  { value: "MATERIAL_PREP", label: "材料准备" },
  { value: "OTHER", label: "其他" },
] as const;

/* ========== Page Component ========== */

export default function NewTaskPage() {
  const router = useRouter();
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [sensitiveError, setSensitiveError] = useState<string | null>(null);

  const {
    register,
    handleSubmit,
    formState: { errors: formErrors },
  } = useForm<CreateTaskInput>({
    resolver: zodResolver(createTaskSchema) as any,
    defaultValues: {
      title: "",
      category: undefined,
      summary: "",
      expectedHelpType: "",
      urgencyLevel: "MEDIUM",
      structuredFields: {},
    },
  });

  const onSubmit = async (data: CreateTaskInput) => {
    if (submitting) return;
    setError(null);
    setSensitiveError(null);

    // Pre-submit sensitive word detection
    const textToCheck = `${data.title} ${data.summary} ${data.expectedHelpType}`;
    try {
      const scanRes = await fetch("/api/sensitive/scan", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ text: textToCheck }),
      });
      if (scanRes.ok) {
        const scanData = await scanRes.json();
        if (scanData.matches && scanData.matches.length > 0) {
          setSensitiveError("内容包含敏感词，请修改后重新提交");
          return;
        }
      }
    } catch {
      // If scan endpoint unavailable, proceed with server-side check
    }

    setSubmitting(true);

    try {
      // Step 1: Create task (DRAFT)
      const createRes = await fetch("/api/dcr/tasks", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(data),
      });

      if (createRes.status !== 201) {
        const errData = await createRes.json().catch(() => ({}));
        if (errData.matches) {
          setSensitiveError("内容包含敏感词，请修改后重新提交");
        } else {
          setError(errData.error ?? "创建失败，请稍后重试");
        }
        setSubmitting(false);
        return;
      }

      const { id } = await createRes.json();

      // Step 2: Submit task (DRAFT → SUBMITTED)
      const submitRes = await fetch(`/api/dcr/tasks/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "submit" }),
      });

      if (!submitRes.ok) {
        const errData = await submitRes.json().catch(() => ({}));
        setError(errData.error ?? "提交失败，请稍后重试");
        setSubmitting(false);
        return;
      }

      // Step 3: Redirect to task detail page
      router.push(`/dcr/tasks/${id}`);
    } catch {
      setError("网络错误，请检查连接后重试");
      setSubmitting(false);
    }
  };

  return (
    <div className="min-h-screen bg-slate-50/40 dark:bg-slate-950/10">
      <div className="mx-auto max-w-2xl px-4 py-8">
        {/* Header */}
        <div className="mb-6 flex items-center gap-3">
          <Link href="/dcr/tasks" aria-label="返回任务列表">
            <Button variant="ghost" size="icon" className="shrink-0">
              <ArrowLeft className="h-5 w-5" />
            </Button>
          </Link>
          <h1 className="text-xl font-bold text-foreground">发起互助求助</h1>
        </div>

        <form onSubmit={handleSubmit(onSubmit)} noValidate>
          <Card>
            <CardHeader>
              <CardTitle className="text-base">基本信息</CardTitle>
            </CardHeader>
            <CardContent className="space-y-5">
              {/* Title */}
              <div>
                <Label htmlFor="task-title">
                  标题 <span className="text-destructive">*</span>
                </Label>
                <Input
                  id="task-title"
                  placeholder="简要描述您的求助需求"
                  maxLength={100}
                  {...register("title")}
                  aria-invalid={!!formErrors.title}
                />
                {formErrors.title && (
                  <p className="mt-1 text-sm text-destructive">{formErrors.title.message}</p>
                )}
              </div>

              {/* Category */}
              <div>
                <Label htmlFor="task-category">
                  分类 <span className="text-destructive">*</span>
                </Label>
                <select
                  id="task-category"
                  {...register("category")}
                  className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
                  aria-invalid={!!formErrors.category}
                >
                  <option value="">请选择分类</option>
                  {CATEGORY_OPTIONS.map((opt) => (
                    <option key={opt.value} value={opt.value}>
                      {opt.label}
                    </option>
                  ))}
                </select>
                {formErrors.category && (
                  <p className="mt-1 text-sm text-destructive">{formErrors.category.message}</p>
                )}
              </div>

              {/* Summary */}
              <div>
                <Label htmlFor="task-summary">
                  摘要 <span className="text-destructive">*</span>
                </Label>
                <textarea
                  id="task-summary"
                  placeholder="详细描述您遇到的情况和需要的帮助（至少 10 字）"
                  rows={4}
                  maxLength={2000}
                  {...register("summary")}
                  className="flex w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
                  aria-invalid={!!formErrors.summary}
                />
                {formErrors.summary && (
                  <p className="mt-1 text-sm text-destructive">{formErrors.summary.message}</p>
                )}
              </div>

              {/* Expected Help Type */}
              <div>
                <Label htmlFor="task-help-type">
                  期望帮助类型 <span className="text-destructive">*</span>
                </Label>
                <Input
                  id="task-help-type"
                  placeholder="如：政策解读、沟通建议、材料模板等"
                  maxLength={200}
                  {...register("expectedHelpType")}
                  aria-invalid={!!formErrors.expectedHelpType}
                />
                {formErrors.expectedHelpType && (
                  <p className="mt-1 text-sm text-destructive">{formErrors.expectedHelpType.message}</p>
                )}
              </div>

              {/* Urgency Level */}
              <div>
                <Label htmlFor="task-urgency">紧急程度</Label>
                <select
                  id="task-urgency"
                  {...register("urgencyLevel")}
                  className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
                >
                  {URGENCY_OPTIONS.map((opt) => (
                    <option key={opt.value} value={opt.value}>
                      {opt.label}
                    </option>
                  ))}
                </select>
              </div>
            </CardContent>
          </Card>

          {/* Structured Fields */}
          <Card className="mt-4">
            <CardHeader>
              <CardTitle className="text-base">补充信息（可选）</CardTitle>
            </CardHeader>
            <CardContent className="space-y-5">
              {/* Date Range */}
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <Label htmlFor="task-date-start">开始日期</Label>
                  <Input
                    id="task-date-start"
                    type="date"
                    {...register("structuredFields.dateRange.start")}
                  />
                </div>
                <div>
                  <Label htmlFor="task-date-end">结束日期</Label>
                  <Input
                    id="task-date-end"
                    type="date"
                    {...register("structuredFields.dateRange.end")}
                  />
                </div>
              </div>

              {/* Location Granularity */}
              <div>
                <Label htmlFor="task-location">地点粒度</Label>
                <select
                  id="task-location"
                  {...register("structuredFields.locationGranularity")}
                  className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
                >
                  <option value="">不指定</option>
                  {LOCATION_OPTIONS.map((opt) => (
                    <option key={opt.value} value={opt.value}>
                      {opt.label}
                    </option>
                  ))}
                </select>
              </div>

              {/* Help Category */}
              <div>
                <Label htmlFor="task-help-category">涉及类型</Label>
                <select
                  id="task-help-category"
                  {...register("structuredFields.helpCategory")}
                  className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
                >
                  <option value="">不指定</option>
                  {HELP_CATEGORY_OPTIONS.map((opt) => (
                    <option key={opt.value} value={opt.value}>
                      {opt.label}
                    </option>
                  ))}
                </select>
              </div>
            </CardContent>
          </Card>

          {/* Error Messages */}
          {sensitiveError && (
            <div className="mt-4 flex items-center gap-2 rounded-lg border border-destructive/50 bg-destructive/5 px-4 py-3 text-sm text-destructive">
              <AlertTriangle className="h-4 w-4 shrink-0" />
              {sensitiveError}
            </div>
          )}
          {error && (
            <div
              role="alert"
              className="mt-4 rounded-lg bg-red-50 px-4 py-2.5 text-sm text-red-800 dark:bg-red-950/40 dark:text-red-200"
            >
              {error}
            </div>
          )}

          {/* Submit */}
          <div className="mt-6">
            <Button
              type="submit"
              disabled={submitting}
              className="w-full"
              size="lg"
              aria-label="提交求助任务"
            >
              {submitting ? (
                <>
                  <Loader2 className="h-4 w-4 animate-spin" />
                  提交中...
                </>
              ) : (
                "提交求助"
              )}
            </Button>
          </div>
        </form>
      </div>
    </div>
  );
}
