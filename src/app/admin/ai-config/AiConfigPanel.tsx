"use client";

import { useEffect, useState } from "react";
import { Bot, KeyRound, Save, ShieldCheck } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

const targets = ["POST", "POST_REVISION", "REPORT", "CASE", "DISPUTE", "CHAT_ROOM"] as const;
const labels: Record<typeof targets[number], string> = { POST: "帖子", POST_REVISION: "帖子修订", REPORT: "举报", CASE: "DCR 委托", DISPUTE: "争议", CHAT_ROOM: "群聊" };

interface Config {
  enabled: boolean; baseUrl: string; defaultModel: string; complexModel: string;
  timeoutMs: number; maxInputChars: number; maxOutputTokens: number;
  reviewBasePrompt: string; targetInstructions: Record<string, string>; qqDraftPrompt: string;
  hasApiKey: boolean; source: string; revision: number;
}

export function AiConfigPanel() {
  const [config, setConfig] = useState<Config | null>(null);
  const [apiKey, setApiKey] = useState("");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState("");

  useEffect(() => {
    fetch("/api/admin/ai-config", { cache: "no-store" }).then(async (response) => {
      const body = await response.json();
      if (!response.ok) throw new Error(body.error || "加载失败");
      setConfig(body.config);
    }).catch((error) => setMessage(error.message)).finally(() => setLoading(false));
  }, []);

  const update = <K extends keyof Config>(key: K, value: Config[K]) => setConfig((current) => current ? { ...current, [key]: value } : current);
  const save = async () => {
    if (!config) return;
    setSaving(true); setMessage("");
    try {
      const response = await fetch("/api/admin/ai-config", {
        method: "PATCH", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          enabled: config.enabled, baseUrl: config.baseUrl, defaultModel: config.defaultModel,
          complexModel: config.complexModel, timeoutMs: Number(config.timeoutMs),
          maxInputChars: Number(config.maxInputChars), maxOutputTokens: Number(config.maxOutputTokens),
          reviewBasePrompt: config.reviewBasePrompt, targetInstructions: config.targetInstructions,
          qqDraftPrompt: config.qqDraftPrompt, ...(apiKey.trim() ? { apiKey: apiKey.trim() } : {}),
        }),
      });
      const body = await response.json();
      if (!response.ok) throw new Error(body.error || "保存失败");
      setApiKey(""); setMessage(`保存成功，配置版本 ${body.revision}`);
      setConfig((current) => current ? { ...current, source: "database", revision: body.revision, hasApiKey: current.hasApiKey || Boolean(apiKey.trim()) } : current);
    } catch (error) { setMessage(error instanceof Error ? error.message : "保存失败"); }
    finally { setSaving(false); }
  };

  if (loading || !config) return <div className="mx-auto max-w-6xl p-6 text-sm text-muted-foreground">正在加载 AI 配置...</div>;
  return <div className="mx-auto max-w-6xl space-y-6 p-4 sm:p-6">
    <div><h1 className="flex items-center gap-2 text-2xl font-bold"><Bot className="h-6 w-6" />AI 模块配置</h1><p className="mt-1 text-sm text-muted-foreground">管理审核模型、服务地址、密钥和分场景提示词。所有 AI 结论仍需人工确认。</p></div>
    {message && <div className={`rounded-lg border p-3 text-sm ${message.includes("成功") ? "border-emerald-200 bg-emerald-50 text-emerald-800" : "border-red-200 bg-red-50 text-red-700"}`}>{message}</div>}
    <Card><CardHeader><CardTitle className="flex items-center gap-2 text-base"><ShieldCheck className="h-4 w-4" />运行参数</CardTitle></CardHeader><CardContent className="grid gap-4 sm:grid-cols-2">
      <label className="flex items-center gap-3 rounded-lg border p-3"><input type="checkbox" checked={config.enabled} onChange={(event) => update("enabled", event.target.checked)} /><span><b>启用 AI 审核辅助</b><small className="block text-muted-foreground">关闭后回退至规则和人工审核</small></span></label>
      <div><Label>API 根地址</Label><Input value={config.baseUrl} onChange={(event) => update("baseUrl", event.target.value)} className="mt-1 font-mono" /><p className="mt-1 text-xs text-muted-foreground">仅允许 HTTPS 公网根地址；内网、本机、凭据、查询参数和重定向均会拒绝。</p></div>
      <div><Label>默认模型</Label><Input value={config.defaultModel} onChange={(event) => update("defaultModel", event.target.value)} className="mt-1 font-mono" /></div>
      <div><Label>复杂任务模型</Label><Input value={config.complexModel} onChange={(event) => update("complexModel", event.target.value)} className="mt-1 font-mono" /></div>
      <div><Label>超时（毫秒）</Label><Input type="number" value={config.timeoutMs} onChange={(event) => update("timeoutMs", Number(event.target.value))} className="mt-1" /></div>
      <div><Label>最大输入字符</Label><Input type="number" value={config.maxInputChars} onChange={(event) => update("maxInputChars", Number(event.target.value))} className="mt-1" /></div>
      <div><Label>最大输出 Token</Label><Input type="number" value={config.maxOutputTokens} onChange={(event) => update("maxOutputTokens", Number(event.target.value))} className="mt-1" /></div>
      <div><Label className="flex items-center gap-1"><KeyRound className="h-3.5 w-3.5" />API Key</Label><Input type="password" value={apiKey} onChange={(event) => setApiKey(event.target.value)} placeholder={config.hasApiKey ? "已配置，留空保持不变" : "输入新密钥"} className="mt-1 font-mono" /><p className="mt-1 text-xs text-muted-foreground">密钥加密保存且永不回显。</p></div>
    </CardContent></Card>
    <Card><CardHeader><CardTitle className="text-base">通用审核提示词</CardTitle></CardHeader><CardContent><textarea value={config.reviewBasePrompt} onChange={(event) => update("reviewBasePrompt", event.target.value)} className="min-h-48 w-full rounded-md border bg-background p-3 font-mono text-sm" /></CardContent></Card>
    <Card><CardHeader><CardTitle className="text-base">分场景审核指令</CardTitle></CardHeader><CardContent className="grid gap-4 lg:grid-cols-2">{targets.map((target) => <div key={target}><Label>{labels[target]} · {target}</Label><textarea value={config.targetInstructions[target] || ""} onChange={(event) => update("targetInstructions", { ...config.targetInstructions, [target]: event.target.value })} className="mt-1 min-h-32 w-full rounded-md border bg-background p-3 text-sm" /></div>)}</CardContent></Card>
    <Card><CardHeader><CardTitle className="text-base">QQ 委托预审提示词</CardTitle></CardHeader><CardContent><textarea value={config.qqDraftPrompt} onChange={(event) => update("qqDraftPrompt", event.target.value)} className="min-h-64 w-full rounded-md border bg-background p-3 font-mono text-sm" /></CardContent></Card>
    <div className="sticky bottom-4 flex items-center justify-between rounded-xl border bg-background/95 p-4 shadow-lg backdrop-blur"><span className="text-xs text-muted-foreground">来源：{config.source === "database" ? "后台配置" : "环境变量默认值"} · 版本 {config.revision}</span><Button onClick={() => void save()} disabled={saving}><Save className="mr-1 h-4 w-4" />{saving ? "保存中..." : "保存全部配置"}</Button></div>
  </div>;
}
