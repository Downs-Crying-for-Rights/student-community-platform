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
    if (savedEnabled && !enabled && !window.confirm("高风险操作：关闭后，仅知道手机号即可登录对应账号或重置其密码，也可绑定未占用手机号。确认仍要关闭？")) {
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
          控制短信登录、绑定手机号和重置密码是否必须发送并校验验证码。
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
                关闭时不发送短信，并允许相关流程直接跳过验证码字段。这会使仅知道手机号的人能够登录或重置对应账号密码，仅限明确接受该风险时使用。
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
