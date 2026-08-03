"use client";

import { useEffect, useState } from "react";
import { signOut, useSession } from "next-auth/react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { PUNISHMENT_TYPE_LABELS } from "@/lib/punishment-policy";
import { readApiErrorMessage } from "@/lib/api-response";

interface PunishmentNotice {
  id: string;
  type: keyof typeof PUNISHMENT_TYPE_LABELS;
  reason: string;
  startsAt: string;
  expiresAt: string | null;
}

export function PunishmentGate() {
  const { status } = useSession();
  const [notices, setNotices] = useState<PunishmentNotice[]>([]);
  const [banned, setBanned] = useState(false);
  const [working, setWorking] = useState(false);
  const [appeal, setAppeal] = useState("");
  const [message, setMessage] = useState("");
  const [loadError, setLoadError] = useState("");

  useEffect(() => {
    if (status !== "authenticated") {
      setNotices([]);
      setBanned(false);
      setLoadError("");
      return;
    }
    let cancelled = false;
    const load = async () => {
      try {
        const response = await fetch("/api/punishments/status", { cache: "no-store" });
        if (!response.ok) {
          const error = await readApiErrorMessage(response, "账户状态获取失败");
          if (!cancelled) setLoadError(error);
          return;
        }
        const data = await response.json();
        if (!cancelled) {
          setLoadError("");
          setNotices(data.pendingAcknowledgements ?? []);
          setBanned(Boolean(data.status?.isBanned));
        }
      } catch {
        if (!cancelled) setLoadError("网络连接失败，无法获取账户状态");
      }
    };
    void load();
    const timer = window.setInterval(load, 30_000);
    return () => { cancelled = true; window.clearInterval(timer); };
  }, [status]);

  const current = notices[0];
  async function acknowledge() {
    if (!current) return;
    setWorking(true);
    setMessage("");
    try {
      const response = await fetch("/api/punishments/acknowledge", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ punishmentId: current.id }) });
      if (response.ok) setNotices((items) => items.slice(1));
      else setMessage(await readApiErrorMessage(response, "确认处罚通知失败"));
    } catch {
      setMessage("网络连接失败，确认处罚通知失败");
    }
    setWorking(false);
  }

  async function submitAppeal() {
    if (!current || !appeal.trim()) return;
    setWorking(true); setMessage("");
    const response = await fetch(`/api/punishments/${current.id}/appeal`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ content: appeal }) });
    const data = await response.json().catch(() => ({}));
    setMessage(response.ok ? "申诉已提交，可在客服支持中查看进度。" : data.error || "申诉提交失败");
    if (response.ok) setAppeal("");
    setWorking(false);
  }

  const hasBlockingNotice = Boolean(current || banned);
  return <Dialog
    open={Boolean(hasBlockingNotice || loadError)}
    onOpenChange={(open) => { if (!open && !hasBlockingNotice) setLoadError(""); }}
  >
    <DialogContent showCloseButton={!hasBlockingNotice} onEscapeKeyDown={(event) => { if (hasBlockingNotice) event.preventDefault(); }} onPointerDownOutside={(event) => { if (hasBlockingNotice) event.preventDefault(); }}>
      <DialogHeader><DialogTitle>{banned ? "账号已被封禁" : current ? PUNISHMENT_TYPE_LABELS[current.type] : "账户状态获取失败"}</DialogTitle></DialogHeader>
      {banned ? <div className="space-y-4 text-sm"><p>你的登录会话已因账号封禁受限。退出后使用账号密码重新验证，即可查看封禁原因和提交申诉。</p><Button onClick={() => void signOut({ callbackUrl: "/login?callbackUrl=%2Fban-appeal" })}>退出并前往申诉</Button></div> : current ? <div className="space-y-4 text-sm">
        <p className="whitespace-pre-wrap rounded-md bg-muted p-3">{current.reason}</p>
        <p className="text-muted-foreground">生效时间：{new Date(current.startsAt).toLocaleString("zh-CN")}<br />{current.expiresAt ? `到期时间：${new Date(current.expiresAt).toLocaleString("zh-CN")}` : "长期有效"}</p>
        <div className="space-y-2"><label className="font-medium" htmlFor="punishment-appeal">如有异议，可提交申诉</label><textarea id="punishment-appeal" value={appeal} onChange={(event) => setAppeal(event.target.value)} maxLength={5000} rows={4} className="w-full rounded-md border bg-background px-3 py-2" /><Button variant="outline" disabled={working || !appeal.trim()} onClick={submitAppeal}>提交申诉</Button></div>
        {message && <p role="status" className="rounded-md bg-muted p-3">{message}</p>}
        <Button className="w-full" disabled={working} onClick={acknowledge}>{working ? "确认中..." : "我已阅读并知悉"}</Button>
      </div> : loadError ? <div className="space-y-4 text-sm"><p role="alert" className="border border-destructive/30 bg-destructive/5 p-3 text-destructive">{loadError}</p><Button className="w-full" variant="outline" onClick={() => setLoadError("")}>关闭</Button></div> : null}
    </DialogContent>
  </Dialog>;
}
