"use client";

import { useState } from "react";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { FileText, Users, Shield, AlertTriangle } from "lucide-react";

/* ========== Document Data & Pure Helpers ========== */

export interface PolicyDocument {
  id: string;
  title: string;
  icon: "file-text" | "users" | "shield" | "alert-triangle";
  content: string;
}

const POLICY_DOCUMENTS: PolicyDocument[] = [
  {
    id: "user-agreement",
    title: "用户协议",
    icon: "file-text",
    content: `# 用户协议

## 一、账户注册与使用

1. 用户可通过邮箱魔法链接或邀请码注册平台账户。
2. 每个邮箱地址仅可注册一个账户，邀请码为一次性使用。
3. 用户应妥善保管自己的账户信息，因账户保管不善导致的损失由用户自行承担。

## 二、使用规则

1. 用户应遵守中华人民共和国相关法律法规及本平台社区规范。
2. 用户发布的内容应真实、合法，不得侵犯他人合法权益。
3. 用户不得利用平台从事任何违法违规活动。
4. 用户不得发布包含个人可识别信息（如真实姓名、学校名称、教师姓名、电话号码等）的内容。

## 三、账户终止

1. 用户可随时申请注销账户，注销后相关数据将按隐私政策处理。
2. 如用户严重违反本协议或社区规范，平台有权终止其账户使用权限。
3. 账户终止后，用户发布的公开内容将被保留但标记为"已注销用户"。

## 四、协议变更

1. 平台有权根据需要修改本协议内容，修改后将通知所有用户。
2. 用户在协议变更后继续使用平台，视为同意修改后的协议。`,
  },
  {
    id: "community-guidelines",
    title: "社区规范",
    icon: "users",
    content: `# 社区规范

## 一、行为准则

1. 尊重他人：不得发布侮辱、歧视、骚扰他人的内容。
2. 真实表达：鼓励真实、理性的交流，不传播未经证实的信息。
3. 保护隐私：不得泄露他人个人信息，包括但不限于姓名、联系方式、照片等。
4. 友善互助：营造积极、友善的社区氛围，互相帮助。

## 二、禁止行为

1. 发布违法违规内容，包括但不限于暴力、色情、赌博等。
2. 发布钓鱼内容，诱导他人提供个人信息或进行线下接触。
3. 恶意刷屏、灌水或发布垃圾信息。
4. 冒充他人身份或冒充平台官方。
5. 组织、指挥或实施任何形式的举报或对抗行动。
6. 发布包含真实姓名、学校名称、教师姓名等可识别信息的内容。

## 三、处罚规则

1. 首次违规：系统警告并删除违规内容。
2. 二次违规：限制发帖频率（每日 1 篇），持续 7 天。
3. 三次违规：账户封禁 30 天。
4. 严重违规：永久封禁账户。
5. 平台可根据违规严重程度直接采取更严厉的处罚措施。`,
  },
  {
    id: "privacy-policy",
    title: "隐私政策",
    icon: "shield",
    content: `# 隐私政策

## 一、数据收集

1. 注册信息：邮箱地址（或匿名标识），不收集真实姓名、手机号等非必要信息。
2. 使用数据：访问时间、页面浏览记录（仅用于改善服务）。
3. IP 地址：仅存储单向哈希值，不存储明文 IP。

## 二、数据存储

1. 所有用户数据存储在加密的数据库中。
2. 匿名会话数据在 90 天未活跃后自动清理。
3. 已关闭的工单数据在 180 天后进行脱敏归档。
4. 倾听会话记录在关闭后 30 天自动清理。

## 三、数据使用

1. 用户数据仅用于提供平台服务和改善用户体验。
2. 平台不会将用户数据出售或提供给第三方。
3. 审计日志用于平台安全审查，仅管理员可访问。

## 四、用户权利

1. 用户有权查看自己的个人数据。
2. 用户有权要求修改或删除自己的个人数据。
3. 用户有权要求导出自己的个人数据。
4. 用户有权撤回对数据处理的同意。`,
  },
  {
    id: "disclaimer",
    title: "免责声明",
    icon: "alert-triangle",
    content: `# 免责声明

## 一、平台定位

1. 本平台是学生交流社区，旨在提供信息互助和同伴支持。
2. 平台不组织、不指挥、不实施任何举报或对抗行动。
3. 平台不提供任何形式的法律建议或法律服务。
4. 平台不提供绕过任何平台或监管机制的技巧或方法。

## 二、心理交流区声明

1. 心理交流区提供的是非医疗性质的同伴支持，不替代专业心理咨询或治疗。
2. 倾听志愿者不具备专业心理咨询资质，其提供的支持仅为同伴陪伴。
3. 如遇紧急心理危机，请立即联系专业心理援助热线或可信赖的成年人。

## 三、紧急求助资源

1. 全国心理援助热线：400-161-9995
2. 北京心理危机研究与干预中心：010-82951332
3. 生命热线：400-821-1215
4. 如遇紧急情况，请拨打 110 或 120。

## 四、责任限制

1. 平台对用户发布的内容不承担直接责任，但会积极配合相关部门处理违法违规内容。
2. 平台不对因网络故障、系统维护等原因导致的服务中断承担责任。
3. 用户因使用平台服务而产生的任何纠纷，平台将协助但不承担连带责任。`,
  },
];

/* ========== Pure Helper Functions (exported for testing) ========== */

export function getDocumentTitle(docId: string): string {
  const doc = POLICY_DOCUMENTS.find((d) => d.id === docId);
  return doc ? doc.title : "";
}

export function getDocumentIds(): string[] {
  return POLICY_DOCUMENTS.map((d) => d.id);
}

export function isValidDocumentId(id: string): boolean {
  return POLICY_DOCUMENTS.some((d) => d.id === id);
}

export function getDocumentContent(docId: string): string {
  const doc = POLICY_DOCUMENTS.find((d) => d.id === docId);
  return doc ? doc.content : "";
}

export function getDocumentCount(): number {
  return POLICY_DOCUMENTS.length;
}

export function getAllDocuments(): PolicyDocument[] {
  return [...POLICY_DOCUMENTS];
}

/* ========== Icon Mapping ========== */

const ICON_MAP = {
  "file-text": FileText,
  users: Users,
  shield: Shield,
  "alert-triangle": AlertTriangle,
} as const;

/* ========== Page Component ========== */

export default function PoliciesPage() {
  const [activeTab, setActiveTab] = useState(POLICY_DOCUMENTS[0].id);

  return (
    <div className="min-h-screen bg-background">
      <div className="mx-auto max-w-3xl px-4 py-8">
        <div className="mb-8 text-center">
          <h1 className="text-2xl font-bold text-foreground">合规文档</h1>
          <p className="mt-2 text-sm text-muted-foreground">
            请仔细阅读以下文档，了解平台的使用规则和您的权利
          </p>
        </div>

        <Tabs value={activeTab} onValueChange={setActiveTab}>
          <TabsList className="mb-6 grid w-full grid-cols-4">
            {POLICY_DOCUMENTS.map((doc) => {
              const Icon = ICON_MAP[doc.icon];
              return (
                <TabsTrigger
                  key={doc.id}
                  value={doc.id}
                  className="flex items-center gap-1.5 text-xs sm:text-sm"
                >
                  <Icon className="h-4 w-4 shrink-0" aria-hidden="true" />
                  <span className="hidden sm:inline">{doc.title}</span>
                  <span className="sm:hidden">{doc.title.slice(0, 2)}</span>
                </TabsTrigger>
              );
            })}
          </TabsList>

          {POLICY_DOCUMENTS.map((doc) => (
            <TabsContent key={doc.id} value={doc.id}>
              <div className="rounded-2xl border bg-card p-6 shadow-sm">
                <article
                  className="prose prose-sm dark:prose-invert max-w-none"
                  role="article"
                  aria-label={doc.title}
                >
                  {doc.content.split("\n").map((line, i) => {
                    const trimmed = line.trim();
                    if (!trimmed) return null;
                    if (trimmed.startsWith("# ")) {
                      return (
                        <h2 key={i} className="mb-4 text-xl font-bold text-foreground">
                          {trimmed.slice(2)}
                        </h2>
                      );
                    }
                    if (trimmed.startsWith("## ")) {
                      return (
                        <h3 key={i} className="mb-3 mt-6 text-lg font-semibold text-foreground">
                          {trimmed.slice(3)}
                        </h3>
                      );
                    }
                    if (/^\d+\.\s/.test(trimmed)) {
                      return (
                        <p key={i} className="mb-2 pl-4 text-muted-foreground leading-relaxed">
                          {trimmed}
                        </p>
                      );
                    }
                    return (
                      <p key={i} className="mb-2 text-muted-foreground leading-relaxed">
                        {trimmed}
                      </p>
                    );
                  })}
                </article>
              </div>
            </TabsContent>
          ))}
        </Tabs>
      </div>
    </div>
  );
}
