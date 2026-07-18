"use client";

import { useState } from "react";
import { Flag, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { cn } from "@/lib/utils";

export type ReportTarget =
  | { targetUserId: string }
  | { targetPostId: string }
  | { targetCommentId: string }
  | { targetTaskId: string }
  | { targetCaseMessageId: string }
  | { targetHelpMessageId: string }
  | { targetDmMessageId: string }
  | { targetChatMessageId: string }
  | { targetChatRoomId: string };

export const REPORT_REASONS = [
  "垃圾信息或广告",
  "辱骂、骚扰或威胁",
  "泄露个人隐私",
  "欺诈、诱导转账或钓鱼",
  "危险、自伤或违法内容",
  "虚假信息或冒充他人",
  "其他违规内容",
] as const;

export function buildReportPayload(
  target: ReportTarget,
  reason: string,
  details: string,
) {
  return {
    ...target,
    reason,
    ...(details.trim() ? { details: details.trim() } : {}),
  };
}

interface ReportDialogProps {
  target: ReportTarget;
  label?: string;
  description?: string;
  compact?: boolean;
  className?: string;
  disabled?: boolean;
  onSubmitted?: () => void;
}

export function ReportDialog({
  target,
  label = "举报",
  description = "请选择最符合的原因，并补充有助于管理员判断的上下文。",
  compact = false,
  className,
  disabled = false,
  onSubmitted,
}: ReportDialogProps) {
  const [open, setOpen] = useState(false);
  const [reason, setReason] = useState<string>("");
  const [details, setDetails] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState(false);

  function reset() {
    setReason("");
    setDetails("");
    setError("");
    setSuccess(false);
  }

  async function submit() {
    if (!reason || submitting) return;
    setSubmitting(true);
    setError("");
    try {
      const response = await fetch("/api/reports", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(buildReportPayload(target, reason, details)),
      });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) {
        setError(data.error || "举报提交失败，请稍后重试");
        return;
      }
      setSuccess(true);
      onSubmitted?.();
    } catch {
      setError("网络错误，请检查连接后重试");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <Dialog
      open={open}
      onOpenChange={(nextOpen) => {
        setOpen(nextOpen);
        if (!nextOpen) reset();
      }}
    >
      <DialogTrigger asChild>
        <Button
          type="button"
          variant="ghost"
          size={compact ? "icon" : "sm"}
          disabled={disabled}
          className={cn(
            compact ? "h-7 w-7" : "gap-1.5",
            "text-muted-foreground hover:text-destructive",
            className,
          )}
          aria-label={label}
          title={label}
        >
          <Flag className={compact ? "h-3.5 w-3.5" : "h-4 w-4"} aria-hidden="true" />
          {!compact && <span>{label}</span>}
        </Button>
      </DialogTrigger>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>提交举报</DialogTitle>
          <DialogDescription>{description}</DialogDescription>
        </DialogHeader>

        {success ? (
          <div className="rounded-lg border border-green-200 bg-green-50 px-4 py-5 text-center text-sm text-green-800 dark:border-green-900 dark:bg-green-950/30 dark:text-green-200">
            举报已提交，管理员将尽快处理。请勿重复提交同一内容。
          </div>
        ) : (
          <div className="space-y-4">
            <fieldset className="space-y-2">
              <legend className="text-sm font-medium">举报原因</legend>
              {REPORT_REASONS.map((item) => (
                <label key={item} className="flex cursor-pointer items-start gap-2 rounded-lg border px-3 py-2 text-sm hover:bg-muted/50">
                  <input
                    type="radio"
                    name="report-reason"
                    value={item}
                    checked={reason === item}
                    onChange={() => setReason(item)}
                    className="mt-0.5"
                  />
                  <span>{item}</span>
                </label>
              ))}
            </fieldset>

            <div className="space-y-2">
              <Label htmlFor="report-details">补充说明（选填）</Label>
              <textarea
                id="report-details"
                value={details}
                onChange={(event) => setDetails(event.target.value)}
                maxLength={2000}
                rows={4}
                placeholder="例如发生时间、上下文或具体违规位置。请勿填写密码、验证码等敏感凭据。"
                className="w-full resize-y rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
              />
              <p className="text-right text-xs text-muted-foreground">{details.length}/2000</p>
            </div>
            {error && <p role="alert" className="text-sm text-destructive">{error}</p>}
          </div>
        )}

        <DialogFooter>
          {success ? (
            <Button type="button" onClick={() => setOpen(false)}>完成</Button>
          ) : (
            <>
              <Button type="button" variant="outline" onClick={() => setOpen(false)} disabled={submitting}>取消</Button>
              <Button type="button" variant="destructive" onClick={submit} disabled={!reason || submitting}>
                {submitting && <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />}
                提交举报
              </Button>
            </>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
