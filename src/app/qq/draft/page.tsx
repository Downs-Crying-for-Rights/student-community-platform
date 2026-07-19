"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { CheckCircle2, FileCheck2, Loader2, ShieldAlert } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import type { QQDelegationDraft } from "@/lib/qq-delegation";

const CONFIRMATIONS = [
  "我确认以上信息真实有效",
  "我已移除所有可识别个人信息",
  "我了解平台不组织、不指挥、不实施任何举报或对抗行动",
] as const;

type Preview = { draft: QQDelegationDraft; payloadHash: string; expiresAt: string };

const LABELS: Record<keyof Omit<QQDelegationDraft, "schemaVersion">, string> = {
  contentType: "内容类型",
  schoolName: "学校名称",
  schoolCategory: "学校性质",
  schoolType: "学校类型",
  schoolAddress: "学校地址",
  reportChannels: "已尝试途径",
  description: "详细描述",
  feeStatus: "收费情况",
  feeDetails: "收费详情",
  demands: "诉求",
  otherDemand: "其他诉求",
  grade: "涉及年级",
  timeRange: "时间范围",
  province: "省份",
  city: "城市",
  expectedHelperProvince: "期望互助人省份",
  riskPreference: "风险偏好",
};

const CONTENT_TYPES: Record<string, string> = {
  TUTORING: "学校补课类",
  EARLY_START: "学校提前开学类",
  NO_WEEKENDS: "学校不双休类",
  EXTERNAL_TRAINING: "校外培训机构类",
  OTHER: "其他",
};

export default function QQDraftPage() {
  const [token, setToken] = useState("");
  const [preview, setPreview] = useState<Preview | null>(null);
  const [confirmations, setConfirmations] = useState([false, false, false]);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [caseUrl, setCaseUrl] = useState<string | null>(null);

  useEffect(() => {
    const rawToken = new URLSearchParams(window.location.search).get("token") ?? "";
    window.history.replaceState(null, "", window.location.pathname);
    setToken(rawToken);
    if (!rawToken) {
      setError("委托链接缺少凭证，请返回 QQ 重新生成");
      setLoading(false);
      return;
    }
    fetch("/api/qq/draft/preview", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ token: rawToken }),
      cache: "no-store",
    })
      .then(async (response) => {
        const data = await response.json();
        if (!response.ok) throw new Error(data.error ?? "读取委托草稿失败");
        setPreview(data);
      })
      .catch((reason: unknown) => setError(reason instanceof Error ? reason.message : "读取委托草稿失败"))
      .finally(() => setLoading(false));
  }, []);

  async function submitDraft() {
    if (!preview) return;
    setSubmitting(true);
    setError(null);
    try {
      const response = await fetch("/api/qq/draft/submit", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ token, payloadHash: preview.payloadHash, confirmations }),
        cache: "no-store",
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error ?? "提交失败");
      setCaseUrl(data.caseUrl);
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "提交失败");
    } finally {
      setSubmitting(false);
    }
  }

  const fields = preview ? (Object.keys(LABELS) as Array<keyof typeof LABELS>) : [];
  const allConfirmed = confirmations.every(Boolean);

  return (
    <div className="min-h-screen bg-stone-50 px-4 py-6 dark:bg-slate-950">
      <div className="mx-auto max-w-xl space-y-4">
        <header className="rounded-3xl bg-slate-900 p-6 text-white shadow-lg">
          <FileCheck2 className="mb-4 h-9 w-9 text-amber-300" />
          <h1 className="text-2xl font-bold">委托最终确认</h1>
          <p className="mt-2 text-sm leading-6 text-slate-300">请完整核对 QQ 中生成的草稿。点击最终提交后将创建正式委托，无法使用本链接再次提交。</p>
        </header>

        {loading && <div className="flex items-center justify-center gap-2 rounded-2xl bg-background py-16 text-sm text-muted-foreground"><Loader2 className="h-5 w-5 animate-spin" />正在校验草稿...</div>}
        {preview && !caseUrl && (
          <>
            <Card>
              <CardHeader><CardTitle className="text-base">完整委托内容</CardTitle></CardHeader>
              <CardContent className="divide-y">
                {fields.map((key) => {
                  const value = preview.draft[key];
                  const display = key === "contentType" ? CONTENT_TYPES[String(value)] ?? String(value) : Array.isArray(value) ? value.join("、") : value || "未填写";
                  return <div key={key} className="py-3"><div className="text-xs font-medium text-muted-foreground">{LABELS[key]}</div><div className="mt-1 whitespace-pre-wrap break-words text-sm leading-6">{display}</div></div>;
                })}
              </CardContent>
            </Card>
            <Card className="border-amber-200 dark:border-amber-900">
              <CardHeader><CardTitle className="text-base">提交前逐项确认</CardTitle></CardHeader>
              <CardContent className="space-y-3">
                {CONFIRMATIONS.map((label, index) => (
                  <label key={label} className="flex cursor-pointer items-start gap-3 rounded-xl border p-3">
                    <input type="checkbox" className="mt-1 h-4 w-4" checked={confirmations[index]} onChange={() => setConfirmations((current) => current.map((value, item) => item === index ? !value : value))} />
                    <span className="text-sm leading-6">{label}</span>
                  </label>
                ))}
                <div className="flex gap-2 rounded-xl bg-amber-50 p-3 text-xs leading-5 text-amber-900 dark:bg-amber-950/40 dark:text-amber-200"><ShieldAlert className="mt-0.5 h-4 w-4 shrink-0" />服务器会重新校验草稿哈希、DCR 准入条件和敏感信息。草稿有变化或包含个人信息时将阻止提交。</div>
                <Button className="h-12 w-full rounded-xl" disabled={!allConfirmed || submitting} onClick={submitDraft}>{submitting && <Loader2 className="h-4 w-4 animate-spin" />}{submitting ? "正在最终提交..." : "最终确认并提交委托"}</Button>
              </CardContent>
            </Card>
          </>
        )}
        {caseUrl && <Card className="border-emerald-200 dark:border-emerald-900"><CardContent className="p-6 text-center"><CheckCircle2 className="mx-auto h-12 w-12 text-emerald-600" /><h2 className="mt-4 text-xl font-bold">委托已提交</h2><p className="mt-2 text-sm leading-6 text-muted-foreground">管理员审核前，仅您本人和管理员可以查看。</p><Button asChild className="mt-5 w-full"><Link href={caseUrl}>查看委托</Link></Button></CardContent></Card>}
        {error && <div role="alert" className="rounded-2xl bg-red-50 px-4 py-3 text-sm leading-6 text-red-800 dark:bg-red-950/40 dark:text-red-200">{error}</div>}
      </div>
    </div>
  );
}
