"use client";

import { useEffect, useState } from "react";
import { Loader2, LockKeyhole, Save, ShieldCheck } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import {
  DEFAULT_PHONE_REQUIRED_AREAS,
  type PhoneRequiredAreas,
} from "@/lib/phone-policy-shared";

interface PolicyState {
  emailRegistrationEnabled: boolean;
  inviteRegistrationEnabled: boolean;
  qqRegistrationEnabled: boolean;
  registrationPhoneRequired: boolean;
  phoneRequiredAreas: PhoneRequiredAreas;
}

const defaults: PolicyState = {
  emailRegistrationEnabled: true,
  inviteRegistrationEnabled: true,
  qqRegistrationEnabled: true,
  registrationPhoneRequired: false,
  phoneRequiredAreas: DEFAULT_PHONE_REQUIRED_AREAS,
};

const areaOptions: Array<{ key: keyof PhoneRequiredAreas; title: string; description: string }> = [
  { key: "communityBrowse", title: "首页、发现与帖子浏览", description: "限制首页、发现、搜索和帖子详情。未登录访客仍可浏览公开内容。" },
  { key: "contentCreate", title: "发布与编辑内容", description: "限制发布、编辑和删除帖子。" },
  { key: "communityInteract", title: "评论与互动", description: "限制评论、点赞和收藏。" },
  { key: "messages", title: "消息与私信", description: "限制通知列表、私信列表和私信发送。" },
  { key: "groupChat", title: "群聊", description: "限制群聊列表、房间访问、加入和发言。" },
  { key: "psychology", title: "心理互助", description: "限制心理互助页面及相关接口。" },
  { key: "support", title: "客服与申诉工单", description: "限制客服工单的查看、创建和回复。" },
  { key: "profile", title: "个人主页与设置", description: "限制个人主页和账号设置；手机号绑定页始终可访问。" },
];

function ToggleRow({ checked, onChange, title, description, disabled = false }: {
  checked: boolean;
  onChange: (checked: boolean) => void;
  title: string;
  description: string;
  disabled?: boolean;
}) {
  return (
    <label className={`flex items-start gap-3 border-b py-4 last:border-b-0 ${disabled ? "opacity-60" : "cursor-pointer"}`}>
      <input
        type="checkbox"
        checked={checked}
        onChange={(event) => onChange(event.target.checked)}
        disabled={disabled}
        className="mt-1 h-4 w-4 accent-primary"
      />
      <span>
        <span className="block font-medium">{title}</span>
        <span className="block text-sm text-muted-foreground">{description}</span>
      </span>
    </label>
  );
}

export function PhoneAccessPolicyPanel() {
  const [policy, setPolicy] = useState<PolicyState>(defaults);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState("");

  useEffect(() => {
    fetch("/api/admin/system/config", { cache: "no-store" })
      .then(async (response) => {
        const data = await response.json();
        if (!response.ok) throw new Error(data.error || "读取访问策略失败");
        setPolicy({
          emailRegistrationEnabled: data.emailRegistrationEnabled,
          inviteRegistrationEnabled: data.inviteRegistrationEnabled,
          qqRegistrationEnabled: data.qqRegistrationEnabled,
          registrationPhoneRequired: data.registrationPhoneRequired,
          phoneRequiredAreas: data.phoneRequiredAreas,
        });
      })
      .catch((error) => setMessage(error instanceof Error ? error.message : "读取访问策略失败"))
      .finally(() => setLoading(false));
  }, []);

  function update<K extends keyof PolicyState>(key: K, value: PolicyState[K]) {
    setPolicy((current) => ({ ...current, [key]: value }));
  }

  function setRegistrationPhoneRequired(required: boolean) {
    setPolicy((current) => ({
      ...current,
      registrationPhoneRequired: required,
      qqRegistrationEnabled: required ? false : current.qqRegistrationEnabled,
    }));
  }

  async function save() {
    setSaving(true);
    setMessage("");
    try {
      const response = await fetch("/api/admin/system/config", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(policy),
        cache: "no-store",
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || "保存访问策略失败");
      setMessage("手机号访问策略已保存，新请求立即生效");
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "保存访问策略失败");
    } finally {
      setSaving(false);
    }
  }

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center gap-2">
          <LockKeyhole className="h-5 w-5 text-primary" />
          <CardTitle>手机号访问策略</CardTitle>
        </div>
        <CardDescription>控制注册渠道，并指定已登录用户进入哪些区域前必须绑定手机号。</CardDescription>
      </CardHeader>
      <CardContent className="space-y-6">
        {loading ? <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" /> : <>
          <section>
            <h3 className="text-sm font-semibold">注册方式</h3>
            <ToggleRow checked={policy.emailRegistrationEnabled} onChange={(value) => update("emailRegistrationEnabled", value)} title="开放邮箱注册" description="允许用户使用邮箱、密码和昵称创建账号。" />
            <ToggleRow checked={policy.inviteRegistrationEnabled} onChange={(value) => update("inviteRegistrationEnabled", value)} title="开放邀请码注册" description="允许用户使用邀请码创建账号。" />
            <ToggleRow checked={policy.qqRegistrationEnabled} onChange={(value) => update("qqRegistrationEnabled", value)} disabled={policy.registrationPhoneRequired} title="开放 QQ 机器人注册" description={policy.registrationPhoneRequired ? "强制注册手机号时不可使用 QQ 机器人注册。" : "允许通过个人 QQ 机器人完成账号注册。"} />
            <ToggleRow checked={policy.registrationPhoneRequired} onChange={setRegistrationPhoneRequired} title="注册时强制验证手机号" description="邮箱和邀请码注册必须填写手机号及短信验证码；开启时会自动关闭 QQ 机器人注册。" />
          </section>

          <section>
            <h3 className="text-sm font-semibold">区域访问限制</h3>
            {areaOptions.map((option) => (
              <ToggleRow
                key={option.key}
                checked={policy.phoneRequiredAreas[option.key]}
                onChange={(value) => update("phoneRequiredAreas", { ...policy.phoneRequiredAreas, [option.key]: value })}
                title={option.title}
                description={option.description}
              />
            ))}
          </section>

          <div className="flex items-start gap-3 border-t pt-4">
            <ShieldCheck className="mt-0.5 h-5 w-5 shrink-0 text-emerald-600" />
            <p className="text-sm text-muted-foreground">DCR 准入始终要求手机号验证，不受以上开关影响。后台管理区域也不会被这些开关锁定。</p>
          </div>
        </>}
        {message && <p className="text-sm text-muted-foreground" role="status">{message}</p>}
        <Button onClick={() => void save()} disabled={loading || saving}>
          {saving ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Save className="mr-2 h-4 w-4" />}
          保存访问策略
        </Button>
      </CardContent>
    </Card>
  );
}
