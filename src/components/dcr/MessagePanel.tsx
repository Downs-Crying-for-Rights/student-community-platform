"use client";

/* eslint-disable @next/next/no-img-element -- private signed case media is rendered at its original URL */

import { useState, useEffect, useRef, useCallback } from "react";
import { FileText, ImagePlus, Loader2, Mic, Paperclip, Send, Square, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { canSendMessage, formatMessageTime, isOwnMessage, type CaseStatus } from "@/lib/dcr-ui-helpers";
import { cn } from "@/lib/utils";
import { ReportDialog } from "@/components/shared/ReportDialog";

type MessageType = "TEXT" | "IMAGE" | "AUDIO" | "FILE";

export interface MessageItem {
  id: string;
  content: string;
  messageType?: MessageType;
  mediaUrl?: string | null;
  mediaName?: string | null;
  mediaMimeType?: string | null;
  mediaSize?: number | null;
  durationSeconds?: number | null;
  isAnonymous: boolean;
  senderId: string;
  createdAt: string;
}

interface PendingMedia {
  messageType: Exclude<MessageType, "TEXT">;
  url: string;
  name: string;
  mimeType: string;
  size: number;
  durationSeconds?: number;
}

export interface MessagePanelProps {
  caseId: string;
  currentUserId: string;
  caseStatus: CaseStatus;
  isSubmitter?: boolean;
}

function formatFileSize(size?: number | null): string {
  if (!size) return "";
  if (size < 1024 * 1024) return `${Math.ceil(size / 1024)} KB`;
  return `${(size / 1024 / 1024).toFixed(1)} MB`;
}

export function MessagePanel({ caseId, currentUserId, caseStatus, isSubmitter }: MessagePanelProps) {
  const [messages, setMessages] = useState<MessageItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [sending, setSending] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [recording, setRecording] = useState(false);
  const [content, setContent] = useState("");
  const [pendingMedia, setPendingMedia] = useState<PendingMedia | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [sendError, setSendError] = useState<string | null>(null);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const recorderRef = useRef<MediaRecorder | null>(null);
  const recorderChunksRef = useRef<Blob[]>([]);
  const recordingStartedAtRef = useRef(0);

  const scrollToBottom = useCallback(() => messagesEndRef.current?.scrollIntoView({ behavior: "smooth" }), []);

  const fetchMessages = useCallback(async () => {
    try {
      const res = await fetch(`/api/cases/${caseId}/messages`);
      const data = await res.json().catch(() => null);
      if (res.ok) {
        setMessages(data?.messages ?? []);
        setError(null);
      } else setError(data?.error ?? "加载消息失败");
    } catch {
      setError("网络错误，请检查连接后重试");
    } finally {
      setLoading(false);
    }
  }, [caseId]);

  useEffect(() => { fetchMessages(); }, [fetchMessages]);
  useEffect(() => {
    const interval = setInterval(fetchMessages, 15_000);
    const refresh = () => document.visibilityState === "visible" && fetchMessages();
    document.addEventListener("visibilitychange", refresh);
    return () => { clearInterval(interval); document.removeEventListener("visibilitychange", refresh); };
  }, [fetchMessages]);
  useEffect(() => { if (!loading && messages.length) scrollToBottom(); }, [loading, messages.length, scrollToBottom]);

  const uploadMedia = useCallback(async (file: File, durationSeconds?: number) => {
    setUploading(true);
    setSendError(null);
    try {
      const form = new FormData();
      form.append("file", file);
      const res = await fetch("/api/upload/case-media", { method: "POST", body: form });
      const data = await res.json().catch(() => null);
      if (!res.ok) throw new Error(data?.error || "上传失败");
      setPendingMedia({
        messageType: data.messageType,
        url: data.url,
        name: data.name,
        mimeType: data.mimeType,
        size: data.size,
        durationSeconds,
      });
    } catch (uploadError) {
      setSendError(uploadError instanceof Error ? uploadError.message : "上传失败");
    } finally {
      setUploading(false);
      if (fileInputRef.current) fileInputRef.current.value = "";
    }
  }, []);

  const startRecording = async () => {
    if (!navigator.mediaDevices?.getUserMedia || typeof MediaRecorder === "undefined") {
      setSendError("当前浏览器不支持录音，请改为上传音频文件");
      return;
    }
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const mimeType = MediaRecorder.isTypeSupported("audio/webm") ? "audio/webm" : "audio/ogg";
      const recorder = new MediaRecorder(stream, { mimeType });
      recorderChunksRef.current = [];
      recorder.ondataavailable = (event) => { if (event.data.size) recorderChunksRef.current.push(event.data); };
      recorder.onstop = () => {
        const duration = Math.max(1, Math.round((Date.now() - recordingStartedAtRef.current) / 1000));
        const blob = new Blob(recorderChunksRef.current, { type: recorder.mimeType });
        stream.getTracks().forEach((track) => track.stop());
        void uploadMedia(new File([blob], `recording-${Date.now()}.webm`, { type: recorder.mimeType }), duration);
      };
      recorderRef.current = recorder;
      recordingStartedAtRef.current = Date.now();
      recorder.start();
      setRecording(true);
      setSendError(null);
    } catch {
      setSendError("无法使用麦克风，请检查浏览器权限");
    }
  };

  const stopRecording = () => {
    recorderRef.current?.stop();
    recorderRef.current = null;
    setRecording(false);
  };

  const handleSend = async (event: React.FormEvent) => {
    event.preventDefault();
    const trimmed = content.trim();
    if ((!trimmed && !pendingMedia) || sending || uploading || recording) return;
    setSending(true);
    setSendError(null);
    try {
      const res = await fetch(`/api/cases/${caseId}/messages`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          content: trimmed,
          messageType: pendingMedia?.messageType ?? "TEXT",
          mediaUrl: pendingMedia?.url,
          mediaName: pendingMedia?.name,
          mediaMimeType: pendingMedia?.mimeType,
          mediaSize: pendingMedia?.size,
          durationSeconds: pendingMedia?.durationSeconds,
        }),
      });
      const data = await res.json().catch(() => null);
      if (!res.ok) throw new Error(data?.error || "发送失败，请稍后重试");
      setMessages((prev) => [...prev, data.message]);
      setContent("");
      setPendingMedia(null);
      setTimeout(scrollToBottom, 50);
    } catch (sendFailure) {
      setSendError(sendFailure instanceof Error ? sendFailure.message : "发送失败，请稍后重试");
    } finally {
      setSending(false);
    }
  };

  const showSendForm = canSendMessage(caseStatus, isSubmitter);

  return (
    <Card>
      <CardHeader><CardTitle className="text-lg">工单回复</CardTitle></CardHeader>
      <CardContent>
        {loading && <div className="flex items-center justify-center py-8"><Loader2 className="h-5 w-5 animate-spin" /><span className="ml-2 text-sm text-muted-foreground">加载消息中...</span></div>}
        {!loading && error && <div role="alert" className="rounded-lg bg-red-50 px-4 py-3 text-sm text-red-800">{error}</div>}
        {!loading && !error && <>
          <div className="max-h-96 space-y-3 overflow-y-auto" role="log" aria-label="消息列表" aria-live="polite">
            {!messages.length ? <p className="py-4 text-center text-sm text-muted-foreground">暂无回复</p> : messages.map((msg) => {
              const own = isOwnMessage(msg.senderId, currentUserId);
              const type = msg.messageType ?? "TEXT";
              return <div key={msg.id} className={cn("flex items-end gap-1", own ? "justify-end" : "justify-start")}>
                <div className={cn("max-w-[82%] rounded-2xl px-4 py-2", own ? "bg-primary text-primary-foreground" : "bg-muted text-foreground")}>
                  {type === "IMAGE" && msg.mediaUrl && <a href={msg.mediaUrl} target="_blank" rel="noreferrer"><img src={msg.mediaUrl} alt={msg.mediaName || "工单图片"} className="mb-2 max-h-72 rounded-lg object-contain" /></a>}
                  {type === "AUDIO" && msg.mediaUrl && <div className="mb-2"><audio controls preload="metadata" src={msg.mediaUrl} className="max-w-full" /><p className="mt-1 text-xs opacity-70">录音 {msg.durationSeconds ? `${msg.durationSeconds} 秒` : ""}</p></div>}
                  {type === "FILE" && msg.mediaUrl && <a href={msg.mediaUrl} target="_blank" rel="noreferrer" className="mb-2 flex items-center gap-2 rounded-lg border border-current/20 p-2 text-sm underline"><FileText className="h-5 w-5" /><span>{msg.mediaName || "查看附件"} {formatFileSize(msg.mediaSize)}</span></a>}
                  {msg.content && !/^\[(图片|录音|附件)\]$/.test(msg.content) && <p className="whitespace-pre-wrap break-words text-sm">{msg.content}</p>}
                  <p className={cn("mt-1 text-xs", own ? "text-primary-foreground/70" : "text-muted-foreground")}>{formatMessageTime(msg.createdAt)}</p>
                </div>
                {!own && <ReportDialog target={{ targetCaseMessageId: msg.id }} label="举报工单消息" compact />}
              </div>;
            })}
            <div ref={messagesEndRef} />
          </div>

          {showSendForm && <form onSubmit={handleSend} className="mt-4 space-y-2" aria-label="发送工单回复">
            {pendingMedia && <div className="flex items-center justify-between rounded-lg border bg-muted/40 p-2 text-sm"><span className="flex items-center gap-2">{pendingMedia.messageType === "IMAGE" ? <ImagePlus className="h-4 w-4" /> : pendingMedia.messageType === "AUDIO" ? <Mic className="h-4 w-4" /> : <Paperclip className="h-4 w-4" />}{pendingMedia.name} {formatFileSize(pendingMedia.size)}</span><button type="button" onClick={() => setPendingMedia(null)} aria-label="移除附件"><X className="h-4 w-4" /></button></div>}
            <div className="flex gap-2">
              <input ref={fileInputRef} type="file" className="hidden" accept="image/*,audio/*,.pdf,.txt,.doc,.docx,.xls,.xlsx,.zip" onChange={(e) => { const file = e.target.files?.[0]; if (file) void uploadMedia(file); }} />
              <Button type="button" size="icon" variant="outline" disabled={sending || uploading || recording} onClick={() => fileInputRef.current?.click()} aria-label="发送图片、音频或附件"><Paperclip className="h-4 w-4" /></Button>
              <Button type="button" size="icon" variant={recording ? "destructive" : "outline"} disabled={sending || uploading} onClick={recording ? stopRecording : startRecording} aria-label={recording ? "停止录音" : "开始录音"}>{recording ? <Square className="h-4 w-4" /> : <Mic className="h-4 w-4" />}</Button>
              <input type="text" value={content} onChange={(e) => { setContent(e.target.value); setSendError(null); }} placeholder={recording ? "正在录音..." : uploading ? "正在上传..." : "输入回复，可同时附带文件..."} maxLength={2000} className="flex-1 rounded-xl border bg-background px-3 py-2 text-sm" disabled={sending || recording} />
              <Button type="submit" size="icon" disabled={sending || uploading || recording || (!content.trim() && !pendingMedia)} aria-label="发送">{sending || uploading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}</Button>
            </div>
            {recording && <p className="text-xs text-red-600">正在录音，点击红色停止按钮完成录制</p>}
          </form>}
          {sendError && <p role="alert" className="mt-2 text-xs text-red-600">{sendError}</p>}
        </>}
      </CardContent>
    </Card>
  );
}
