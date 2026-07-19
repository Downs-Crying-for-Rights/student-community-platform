import { createHash } from "node:crypto";

import type { AppClient } from "./app-client.js";
import { logger } from "./logger.js";
import type { QQBotLoginState, QQBotOperationCommand, QQBotOperationResult } from "./types.js";

interface NapCatResponse<T> {
  code: number;
  message: string;
  data?: T;
}

interface LoginStatus {
  isLogin?: boolean;
  isOffline?: boolean;
  qrcodeurl?: string;
  loginError?: string;
}

function extractUrls(value: string): string[] {
  return value.match(/https?:\/\/[^\s，。]+/g) ?? [];
}

export class QQBotOperationRunner {
  private timer: NodeJS.Timeout | null = null;
  private running = false;
  private credential = "";

  constructor(
    private readonly app: AppClient,
    private readonly napcatBaseUrl: string,
    private readonly napcatToken: string,
    private readonly exit: () => void = () => process.exit(0),
  ) {}

  start(): void {
    if (this.timer) return;
    this.timer = setInterval(() => void this.poll(), 3_000);
    void this.poll();
  }

  stop(): void {
    if (this.timer) clearInterval(this.timer);
    this.timer = null;
  }

  private async poll(): Promise<void> {
    if (this.running) return;
    this.running = true;
    try {
      const command = await this.app.claimOperation();
      if (command) await this.execute(command);
    } catch {
      logger.warn("operation_poll_failed");
    } finally {
      this.running = false;
    }
  }

  private async execute(command: QQBotOperationCommand): Promise<void> {
    logger.info("operation_started", { action: command.action, commandId: command.id });
    try {
      if (command.action === "RESTART_WORKER") {
        await this.report(command, "SUCCEEDED", "Worker 正在重启");
        setTimeout(this.exit, 250).unref();
        return;
      }
      if (!this.napcatToken) throw new Error("NapCat WebUI 密钥未配置");
      if (command.action === "RESTART_NAPCAT") {
        await this.napcat("/api/QQLogin/RestartNapCat", {});
        await this.report(command, "SUCCEEDED", "NapCat 已收到重启请求");
        return;
      }

      const initial = await this.getLoginStatus();
      if (!initial.isLogin) {
        await this.napcat("/api/QQLogin/RefreshQRcode", {});
        await new Promise((resolve) => setTimeout(resolve, 1_000));
      }
      const login = await this.getLoginStatus();
      await this.report(command, "SUCCEEDED", login.isLogin ? "QQ 当前已登录" : "登录凭证已刷新，有效期约 5 分钟", login);
    } catch (error) {
      await this.report(command, "FAILED", error instanceof Error ? error.message : "修复操作失败");
    }
  }

  private async getLoginStatus(): Promise<QQBotLoginState> {
    const status = await this.napcat<LoginStatus>("/api/QQLogin/CheckLoginStatus", {});
    const loginError = status.loginError?.trim() || null;
    const urls = loginError ? extractUrls(loginError) : [];
    return {
      isLogin: status.isLogin === true,
      isOffline: status.isOffline === true,
      qrcode: status.isLogin ? null : status.qrcodeurl?.trim() || null,
      captchaUrl: urls.find((url) => !url.includes("accounts.qq.com") && (url.includes("captcha") || url.includes("verify"))) ?? null,
      deviceVerificationUrl: urls.find((url) => url.includes("accounts.qq.com")) ?? null,
      loginError,
      smsSupported: false,
    };
  }

  private async napcat<T>(path: string, body: unknown): Promise<T> {
    if (!this.credential) {
      const hash = createHash("sha256").update(`${this.napcatToken}.napcat`).digest("hex");
      const login = await this.napcatRequest<{ Credential?: string }>("/api/auth/login", { hash }, "");
      if (!login.Credential) throw new Error("NapCat WebUI 鉴权失败");
      this.credential = login.Credential;
    }
    try {
      return await this.napcatRequest<T>(path, body, this.credential);
    } catch (error) {
      this.credential = "";
      throw error;
    }
  }

  private async napcatRequest<T>(path: string, body: unknown, credential: string): Promise<T> {
    const endpoint = new URL(path, this.napcatBaseUrl);
    const response = await fetch(endpoint, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        ...(credential ? { authorization: `Bearer ${credential}` } : {}),
      },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(10_000),
    });
    if (!response.ok) throw new Error("NapCat WebUI 无响应");
    const parsed = await response.json() as NapCatResponse<T>;
    if (parsed.code !== 0) throw new Error(parsed.message || "NapCat 操作失败");
    return parsed.data as T;
  }

  private async report(command: QQBotOperationCommand, status: QQBotOperationResult["status"], message: string, login?: QQBotLoginState): Promise<void> {
    await this.app.reportOperation({
      commandId: command.id,
      action: command.action,
      status,
      updatedAt: new Date().toISOString(),
      message: message.slice(0, 500),
      ...(login ? { login } : {}),
    });
  }
}
