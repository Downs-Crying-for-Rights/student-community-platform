"use client";

import { useEffect, useState } from "react";
import { Loader2, MessageSquareLock, Save } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";

export function SmsVerificationPanel() {
  const [enabled, setEnabled] = useState(true);
  const [savedEnabled, setSavedEnabled] = useState(true);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState("");

  useEffect(() => {
    fetch("/api/admin/system/config", { cache: "no-store" })
      .then(async (response) => {
        const data = await response.json();
        if (!response.ok) throw new Error(data.error || "读取配置失败");
        setEnabled(data.smsVerificationEnabled);
        setSavedEnabled(data.smsVerificationEnabled);
      })
      .catch((error) => setMessage(error instanceof Error ? error.message : "读取配置失败"))
      .finally(() => setLoading(false));
  }, []);

  async function save() {
    if (savedEnabled && !enabled && !window.confirm("高风险操作：关闭后，可跳过手机号绑定和密码重置验证码。注册验证码不受此开关影响。确认仍要关闭？")) {
      return;
    }
    setSaving(true);
    setMessage("");
    try {
      const response = await fetch("/api/admin/system/config", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ smsVerificationEnabled: enabled }),
        cache: "no-store",
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || "保存失败");
      setSavedEnabled(data.smsVerificationEnabled);
      setMessage("验证码策略已保存");
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "保存失败");
    } finally {
      setSaving(false);
    }
  }

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center gap-2">
          <MessageSquareLock className="h-5 w-5 text-primary" />
          <CardTitle>短信验证码策略</CardTitle>
        </div>
        <CardDescription>
          控制绑定手机号和重置密码是否必须发送并校验验证码；注册始终强制验证。
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        {loading ? (
          <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
        ) : (
          <label className="flex items-start gap-3 rounded-lg border p-4">
            <input
              type="checkbox"
              checked={enabled}
              onChange={(event) => setEnabled(event.target.checked)}
              className="mt-1 h-4 w-4 accent-primary"
            />
            <span>
              <span className="block font-medium">启用短信验证码</span>
              <span className="block text-sm text-muted-foreground">
                关闭时允许手机号绑定和密码重置跳过验证码，仅限应急使用。注册流程始终发送并校验短信验证码。
              </span>
            </span>
          </label>
        )}
        {message && <p className="text-sm text-muted-foreground" role="status">{message}</p>}
        <Button onClick={() => void save()} disabled={loading || saving}>
          {saving ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Save className="mr-2 h-4 w-4" />}
          保存策略
        </Button>
      </CardContent>
    </Card>
  );
}
