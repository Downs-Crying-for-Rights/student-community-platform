"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import type { z } from "zod";
import { Loader2, ChevronDown, ChevronUp, ShieldAlert, CheckCircle2 } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { PrivacyBanner } from "@/components/shared/PrivacyBanner";
import { SensitiveHighlight } from "@/components/shared/SensitiveHighlight";
import type { SensitiveMatch } from "@/components/shared/SensitiveHighlight";
import { delegationFormSchema } from "@/lib/validators";
import {
  CONTENT_TYPE_MAP,
  SCHOOL_TYPE_OPTIONS,
  DEMAND_OPTIONS,
  DESCRIPTION_TEMPLATES,
  formatDelegation,
  type DelegationFormData,
} from "@/lib/dcr-delegation-types";

type FormValues = z.infer<typeof delegationFormSchema>;

const CONTENT_TYPES = Object.keys(CONTENT_TYPE_MAP);
const SCHOOL_CATEGORIES = Object.keys(SCHOOL_TYPE_OPTIONS);
const FEE_OPTIONS = [
  { value: "none" as const, label: "未收费" },
  { value: "charged" as const, label: "已收费" },
  { value: "unknown" as const, label: "不清楚" },
];
const CONFIRMATION_LABELS = [
  "我确认以上信息真实有效",
  "我已移除所有可识别个人信息",
  "我了解平台不组织、不指挥、不实施任何举报或对抗行动",
];

const textareaClass =
  "flex w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50";

export default function DelegatePage() {
  const router = useRouter();
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [sensitiveMatches, setSensitiveMatches] = useState<SensitiveMatch[]>([]);
  const [sensitiveText, setSensitiveText] = useState("");
  const [showTemplate, setShowTemplate] = useState(false);

  const {
    register,
    handleSubmit,
    watch,
    setValue,
    formState: { errors },
  } = useForm<FormValues>({
    resolver: zodResolver(delegationFormSchema),
    defaultValues: {
      contentType: undefined,
      schoolName: "",
      schoolCategory: undefined,
      schoolType: "",
      schoolAddress: "",
      reportChannels: "",
      description: "",
      feeStatus: "none",
      feeDetails: "",
      demands: [],
      otherDemand: "",
      confirmations: [false, false, false] as unknown as [true, true, true],
    },
  });

  const schoolCategory = watch("schoolCategory");
  const contentType = watch("contentType");
  const feeStatus = watch("feeStatus");
  const demands = watch("demands");
  const confirmations = watch("confirmations");

  // Dynamic school type options based on school category
  const schoolTypeOptions = schoolCategory
    ? SCHOOL_TYPE_OPTIONS[schoolCategory] ?? []
    : [];

  // Reset schoolType when schoolCategory changes
  useEffect(() => {
    if (schoolCategory) {
      setValue("schoolType", "");
    }
  }, [schoolCategory, setValue]);

  // Find matching template key for current content type
  const templateKey = contentType
    ? Object.keys(DESCRIPTION_TEMPLATES).find((key) => {
        const map: Record<string, string> = {
          "学校补课类": "补课",
          "学校提前开学类": "提前开学",
          "学校不双休类": "不双休",
          "校外培训机构类": "校外培训机构",
        };
        return map[contentType] === key;
      })
    : null;
  const templateText = templateKey ? DESCRIPTION_TEMPLATES[templateKey] : null;

  const allConfirmed =
    confirmations &&
    confirmations[0] === true &&
    confirmations[1] === true &&
    confirmations[2] === true;

  const onSubmit = async (data: FormValues) => {
    setError(null);
    setSensitiveMatches([]);
    setSubmitting(true);

    try {
      // Combine all text fields for sensitive scan
      const textParts = [
        data.schoolName,
        data.schoolAddress,
        data.reportChannels ?? "",
        data.description,
        data.feeDetails ?? "",
        data.otherDemand ?? "",
      ].filter(Boolean);
      const combinedText = textParts.join("\n");

      // Scan for sensitive content
      const scanRes = await fetch("/api/sensitive/scan", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ text: combinedText }),
      });

      if (scanRes.ok) {
        const scanData = await scanRes.json();
        if (scanData.matches && scanData.matches.length > 0) {
          setSensitiveMatches(scanData.matches);
          setSensitiveText(combinedText);
          setSubmitting(false);
          return;
        }
      }

      // Build form data for submission
      const formData: DelegationFormData = {
        contentType: data.contentType,
        schoolName: data.schoolName,
        schoolCategory: data.schoolCategory,
        schoolType: data.schoolType,
        schoolAddress: data.schoolAddress,
        reportChannels: data.reportChannels ?? "",
        description: data.description,
        feeStatus: data.feeStatus,
        feeDetails: data.feeDetails,
        demands: data.demands,
        otherDemand: data.otherDemand,
      };

      const pledgeText = formatDelegation(formData);
      const category = CONTENT_TYPE_MAP[data.contentType];

      const res = await fetch("/api/cases", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          category,
          formData,
          pledgeText,
          grade: data.grade || undefined,
          timeRange: data.timeRange || undefined,
          province: data.province || undefined,
          city: data.city || undefined,
          expectedHelperProvince: data.expectedHelperProvince || undefined,
          riskPreference: data.riskPreference || undefined,
        }),
      });

      if (res.ok || res.status === 201) {
        router.push("/dcr");
      } else {
        const resData = await res.json().catch(() => ({}));
        setError(resData.error ?? "提交失败，请稍后重试");
      }
    } catch {
      setError("网络错误，请检查连接后重试");
    } finally {
      setSubmitting(false);
    }
  };

  const handleDemandToggle = (option: string) => {
    const current: string[] = demands ?? [];
    if (current.includes(option)) {
      setValue(
        "demands",
        current.filter((d: string) => d !== option),
        { shouldValidate: true }
      );
    } else {
      setValue("demands", [...current, option], { shouldValidate: true });
    }
  };

  const handleConfirmationToggle = (index: number) => {
    const current = confirmations ? [...confirmations] : [false, false, false];
    current[index] = !current[index];
    setValue("confirmations", current as [boolean, boolean, boolean] as unknown as [true, true, true], {
      shouldValidate: true,
    });
  };

  return (
    <div className="min-h-screen bg-slate-50/40 dark:bg-slate-950/10">
      <div className="mx-auto max-w-2xl px-4 py-8">
        {/* Privacy Banner */}
        <div className="mb-6">
          <PrivacyBanner message="请勿在委托表中包含真实姓名、教师姓名等可识别个人信息" />
        </div>

        <h1 className="mb-6 text-2xl font-bold text-foreground">填写委托表</h1>

        {/* Sensitive content warning */}
        {sensitiveMatches.length > 0 && (
          <div className="mb-6">
            <div className="mb-3 flex items-center gap-2 rounded-2xl bg-red-50 px-4 py-3 text-sm text-red-800 dark:bg-red-950/40 dark:text-red-200">
              <ShieldAlert className="h-4 w-4 shrink-0" aria-hidden="true" />
              <span>
                检测到 {sensitiveMatches.length} 处敏感信息，请修改后重新提交
              </span>
            </div>
            <Card>
              <CardHeader>
                <CardTitle className="text-base">敏感内容预览</CardTitle>
              </CardHeader>
              <CardContent>
                <SensitiveHighlight
                  text={sensitiveText}
                  matches={sensitiveMatches}
                  showHints
                />
              </CardContent>
            </Card>
          </div>
        )}

        <form onSubmit={handleSubmit(onSubmit)} className="space-y-6">

          {/* Section 1: Content Type */}
          <Card>
            <CardHeader>
              <CardTitle className="text-base">内容类型</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="space-y-2" role="radiogroup" aria-label="内容类型">
                {CONTENT_TYPES.map((type) => (
                  <label
                    key={type}
                    className="flex cursor-pointer items-center gap-3 rounded-lg p-2 transition-colors hover:bg-muted/50"
                  >
                    <input
                      type="radio"
                      value={type}
                      {...register("contentType")}
                      className="h-4 w-4 border-gray-300 text-primary focus:ring-primary"
                    />
                    <span className="text-sm text-foreground">{type}</span>
                  </label>
                ))}
              </div>
              {errors.contentType && (
                <p className="mt-2 text-sm text-destructive">{errors.contentType.message}</p>
              )}
            </CardContent>
          </Card>

          {/* Section 2: School Info */}
          <Card>
            <CardHeader>
              <CardTitle className="text-base">学校信息</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div>
                <Label htmlFor="schoolName" className="mb-1.5 block">
                  学校名称 <span className="text-destructive" aria-hidden="true">*</span>
                </Label>
                <Input
                  id="schoolName"
                  placeholder="请输入学校名称"
                  {...register("schoolName")}
                  aria-required="true"
                />
                {errors.schoolName && (
                  <p className="mt-1 text-sm text-destructive">{errors.schoolName.message}</p>
                )}
              </div>

              <div>
                <Label htmlFor="schoolCategory" className="mb-1.5 block">
                  学校性质 <span className="text-destructive" aria-hidden="true">*</span>
                </Label>
                <select
                  id="schoolCategory"
                  {...register("schoolCategory")}
                  className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50"
                  aria-required="true"
                >
                  <option value="">请选择学校性质</option>
                  {SCHOOL_CATEGORIES.map((cat) => (
                    <option key={cat} value={cat}>
                      {cat}
                    </option>
                  ))}
                </select>
                {errors.schoolCategory && (
                  <p className="mt-1 text-sm text-destructive">{errors.schoolCategory.message}</p>
                )}
              </div>

              <div>
                <Label htmlFor="schoolType" className="mb-1.5 block">
                  学校类型 <span className="text-destructive" aria-hidden="true">*</span>
                </Label>
                <select
                  id="schoolType"
                  {...register("schoolType")}
                  className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50"
                  disabled={!schoolCategory}
                  aria-required="true"
                >
                  <option value="">请选择学校类型</option>
                  {schoolTypeOptions.map((type) => (
                    <option key={type} value={type}>
                      {type}
                    </option>
                  ))}
                </select>
                {errors.schoolType && (
                  <p className="mt-1 text-sm text-destructive">{errors.schoolType.message}</p>
                )}
              </div>

              <div>
                <Label htmlFor="schoolAddress" className="mb-1.5 block">
                  学校地址 <span className="text-destructive" aria-hidden="true">*</span>
                </Label>
                <Input
                  id="schoolAddress"
                  placeholder="请输入学校地址"
                  {...register("schoolAddress")}
                  aria-required="true"
                />
                {errors.schoolAddress && (
                  <p className="mt-1 text-sm text-destructive">{errors.schoolAddress.message}</p>
                )}
              </div>
            </CardContent>
          </Card>

          {/* Section 3: Report Channels */}
          <Card>
            <CardHeader>
              <CardTitle className="text-base">举报途径</CardTitle>
            </CardHeader>
            <CardContent>
              <Label htmlFor="reportChannels" className="mb-1.5 block">
                已尝试的举报途径（选填）
              </Label>
              <textarea
                id="reportChannels"
                placeholder="请描述您已尝试的举报途径，如：拨打教育局电话、12345热线等"
                {...register("reportChannels")}
                rows={3}
                className={textareaClass}
              />
              {errors.reportChannels && (
                <p className="mt-1 text-sm text-destructive">{errors.reportChannels.message}</p>
              )}
            </CardContent>
          </Card>

          {/* Section 4: Description + Template */}
          <Card>
            <CardHeader>
              <CardTitle className="text-base">详细描述</CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              {templateText && (
                <div>
                  <button
                    type="button"
                    onClick={() => setShowTemplate(!showTemplate)}
                    className="flex items-center gap-1 text-sm text-primary hover:underline"
                    aria-expanded={showTemplate}
                  >
                    {showTemplate ? (
                      <ChevronUp className="h-4 w-4" aria-hidden="true" />
                    ) : (
                      <ChevronDown className="h-4 w-4" aria-hidden="true" />
                    )}
                    {showTemplate ? "收起模板" : "查看描述模板"}
                  </button>
                  {showTemplate && (
                    <div className="mt-2 rounded-lg bg-muted/50 p-3 text-sm text-muted-foreground whitespace-pre-wrap">
                      {templateText}
                    </div>
                  )}
                </div>
              )}
              <div>
                <Label htmlFor="description" className="mb-1.5 block">
                  详细描述 <span className="text-destructive" aria-hidden="true">*</span>
                </Label>
                <textarea
                  id="description"
                  placeholder="请详细描述具体情况（至少 20 字）"
                  {...register("description")}
                  rows={6}
                  className={textareaClass}
                  aria-required="true"
                />
                {errors.description && (
                  <p className="mt-1 text-sm text-destructive">{errors.description.message}</p>
                )}
              </div>
            </CardContent>
          </Card>

          {/* Section 5: Fee Status */}
          <Card>
            <CardHeader>
              <CardTitle className="text-base">补课收费情况</CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              <div className="space-y-2" role="radiogroup" aria-label="收费情况">
                {FEE_OPTIONS.map((opt) => (
                  <label
                    key={opt.value}
                    className="flex cursor-pointer items-center gap-3 rounded-lg p-2 transition-colors hover:bg-muted/50"
                  >
                    <input
                      type="radio"
                      value={opt.value}
                      {...register("feeStatus")}
                      className="h-4 w-4 border-gray-300 text-primary focus:ring-primary"
                    />
                    <span className="text-sm text-foreground">{opt.label}</span>
                  </label>
                ))}
              </div>
              {errors.feeStatus && (
                <p className="mt-1 text-sm text-destructive">{errors.feeStatus.message}</p>
              )}
              {feeStatus === "charged" && (
                <div>
                  <Label htmlFor="feeDetails" className="mb-1.5 block">
                    收费详情
                  </Label>
                  <textarea
                    id="feeDetails"
                    placeholder="请描述收费金额、方式等详情"
                    {...register("feeDetails")}
                    rows={3}
                    className={textareaClass}
                  />
                  {errors.feeDetails && (
                    <p className="mt-1 text-sm text-destructive">{errors.feeDetails.message}</p>
                  )}
                </div>
              )}
            </CardContent>
          </Card>

          {/* Section 6: Demands */}
          <Card>
            <CardHeader>
              <CardTitle className="text-base">诉求</CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              <div className="space-y-2">
                {DEMAND_OPTIONS.map((option) => (
                  <label
                    key={option}
                    className="flex cursor-pointer items-center gap-3 rounded-lg p-2 transition-colors hover:bg-muted/50"
                  >
                    <input
                      type="checkbox"
                      checked={demands?.includes(option) ?? false}
                      onChange={() => handleDemandToggle(option)}
                      className="h-4 w-4 rounded border-gray-300 text-primary focus:ring-primary"
                    />
                    <span className="text-sm text-foreground">{option}</span>
                  </label>
                ))}
              </div>
              {errors.demands && (
                <p className="mt-1 text-sm text-destructive">{errors.demands.message}</p>
              )}
              {demands?.includes("其他") && (
                <div>
                  <Label htmlFor="otherDemand" className="mb-1.5 block">
                    其他诉求
                  </Label>
                  <textarea
                    id="otherDemand"
                    placeholder="请描述其他诉求"
                    {...register("otherDemand")}
                    rows={2}
                    className={textareaClass}
                  />
                  {errors.otherDemand && (
                    <p className="mt-1 text-sm text-destructive">{errors.otherDemand.message}</p>
                  )}
                </div>
              )}
            </CardContent>
          </Card>

          {/* Section 7: Structured Fields (Optional) */}
          <Card>
            <CardHeader>
              <CardTitle className="text-base">详细信息（选填，有助于提高匹配质量）</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <Label htmlFor="grade" className="mb-1.5 block">年级</Label>
                  <select
                    id="grade"
                    {...register("grade")}
                    className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                  >
                    <option value="">不限</option>
                    <option value="高一">高一</option>
                    <option value="高二">高二</option>
                    <option value="高三">高三</option>
                    <option value="初一">初一</option>
                    <option value="初二">初二</option>
                    <option value="初三">初三</option>
                  </select>
                </div>
                <div>
                  <Label htmlFor="timeRange" className="mb-1.5 block">补课时间</Label>
                  <Input
                    id="timeRange"
                    placeholder="如 周六 8:30-17:30"
                    {...register("timeRange")}
                  />
                </div>
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <Label htmlFor="province" className="mb-1.5 block">省份</Label>
                  <Input id="province" placeholder="如 广东省" {...register("province")} />
                </div>
                <div>
                  <Label htmlFor="city" className="mb-1.5 block">城市</Label>
                  <Input id="city" placeholder="如 广州市" {...register("city")} />
                </div>
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <Label htmlFor="expectedHelperProvince" className="mb-1.5 block">期望互助人省份</Label>
                  <Input id="expectedHelperProvince" placeholder="避免同省可填写" {...register("expectedHelperProvince")} />
                </div>
                <div>
                  <Label htmlFor="riskPreference" className="mb-1.5 block">风险偏好</Label>
                  <select
                    id="riskPreference"
                    {...register("riskPreference")}
                    className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                  >
                    <option value="">不限</option>
                    <option value="仅站内沟通">仅站内沟通</option>
                    <option value="可电话">可电话</option>
                    <option value="仅模板咨询">仅模板咨询</option>
                  </select>
                </div>
              </div>
            </CardContent>
          </Card>

          {/* Section 8: Confirmations */}
          <Card>
            <CardHeader>
              <CardTitle className="text-base">确认信息</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="space-y-3">
                {CONFIRMATION_LABELS.map((label, index) => (
                  <label
                    key={label}
                    className="flex cursor-pointer items-start gap-3 rounded-lg p-2 transition-colors hover:bg-muted/50"
                  >
                    <input
                      type="checkbox"
                      checked={confirmations?.[index] === true}
                      onChange={() => handleConfirmationToggle(index)}
                      className="mt-0.5 h-4 w-4 rounded border-gray-300 text-primary focus:ring-primary"
                      aria-label={label}
                    />
                    <span className="text-sm text-foreground leading-relaxed">
                      {label}
                    </span>
                  </label>
                ))}
              </div>
              {errors.confirmations && (
                <p className="mt-2 text-sm text-destructive">请确认所有声明</p>
              )}
              {allConfirmed && (
                <div className="mt-3 flex items-center gap-2 rounded-lg bg-green-50 px-3 py-2 text-sm text-green-800 dark:bg-green-950/40 dark:text-green-200">
                  <CheckCircle2 className="h-4 w-4 shrink-0" aria-hidden="true" />
                  <span>已确认所有声明</span>
                </div>
              )}
            </CardContent>
          </Card>

          {/* Error */}
          {error && (
            <div
              role="alert"
              className="rounded-lg bg-red-50 px-4 py-2.5 text-sm text-red-800 dark:bg-red-950/40 dark:text-red-200"
            >
              {error}
            </div>
          )}

          {/* Submit */}
          <div className="flex justify-end">
            <Button
              type="submit"
              disabled={submitting || !allConfirmed}
              className="rounded-2xl"
              aria-label="提交委托表"
            >
              {submitting ? (
                <>
                  <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />
                  提交中...
                </>
              ) : (
                "提交委托表"
              )}
            </Button>
          </div>
        </form>
      </div>
    </div>
  );
}
