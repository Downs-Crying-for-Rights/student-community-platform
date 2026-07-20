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

class NapCatRequestError extends Error {
  constructor(message: string, readonly authorizationFailure = false) {
    super(message);
  }
}

const LOGIN_REFRESH_TIMEOUT_MS = 30_000;
const LOGIN_REFRESH_POLL_MS = 1_000;

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
      if (initial.isLogin) {
        await this.report(command, "SUCCEEDED", "QQ 当前已登录", initial);
        return;
      }
      if (initial.isOffline) {
        await this.napcat("/api/QQLogin/RestartNapCat", {});
        await this.waitForNapCatRecovery();
      }

      const recovered = await this.getLoginStatus();
      if (!recovered.isLogin) {
        await this.napcat("/api/QQLogin/RefreshQRcode", {});
      }
      const login = await this.waitForLoginCredential(recovered);
      await this.report(command, "SUCCEEDED", login.isLogin ? "QQ 当前已登录" : "登录凭据已刷新，请尽快完成验证", login);
    } catch (error) {
      await this.report(command, "FAILED", error instanceof Error ? error.message : "修复操作失败");
    }
  }

  private hasLoginCredential(login: QQBotLoginState): boolean {
    return Boolean(login.qrcode || login.captchaUrl || login.deviceVerificationUrl);
  }

  private async waitForNapCatRecovery(): Promise<void> {
    const deadline = Date.now() + LOGIN_REFRESH_TIMEOUT_MS;
    let consecutiveReadyChecks = 0;
    while (Date.now() < deadline) {
      await new Promise((resolve) => setTimeout(resolve, LOGIN_REFRESH_POLL_MS));
      try {
        const login = await this.getLoginStatus();
        consecutiveReadyChecks = login.isOffline ? 0 : consecutiveReadyChecks + 1;
        if (consecutiveReadyChecks >= 2) return;
      } catch {
        consecutiveReadyChecks = 0;
        // NapCat briefly disconnects while restarting.
      }
    }
    throw new Error("NapCat 重启超时");
  }

  private async waitForLoginCredential(previous: QQBotLoginState): Promise<QQBotLoginState> {
    const deadline = Date.now() + LOGIN_REFRESH_TIMEOUT_MS;
    while (Date.now() < deadline) {
      const login = await this.getLoginStatus();
      if (login.isLogin || (this.hasLoginCredential(login) && !this.sameLoginCredential(login, previous))) return login;
      await new Promise((resolve) => setTimeout(resolve, LOGIN_REFRESH_POLL_MS));
    }
    throw new Error("登录凭据生成超时");
  }

  private sameLoginCredential(left: QQBotLoginState, right: QQBotLoginState): boolean {
    return left.qrcode === right.qrcode &&
      left.captchaUrl === right.captchaUrl &&
      left.deviceVerificationUrl === right.deviceVerificationUrl;
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
    await this.authenticateNapCat();
    try {
      return await this.napcatRequest<T>(path, body, this.credential);
    } catch (error) {
      if (!(error instanceof NapCatRequestError) || !error.authorizationFailure) throw error;
      this.credential = "";
      await this.authenticateNapCat();
      return this.napcatRequest<T>(path, body, this.credential);
    }
  }

  private async authenticateNapCat(): Promise<void> {
    if (this.credential) return;
    const hash = createHash("sha256").update(`${this.napcatToken}.napcat`).digest("hex");
    const login = await this.napcatRequest<{ Credential?: string; require2FA?: boolean }>("/api/auth/login", { hash }, "");
    if (login.require2FA || !login.Credential) throw new Error("NapCat WebUI 鉴权失败");
    this.credential = login.Credential;
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
    if (!response.ok) throw new NapCatRequestError("NapCat WebUI 无响应", response.status === 401 || response.status === 403);
    const parsed = await response.json() as NapCatResponse<T>;
    if (parsed.code !== 0) throw new Error(parsed.message || "NapCat 操作失败");
    return parsed.data as T;
  }

  private async report(command: QQBotOperationCommand, status: QQBotOperationResult["status"], message: string, login?: QQBotLoginState): Promise<void> {
    await this.app.reportOperation({
      commandId: command.id,
      leaseToken: command.leaseToken,
      action: command.action,
      status,
      updatedAt: new Date().toISOString(),
      message: message.slice(0, 500),
      ...(login ? { login } : {}),
    });
  }
}
