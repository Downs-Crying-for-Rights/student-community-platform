"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { BadgeCheck, Camera, GraduationCap, Loader2, ShieldCheck } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { IdentityBadges } from "@/components/shared/IdentityBadges";

type Method = "STUDENT_DOCUMENT" | "ID_HOLDING_PHOTO" | "SCHOOL_UNIFORM" | "REAL_NAME_ID";
type SubmissionMethod = Exclude<Method, "REAL_NAME_ID">;
type Application = { id: string; method: Method; status: "PENDING" | "APPROVED" | "REJECTED" | "CANCELLED"; reviewNote: string | null; createdAt: string };

const METHODS: Array<{ value: SubmissionMethod; title: string; description: string }> = [
  { value: "STUDENT_DOCUMENT", title: "学生证件合照（学生认证）", description: "清晰实拍学生证照片与信息页、加盖学校印章的学生证明、录取通知书内页、有真实姓名的成绩通知单，或学校颁发的其他带姓名和照片的证件，并与写有“仅供DCR认证”的纸条同框。" },
  { value: "ID_HOLDING_PHOTO", title: "手持身份证半身照（真实身份认证）", description: "本人手持身份证人像面和写有“仅供DCR认证”的纸条拍摄半身照，确保本人、纸条及身份证信息清晰可见，并填写姓名和身份证号。" },
  { value: "SCHOOL_UNIFORM", title: "学校校服半身照（学生认证）", description: "穿着带有明确学校标识的校服，手持写有“仅供DCR认证”的纸条拍摄半身照，并填写学校名称。深圳统一校服不适用此方式。" },
];
const METHOD_TITLES: Record<Method, string> = { ...Object.fromEntries(METHODS.map((item) => [item.value, item.title])), REAL_NAME_ID: "姓名 + 身份证号（历史方式）" } as Record<Method, string>;

const STATUS_TEXT = { PENDING: "待管理员审核", APPROVED: "已通过", REJECTED: "未通过", CANCELLED: "已撤回" };

export default function IdentitySettingsPage() {
  const [application, setApplication] = useState<Application | null>(null);
  const [verification, setVerification] = useState({ realVerified: false, studentVerified: false });
  const [method, setMethod] = useState<SubmissionMethod>("STUDENT_DOCUMENT");
  const [file, setFile] = useState<File | null>(null);
  const [realName, setRealName] = useState("");
  const [idNumber, setIdNumber] = useState("");
  const [schoolName, setSchoolName] = useState("");
  const [methodConfirmed, setMethodConfirmed] = useState(false);
  const [confirmed, setConfirmed] = useState(false);
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [message, setMessage] = useState("");

  const load = useCallback(async () => {
    setLoading(true);
    const response = await fetch("/api/identity-verification", { cache: "no-store" });
    const data = await response.json().catch(() => ({}));
    if (response.ok) {
      setApplication(data.application);
      setVerification(data.verification);
    } else setMessage(data.error || "认证状态加载失败");
    setLoading(false);
  }, []);

  useEffect(() => { void load(); }, [load]);

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    setMessage("");
    if (!confirmed) { setMessage("请先确认身份材料处理规则"); return; }
    setSubmitting(true);
    try {
      if (!file) { setMessage("请选择认证照片"); return; }
      if (!methodConfirmed) { setMessage("请确认当前认证方式的材料要求"); return; }
      const body = new FormData();
      body.set("method", method); body.set("file", file); body.set("privacyConfirmed", "true");
      body.set("dcrOnlyNoteConfirmed", "true");
      if (method === "ID_HOLDING_PHOTO") { body.set("realName", realName); body.set("idNumber", idNumber); }
      if (method === "SCHOOL_UNIFORM") { body.set("schoolName", schoolName); body.set("nonShenzhenUniformConfirmed", "true"); }
      const response = await fetch("/api/identity-verification", { method: "POST", body });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) { setMessage(data.error || "申请提交失败"); return; }
      setMessage("身份认证申请已提交");
      setFile(null); setRealName(""); setIdNumber(""); setSchoolName(""); setConfirmed(false); setMethodConfirmed(false);
      await load();
    } catch { setMessage("网络错误，请稍后重试"); }
    finally { setSubmitting(false); }
  }

  const pending = application?.status === "PENDING";
  return (
    <main className="mx-auto max-w-3xl space-y-5 px-4 py-8 pb-24">
      <div>
        <Link href="/settings/profile" className="text-sm text-muted-foreground hover:text-foreground">返回设置</Link>
        <h1 className="mt-2 text-2xl font-bold">身份认证</h1>
        <p className="mt-1 text-sm text-muted-foreground">身份标签公开展示，真实姓名、身份证号和照片不会公开。</p>
      </div>

      <Card>
        <CardHeader><CardTitle className="flex items-center gap-2"><BadgeCheck className="h-5 w-5" />我的身份标签</CardTitle></CardHeader>
        <CardContent><IdentityBadges realVerified={verification.realVerified} studentVerified={verification.studentVerified} /></CardContent>
      </Card>

      {application && (
        <Card>
          <CardContent className="space-y-2 pt-6">
            <div className="flex items-center justify-between"><span className="font-medium">最近申请</span><span className="rounded-full bg-muted px-2 py-1 text-xs">{STATUS_TEXT[application.status]}</span></div>
            <p className="text-sm text-muted-foreground">{METHOD_TITLES[application.method]}</p>
            {application.reviewNote && <p className="rounded-md bg-muted p-3 text-sm">审核说明：{application.reviewNote}</p>}
          </CardContent>
        </Card>
      )}

      {!pending && (
        <Card>
          <CardHeader><CardTitle>提交认证申请</CardTitle></CardHeader>
          <CardContent>
            <form onSubmit={submit} className="space-y-5">
              <div className="grid gap-3 sm:grid-cols-2">
                {METHODS.map((item) => (
                  <button key={item.value} type="button" onClick={() => { setMethod(item.value); setMethodConfirmed(false); setMessage(""); }} className={`rounded-xl border p-4 text-left transition ${method === item.value ? "border-primary bg-primary/5 ring-1 ring-primary" : "hover:bg-muted/50"}`}>
                    <div className="flex items-center gap-2 font-medium"><Camera className="h-4 w-4" />{item.title}</div>
                    <p className="mt-2 text-xs leading-5 text-muted-foreground">{item.description}</p>
                  </button>
                ))}
              </div>

              {method === "ID_HOLDING_PHOTO" ? (
                <div className="space-y-4 rounded-xl border p-4">
                  <p className="text-sm text-muted-foreground">姓名和身份证号会加密保存，仅用于管理员将填写信息与手持证件照片进行人工核对。</p>
                  <div className="space-y-2"><Label htmlFor="real-name">真实姓名</Label><Input id="real-name" value={realName} onChange={(event) => setRealName(event.target.value)} autoComplete="name" /></div>
                  <div className="space-y-2"><Label htmlFor="id-number">身份证号</Label><Input id="id-number" value={idNumber} onChange={(event) => setIdNumber(event.target.value)} autoComplete="off" maxLength={18} /></div>
                  <div className="space-y-2"><Label htmlFor="identity-photo">手持身份证半身照</Label><Input id="identity-photo" type="file" accept="image/jpeg,image/png,image/webp" onChange={(event) => setFile(event.target.files?.[0] || null)} /></div>
                </div>
              ) : method === "SCHOOL_UNIFORM" ? (
                <div className="space-y-4 rounded-xl border p-4">
                  <div className="space-y-2"><Label htmlFor="school-name">学校名称</Label><Input id="school-name" value={schoolName} onChange={(event) => setSchoolName(event.target.value)} maxLength={100} placeholder="请输入校服所属学校全称" /></div>
                  <div className="space-y-2"><Label htmlFor="identity-photo">穿校服半身照</Label><Input id="identity-photo" type="file" accept="image/jpeg,image/png,image/webp" onChange={(event) => setFile(event.target.files?.[0] || null)} /></div>
                </div>
              ) : (
                <div className="space-y-3 rounded-xl border p-4">
                  <div className="flex items-start gap-2 text-sm"><GraduationCap className="mt-0.5 h-4 w-4 shrink-0" /><span>请确保证件信息完整，并与“仅供DCR认证”纸条在同一张实拍照片内。</span></div>
                  <div className="space-y-2"><Label htmlFor="identity-photo">认证照片</Label><Input id="identity-photo" type="file" accept="image/jpeg,image/png,image/webp" onChange={(event) => setFile(event.target.files?.[0] || null)} /></div>
                </div>
              )}

              <label className="flex items-start gap-2 text-sm"><input type="checkbox" checked={methodConfirmed} onChange={(event) => setMethodConfirmed(event.target.checked)} className="mt-1" /><span>{method === "SCHOOL_UNIFORM" ? "我确认照片中的校服具有明确学校标识，所用校服不是深圳统一校服，且纸条清晰写有“仅供DCR认证”。" : "我确认照片中的材料和写有“仅供DCR认证”的纸条清晰可见并处于同一画面。"}</span></label>
              <label className="flex items-start gap-2 text-sm"><input type="checkbox" checked={confirmed} onChange={(event) => setConfirmed(event.target.checked)} className="mt-1" /><span>我确认材料真实、自愿提交，并知悉材料仅用于 DCR 身份认证和管理员审核。</span></label>
              {message && <p className="text-sm text-destructive" role="alert">{message}</p>}
              <Button className="w-full" disabled={submitting || !confirmed || !methodConfirmed}>{submitting ? <><Loader2 className="h-4 w-4 animate-spin" />提交中...</> : <><ShieldCheck className="h-4 w-4" />提交管理员审核</>}</Button>
            </form>
          </CardContent>
        </Card>
      )}
      {loading && <p className="text-center text-sm text-muted-foreground">加载中...</p>}
    </main>
  );
}
