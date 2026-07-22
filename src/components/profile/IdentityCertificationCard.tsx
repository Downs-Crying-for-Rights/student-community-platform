"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useSession } from "next-auth/react";
import { BadgeCheck, Loader2, ShieldX } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";

type IdentityState = {
  verification: { realVerified: boolean; studentVerified: boolean };
  application: { id: string; status: "PENDING" | "APPROVED" | "REJECTED" | "CANCELLED"; reviewNote: string | null } | null;
  revocationRequest: { id: string; scope: "STUDENT" | "ALL"; status: "PENDING" | "APPROVED" | "REJECTED" | "CANCELLED"; reviewNote: string | null } | null;
};

export function IdentityCertificationCard({ compact = false }: { compact?: boolean }) {
  const { update } = useSession();
  const [state, setState] = useState<IdentityState | null>(null);
  const [scope, setScope] = useState<"STUDENT" | "ALL">("STUDENT");
  const [reason, setReason] = useState("");
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const refreshedRequest = useRef<string | null>(null);

  const load = useCallback(async () => {
    const response = await fetch("/api/identity-verification", { cache: "no-store" });
    const data = await response.json().catch(() => ({}));
    if (response.ok) setState(data);
    else setMessage(data.error || "认证状态加载失败");
  }, []);

  useEffect(() => { void load(); }, [load]);
  useEffect(() => {
    if (state?.revocationRequest?.status === "APPROVED" && refreshedRequest.current !== state.revocationRequest.id) {
      refreshedRequest.current = state.revocationRequest.id;
      void update();
    }
  }, [state?.revocationRequest, update]);

  async function withdraw() {
    if (!window.confirm("撤回后认证材料会立即停止访问并清理，确认撤回？")) return;
    setBusy(true); setMessage("");
    const response = await fetch("/api/identity-verification", { method: "DELETE" });
    const data = await response.json().catch(() => ({}));
    setMessage(response.ok ? "申请已撤回，认证材料已安排清理" : data.error || "撤回失败");
    if (response.ok) await load();
    setBusy(false);
  }

  async function requestRevocation(event: React.FormEvent) {
    event.preventDefault();
    setBusy(true); setMessage("");
    const response = await fetch("/api/identity-verification/revocation", {
      method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ scope: state?.verification.studentVerified ? scope : "ALL", reason }),
    });
    const data = await response.json().catch(() => ({}));
    setMessage(response.ok ? "撤销申请已提交，等待管理员审核" : data.error || "提交失败");
    if (response.ok) { setReason(""); await load(); }
    setBusy(false);
  }

  if (!state) return null;
  const pendingApplication = state.application?.status === "PENDING";
  const pendingRevocation = state.revocationRequest?.status === "PENDING";
  const verified = state.verification.realVerified || state.verification.studentVerified;

  return (
    <Card className={compact ? "mb-6 w-full" : undefined}>
      <CardHeader><CardTitle className="flex items-center gap-2 text-lg"><BadgeCheck className="h-5 w-5" />认证指引</CardTitle></CardHeader>
      <CardContent className="space-y-4 text-sm">
        {pendingApplication ? (
          <div className="space-y-3">
            <p>认证申请正在等待管理员审核。若材料有误，可在审核前撤回并重新提交。</p>
            <Button type="button" variant="outline" disabled={busy} onClick={() => void withdraw()}>{busy && <Loader2 className="h-4 w-4 animate-spin" />}撤回待审核申请</Button>
          </div>
        ) : pendingRevocation ? (
          <p>你的{state.revocationRequest?.scope === "STUDENT" ? "学生认证" : "全部认证"}撤销申请正在等待管理员审核。</p>
        ) : verified ? (
          <form className="space-y-3" onSubmit={requestRevocation}>
            <p>认证已完成。如不再希望展示认证标签，可申请撤销。撤销全部认证后，身份防重复校验记录仍会保留。</p>
            {state.verification.studentVerified && (
              <div className="flex flex-wrap gap-2">
                <Button type="button" size="sm" variant={scope === "STUDENT" ? "default" : "outline"} onClick={() => setScope("STUDENT")}>仅撤销学生认证</Button>
                <Button type="button" size="sm" variant={scope === "ALL" ? "default" : "outline"} onClick={() => setScope("ALL")}>撤销全部认证</Button>
              </div>
            )}
            {!state.verification.studentVerified && <p className="text-muted-foreground">将申请撤销真实身份认证。</p>}
            <Input value={reason} onChange={(event) => setReason(event.target.value)} maxLength={500} placeholder="请填写撤销原因（至少 5 个字）" />
            <Button disabled={busy || reason.trim().length < 5} variant="outline"><ShieldX className="h-4 w-4" />提交撤销申请</Button>
          </form>
        ) : state.revocationRequest?.status === "APPROVED" ? (
          <p>认证标签已按申请撤销。如需重新认证，请联系管理员确认后续处理方式。</p>
        ) : (
          <div className="space-y-3">
            <p>完成身份认证后可获得公开认证标签，真实姓名、证件号码和认证照片不会公开。</p>
            <Button asChild><Link href="/settings/identity">了解并申请认证</Link></Button>
          </div>
        )}
        {state.revocationRequest?.status === "REJECTED" && state.revocationRequest.reviewNote && <p className="rounded-md bg-muted p-3">最近撤销申请未通过：{state.revocationRequest.reviewNote}</p>}
        {message && <p className="text-sm text-muted-foreground" role="status">{message}</p>}
      </CardContent>
    </Card>
  );
}
