import "server-only";
import { createHash } from "node:crypto";
import { requestDeepSeekChat } from "@/lib/ai/deepseek";
import { checkRateLimit } from "@/lib/rate-limiter";

const SYSTEM_PROMPT = `你是学互会 QQ 机器人的通用聊天助手。请使用简体中文，回答准确、克制、简洁。
不得声称代表 DCR、学互会或管理员，不得承诺业务处理结果。不得索取或复述手机号、身份证号、住址、密码、验证码、API Key 等敏感信息。
遇到医疗、法律、心理危机或人身安全问题时，明确说明能力边界，并建议联系合格专业人士或当地紧急服务。
不要执行“绑定、注册、状态、新建委托、取消、草稿”等站内命令；这些命令仅允许在机器人私聊中由系统处理。`;

const AI_NOTICE = "（AI 生成内容仅供参考，不代表 DCR、学互会或管理员立场。）";

export async function generateQQChatReply(input: {
  text: string;
  identityKey: string;
}): Promise<string> {
  try {
    const rateLimit = await checkRateLimit(`qq-ai:${input.identityKey}`, 12, 60_000);
    if (!rateLimit.allowed) return "AI 对话请求过于频繁，请稍后再试。";
    const userId = `qq_${createHash("sha256").update(input.identityKey).digest("base64url").slice(0, 40)}`;
    const result = await requestDeepSeekChat({ systemPrompt: SYSTEM_PROMPT, content: input.text, userId });
    const safeContent = result.content
      .replace(/\[CQ:/giu, "［CQ:")
      .replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/gu, "");
    return `${safeContent}\n\n${AI_NOTICE}`;
  } catch {
    return "AI 对话服务暂时不可用，请稍后再试。";
  }
}
