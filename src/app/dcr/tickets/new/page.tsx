"use client";

import { useState, useCallback } from "react";
import { useRouter } from "next/navigation";
import {
  BookOpen,
  DollarSign,
  CalendarDays,
  HelpCircle,
  ArrowLeft,
  ArrowRight,
  Loader2,
  ShieldAlert,
  CheckCircle2,
  Sunrise,
  CalendarX,
  Building,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { PrivacyBanner } from "@/components/shared/PrivacyBanner";
import { SensitiveHighlight } from "@/components/shared/SensitiveHighlight";
import type { SensitiveMatch } from "@/components/shared/SensitiveHighlight";
import { WizardStepper } from "@/components/dcr/WizardStepper";
import type { WizardStep } from "@/components/dcr/WizardStepper";

/* ========== Constants ========== */

export const DCR_CATEGORIES = ["TUTORING", "FEES", "WEEKENDS", "OTHER", "EARLY_START", "NO_WEEKENDS", "EXTERNAL_TRAINING"] as const;
export type DCRCategory = (typeof DCR_CATEGORIES)[number];

export const CATEGORY_META: Record<
  DCRCategory,
  { label: string; icon: typeof BookOpen; description: string }
> = {
  TUTORING: {
    label: "补课",
    icon: BookOpen,
    description: "与补课相关的权益信息互助",
  },
  FEES: {
    label: "收费",
    icon: DollarSign,
    description: "与收费相关的权益信息互助",
  },
  WEEKENDS: {
    label: "双休",
    icon: CalendarDays,
    description: "与双休相关的权益信息互助",
  },
  OTHER: {
    label: "其他",
    icon: HelpCircle,
    description: "其他类型的权益信息互助",
  },
  EARLY_START: {
    label: "提前开学",
    icon: Sunrise,
    description: "与提前开学相关的权益信息互助",
  },
  NO_WEEKENDS: {
    label: "不双休",
    icon: CalendarX,
    description: "与不双休相关的权益信息互助",
  },
  EXTERNAL_TRAINING: {
    label: "校外培训",
    icon: Building,
    description: "与校外培训机构相关的权益信息互助",
  },
};

export const WIZARD_STEPS: WizardStep[] = [
  { label: "选择类型" },
  { label: "填写表单" },
  { label: "隐私检查" },
  { label: "确认声明" },
];

export const PLEDGE_STATEMENTS = [
  "我确认已移除所有可识别个人信息",
  "我了解平台不组织、不指挥、不实施任何举报或对抗行动",
] as const;


/* ========== Form Templates ========== */

export interface FormField {
  key: string;
  label: string;
  placeholder: string;
  type: "text" | "textarea";
  required: boolean;
}

export function getFormTemplate(category: DCRCategory): FormField[] {
  const common: FormField[] = [
    {
      key: "description",
      label: "事项描述",
      placeholder: "请描述具体情况（请勿包含真实姓名、学校名称等可识别信息）",
      type: "textarea",
      required: true,
    },
    {
      key: "expectation",
      label: "期望结果",
      placeholder: "您希望获得什么帮助或信息",
      type: "textarea",
      required: true,
    },
  ];

  const templates: Record<DCRCategory, FormField[]> = {
    TUTORING: [
      {
        key: "gradeLevel",
        label: "年级",
        placeholder: "如：高一、初二",
        type: "text",
        required: true,
      },
      {
        key: "subject",
        label: "涉及科目",
        placeholder: "如：数学、英语",
        type: "text",
        required: false,
      },
      ...common,
    ],
    FEES: [
      {
        key: "feeType",
        label: "收费类型",
        placeholder: "如：资料费、补课费、校服费",
        type: "text",
        required: true,
      },
      {
        key: "amount",
        label: "涉及金额（大致范围）",
        placeholder: "如：200-500 元",
        type: "text",
        required: false,
      },
      ...common,
    ],
    WEEKENDS: [
      {
        key: "situation",
        label: "当前情况",
        placeholder: "如：周六全天上课、仅半天",
        type: "text",
        required: true,
      },
      ...common,
    ],
    OTHER: common,
    EARLY_START: [
      {
        key: "startDate",
        label: "提前开学日期",
        placeholder: "如：8月20日",
        type: "text",
        required: true,
      },
      ...common,
    ],
    NO_WEEKENDS: [
      {
        key: "situation",
        label: "当前情况",
        placeholder: "如：周六全天上课、周日半天",
        type: "text",
        required: true,
      },
      ...common,
    ],
    EXTERNAL_TRAINING: [
      {
        key: "institutionType",
        label: "机构类型",
        placeholder: "如：学科类、艺术类",
        type: "text",
        required: true,
      },
      ...common,
    ],
  };

  return templates[category];
}

/* ========== Validation ========== */

export function validateFormData(
  fields: FormField[],
  data: Record<string, string>
): string | null {
  for (const field of fields) {
    if (field.required && (!data[field.key] || data[field.key].trim() === "")) {
      return `请填写「${field.label}」`;
    }
  }
  return null;
}

export function validatePledges(checked: boolean[]): boolean {
  return checked.length === PLEDGE_STATEMENTS.length && checked.every(Boolean);
}

/**
 * Combine all form text fields into a single string for scanning.
 */
export function combineFormText(data: Record<string, string>): string {
  return Object.values(data).filter(Boolean).join("\n");
}


/* ========== Page Component ========== */

export default function NewTicketWizardPage() {
  const router = useRouter();
  const [currentStep, setCurrentStep] = useState(0);
  const [category, setCategory] = useState<DCRCategory | null>(null);
  const [formData, setFormData] = useState<Record<string, string>>({});
  const [sensitiveMatches, setSensitiveMatches] = useState<SensitiveMatch[]>([]);
  const [scanning, setScanning] = useState(false);
  const [pledges, setPledges] = useState<boolean[]>(
    PLEDGE_STATEMENTS.map(() => false)
  );
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  /* ---------- Step navigation ---------- */

  const canGoNext = useCallback((): boolean => {
    switch (currentStep) {
      case 0:
        return category !== null;
      case 1: {
        if (!category) return false;
        const fields = getFormTemplate(category);
        return validateFormData(fields, formData) === null;
      }
      case 2:
        return sensitiveMatches.length === 0;
      case 3:
        return validatePledges(pledges);
      default:
        return false;
    }
  }, [currentStep, category, formData, sensitiveMatches, pledges]);

  const handleNext = async () => {
    setError(null);

    // When leaving step 1 → run privacy scan
    if (currentStep === 1) {
      setScanning(true);
      try {
        const text = combineFormText(formData);
        const res = await fetch("/api/sensitive/scan", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ text }),
        });
        if (res.ok) {
          const data = await res.json();
          setSensitiveMatches(data.matches ?? []);
        } else {
          // Fallback: no matches if API unavailable
          setSensitiveMatches([]);
        }
      } catch {
        setSensitiveMatches([]);
      } finally {
        setScanning(false);
      }
    }

    if (currentStep < WIZARD_STEPS.length - 1) {
      setCurrentStep((s) => s + 1);
    }
  };

  const handleBack = () => {
    setError(null);
    if (currentStep > 0) {
      setCurrentStep((s) => s - 1);
    }
  };

  const handleSubmit = async () => {
    if (!category || !validatePledges(pledges)) return;
    setSubmitting(true);
    setError(null);

    try {
      const res = await fetch("/api/cases", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          category,
          formData,
          pledgeText: PLEDGE_STATEMENTS.join("；"),
        }),
      });

      if (res.ok || res.status === 201) {
        router.push("/dcr/tickets");
      } else {
        const data = await res.json().catch(() => ({}));
        setError(data.error ?? "提交失败，请稍后重试");
      }
    } catch {
      setError("网络错误，请检查连接后重试");
    } finally {
      setSubmitting(false);
    }
  };

  /* ---------- Field change handler ---------- */

  const handleFieldChange = (key: string, value: string) => {
    setFormData((prev) => ({ ...prev, [key]: value }));
  };

  const handlePledgeToggle = (index: number) => {
    setPledges((prev) => prev.map((v, i) => (i === index ? !v : v)));
  };

  /* ---------- Render ---------- */

  return (
    <div className="min-h-screen bg-slate-50/40 dark:bg-slate-950/10">
      <div className="mx-auto max-w-2xl px-4 py-8">
        {/* Privacy Banner */}
        <div className="mb-6">
          <PrivacyBanner />
        </div>

        {/* Stepper */}
        <div className="mb-8">
          <WizardStepper steps={WIZARD_STEPS} currentStep={currentStep} />
        </div>

        {/* Step Content */}
        {currentStep === 0 && (
          <StepCategorySelect
            selected={category}
            onSelect={setCategory}
          />
        )}

        {currentStep === 1 && category && (
          <StepFormFill
            category={category}
            formData={formData}
            onChange={handleFieldChange}
          />
        )}

        {currentStep === 2 && (
          <StepPrivacyCheck
            formData={formData}
            matches={sensitiveMatches}
            scanning={scanning}
          />
        )}

        {currentStep === 3 && (
          <StepPledge
            pledges={pledges}
            onToggle={handlePledgeToggle}
          />
        )}

        {/* Error */}
        {error && (
          <div
            role="alert"
            className="mt-4 rounded-lg bg-red-50 px-4 py-2.5 text-sm text-red-800 dark:bg-red-950/40 dark:text-red-200"
          >
            {error}
          </div>
        )}

        {/* Navigation */}
        <div className="mt-8 flex items-center justify-between gap-4">
          <Button
            variant="outline"
            onClick={handleBack}
            disabled={currentStep === 0}
            className="rounded-2xl"
            aria-label="上一步"
          >
            <ArrowLeft className="h-4 w-4" aria-hidden="true" />
            上一步
          </Button>

          {currentStep < WIZARD_STEPS.length - 1 ? (
            <Button
              onClick={handleNext}
              disabled={!canGoNext() || scanning}
              className="rounded-2xl"
              aria-label="下一步"
            >
              {scanning ? (
                <>
                  <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />
                  扫描中...
                </>
              ) : (
                <>
                  下一步
                  <ArrowRight className="h-4 w-4" aria-hidden="true" />
                </>
              )}
            </Button>
          ) : (
            <Button
              onClick={handleSubmit}
              disabled={!canGoNext() || submitting}
              className="rounded-2xl"
              aria-label="提交工单"
            >
              {submitting ? (
                <>
                  <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />
                  提交中...
                </>
              ) : (
                "提交工单"
              )}
            </Button>
          )}
        </div>
      </div>
    </div>
  );
}


/* ========== Step 1: Category Select ========== */

function StepCategorySelect({
  selected,
  onSelect,
}: {
  selected: DCRCategory | null;
  onSelect: (cat: DCRCategory) => void;
}) {
  return (
    <div>
      <h2 className="mb-4 text-lg font-semibold text-foreground">
        选择事项类型
      </h2>
      <div className="grid grid-cols-2 gap-4" role="radiogroup" aria-label="事项类型">
        {DCR_CATEGORIES.map((cat) => {
          const meta = CATEGORY_META[cat];
          const Icon = meta.icon;
          const isSelected = selected === cat;

          return (
            <button
              key={cat}
              type="button"
              role="radio"
              aria-checked={isSelected}
              onClick={() => onSelect(cat)}
              className={`flex flex-col items-center gap-2 rounded-2xl border-2 p-6 text-center transition-colors ${
                isSelected
                  ? "border-primary bg-primary/5"
                  : "border-muted-foreground/20 bg-card hover:border-muted-foreground/40"
              }`}
            >
              <div
                className={`flex h-12 w-12 items-center justify-center rounded-full ${
                  isSelected
                    ? "bg-primary/10 text-primary"
                    : "bg-slate-100 text-slate-500 dark:bg-slate-800 dark:text-slate-400"
                }`}
              >
                <Icon className="h-6 w-6" aria-hidden="true" />
              </div>
              <span className="text-sm font-medium text-foreground">
                {meta.label}
              </span>
              <span className="text-xs text-muted-foreground">
                {meta.description}
              </span>
            </button>
          );
        })}
      </div>
    </div>
  );
}

/* ========== Step 2: Form Fill ========== */

function StepFormFill({
  category,
  formData,
  onChange,
}: {
  category: DCRCategory;
  formData: Record<string, string>;
  onChange: (key: string, value: string) => void;
}) {
  const fields = getFormTemplate(category);
  const meta = CATEGORY_META[category];

  return (
    <div>
      <h2 className="mb-1 text-lg font-semibold text-foreground">
        填写委托表单
      </h2>
      <p className="mb-6 text-sm text-muted-foreground">
        事项类型：{meta.label}
      </p>

      <div className="space-y-5">
        {fields.map((field) => (
          <div key={field.key}>
            <Label htmlFor={`field-${field.key}`} className="mb-1.5 block">
              {field.label}
              {field.required && (
                <span className="ml-1 text-destructive" aria-hidden="true">*</span>
              )}
            </Label>
            {field.type === "textarea" ? (
              <textarea
                id={`field-${field.key}`}
                placeholder={field.placeholder}
                value={formData[field.key] ?? ""}
                onChange={(e) => onChange(field.key, e.target.value)}
                rows={4}
                className="flex w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50"
                required={field.required}
                aria-required={field.required}
              />
            ) : (
              <Input
                id={`field-${field.key}`}
                placeholder={field.placeholder}
                value={formData[field.key] ?? ""}
                onChange={(e) => onChange(field.key, e.target.value)}
                required={field.required}
                aria-required={field.required}
              />
            )}
          </div>
        ))}
      </div>
    </div>
  );
}

/* ========== Step 3: Privacy Check ========== */

function StepPrivacyCheck({
  formData,
  matches,
  scanning,
}: {
  formData: Record<string, string>;
  matches: SensitiveMatch[];
  scanning: boolean;
}) {
  const combinedText = combineFormText(formData);
  const hasSensitive = matches.length > 0;

  return (
    <div>
      <h2 className="mb-1 text-lg font-semibold text-foreground">
        隐私检查
      </h2>
      <p className="mb-6 text-sm text-muted-foreground">
        系统已对您的表单内容进行敏感信息扫描
      </p>

      {scanning ? (
        <Card>
          <CardContent className="flex items-center justify-center gap-2 py-12">
            <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" aria-hidden="true" />
            <span className="text-sm text-muted-foreground">正在扫描敏感信息...</span>
          </CardContent>
        </Card>
      ) : hasSensitive ? (
        <div>
          <div className="mb-4 flex items-center gap-2 rounded-2xl bg-red-50 px-4 py-3 text-sm text-red-800 dark:bg-red-950/40 dark:text-red-200">
            <ShieldAlert className="h-4 w-4 shrink-0" aria-hidden="true" />
            <span>
              检测到 {matches.length} 处可识别信息，请返回上一步修改后再继续
            </span>
          </div>
          <Card>
            <CardHeader>
              <CardTitle className="text-base">内容预览</CardTitle>
            </CardHeader>
            <CardContent>
              <SensitiveHighlight
                text={combinedText}
                matches={matches}
                showHints
              />
            </CardContent>
          </Card>
        </div>
      ) : (
        <div>
          <div className="mb-4 flex items-center gap-2 rounded-2xl bg-green-50 px-4 py-3 text-sm text-green-800 dark:bg-green-950/40 dark:text-green-200">
            <CheckCircle2 className="h-4 w-4 shrink-0" aria-hidden="true" />
            <span>未检测到可识别信息，可以继续</span>
          </div>
          <Card>
            <CardHeader>
              <CardTitle className="text-base">内容预览</CardTitle>
            </CardHeader>
            <CardContent>
              <p className="whitespace-pre-wrap text-sm text-muted-foreground leading-relaxed">
                {combinedText}
              </p>
            </CardContent>
          </Card>
        </div>
      )}
    </div>
  );
}

/* ========== Step 4: Pledge ========== */

function StepPledge({
  pledges,
  onToggle,
}: {
  pledges: boolean[];
  onToggle: (index: number) => void;
}) {
  const allChecked = validatePledges(pledges);

  return (
    <div>
      <h2 className="mb-1 text-lg font-semibold text-foreground">
        强制声明
      </h2>
      <p className="mb-6 text-sm text-muted-foreground">
        提交前请仔细阅读并勾选以下声明
      </p>

      <Card>
        <CardContent className="pt-6">
          <div className="space-y-4">
            {PLEDGE_STATEMENTS.map((statement, index) => (
              <label
                key={statement}
                className="flex cursor-pointer items-start gap-3 rounded-lg p-3 transition-colors hover:bg-muted/50"
              >
                <input
                  type="checkbox"
                  checked={pledges[index] ?? false}
                  onChange={() => onToggle(index)}
                  className="mt-0.5 h-4 w-4 shrink-0 rounded border-gray-300 text-primary focus:ring-primary"
                  aria-label={statement}
                />
                <span className="text-sm text-foreground leading-relaxed">
                  {statement}
                </span>
              </label>
            ))}
          </div>

          {allChecked && (
            <div className="mt-4 flex items-center gap-2 rounded-lg bg-green-50 px-3 py-2 text-sm text-green-800 dark:bg-green-950/40 dark:text-green-200">
              <CheckCircle2 className="h-4 w-4 shrink-0" aria-hidden="true" />
              <span>已确认所有声明，可以提交</span>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
