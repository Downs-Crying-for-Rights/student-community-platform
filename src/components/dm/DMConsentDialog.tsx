"use client";

import { useCallback, useEffect, useRef, useState } from "react";

import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";

interface ConsentStatus {
  title: string;
  content: string;
  version: number;
  accepted: boolean;
}

export function useDMConsent() {
  const [status, setStatus] = useState<ConsentStatus | null>(null);
  const [open, setOpen] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");
  const pendingAction = useRef<(() => void) | null>(null);

  const refresh = useCallback(async () => {
    const response = await fetch("/api/dm/consent");
    if (!response.ok) throw new Error("Unable to load DM consent");
    const data = await response.json() as ConsentStatus;
    setStatus(data);
    return data;
  }, []);

  useEffect(() => {
    refresh().catch(() => setError("无法加载私信授权文本，请稍后重试"));
  }, [refresh]);

  const ensureConsent = useCallback(async (action: () => void) => {
    pendingAction.current = action;
    try {
      const current = status ?? await refresh();
      if (current.accepted) {
        pendingAction.current = null;
        action();
      } else {
        setOpen(true);
      }
    } catch {
      setError("无法加载私信授权文本，请稍后重试");
      setOpen(true);
    }
  }, [refresh, status]);

  const accept = useCallback(async () => {
    if (!status || submitting) return;
    setSubmitting(true);
    setError("");
    try {
      const response = await fetch("/api/dm/consent", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ version: status.version }),
      });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) {
        if (data.consent) setStatus(data.consent);
        setError(data.error || "同意失败，请稍后重试");
        return;
      }
      setStatus(data);
      setOpen(false);
      const action = pendingAction.current;
      pendingAction.current = null;
      action?.();
    } catch {
      setError("网络错误，请稍后重试");
    } finally {
      setSubmitting(false);
    }
  }, [status, submitting]);

  const dialog = (
    <Dialog open={open} onOpenChange={(next) => { if (!next) pendingAction.current = null; setOpen(next); }}>
      <DialogContent className="max-w-lg" onInteractOutside={(event) => event.preventDefault()}>
        <DialogHeader><DialogTitle>{status?.title || "私信使用须知"}</DialogTitle></DialogHeader>
        <div className="max-h-[55vh] overflow-y-auto whitespace-pre-wrap text-sm leading-7 text-foreground">
          {status?.content || "正在加载授权文本..."}
        </div>
        {error && <p className="text-sm text-destructive" role="alert">{error}</p>}
        <div className="flex justify-end gap-2">
          <Button variant="outline" onClick={() => setOpen(false)}>不同意</Button>
          <Button onClick={accept} disabled={!status || submitting}>{submitting ? "提交中..." : "同意"}</Button>
        </div>
      </DialogContent>
    </Dialog>
  );

  return { ensureConsent, dialog };
}

export function DMConsentGate({ children }: { children: React.ReactNode }) {
  const { ensureConsent, dialog } = useDMConsent();
  const [allowed, setAllowed] = useState(false);

  useEffect(() => {
    void ensureConsent(() => setAllowed(true));
  }, [ensureConsent]);

  return <>{dialog}{allowed ? children : null}</>;
}
