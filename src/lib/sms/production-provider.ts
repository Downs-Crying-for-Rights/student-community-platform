import Credential from "@alicloud/credentials";
import Dypnsapi20170525, * as $Dypnsapi20170525 from "@alicloud/dypnsapi20170525";
import * as $OpenApi from "@alicloud/openapi-client";
import * as $Util from "@alicloud/tea-util";

import type { SmsProvider } from "./types";

interface AliyunSmsClient {
  sendSmsVerifyCodeWithOptions(
    request: $Dypnsapi20170525.SendSmsVerifyCodeRequest,
    runtime: $Util.RuntimeOptions,
  ): Promise<$Dypnsapi20170525.SendSmsVerifyCodeResponse>;
}

export interface AliyunSmsConfig {
  signName: string;
  templateCodes: Record<string, string>;
  endpoint: string;
  connectTimeout: number;
  readTimeout: number;
}

function requiredEnv(name: string): string {
  const value = process.env[name]?.trim();
  if (!value) throw new Error(`Missing required SMS configuration: ${name}`);
  return value;
}

function timeoutEnv(name: string, fallback: number): number {
  const raw = process.env[name]?.trim();
  if (!raw) return fallback;
  const value = Number(raw);
  if (!Number.isInteger(value) || value < 1_000 || value > 30_000) {
    throw new Error(`${name} must be an integer between 1000 and 30000`);
  }
  return value;
}

export function loadAliyunSmsConfig(): AliyunSmsConfig {
  return {
    signName: requiredEnv("ALIYUN_SMS_SIGN_NAME"),
    templateCodes: {
      register: requiredEnv("ALIYUN_SMS_TEMPLATE_LOGIN"),
      "change-phone": requiredEnv("ALIYUN_SMS_TEMPLATE_CHANGE_PHONE"),
      "reset-password": requiredEnv("ALIYUN_SMS_TEMPLATE_RESET_PASSWORD"),
      bindphone: requiredEnv("ALIYUN_SMS_TEMPLATE_BIND_NEW_PHONE"),
      "verify-bound-phone": requiredEnv("ALIYUN_SMS_TEMPLATE_VERIFY_BOUND_PHONE"),
    },
    endpoint: process.env.ALIYUN_SMS_ENDPOINT?.trim() || "dypnsapi.aliyuncs.com",
    connectTimeout: timeoutEnv("ALIYUN_SMS_CONNECT_TIMEOUT_MS", 5_000),
    readTimeout: timeoutEnv("ALIYUN_SMS_READ_TIMEOUT_MS", 5_000),
  };
}

function createAliyunSmsClient(config: AliyunSmsConfig): AliyunSmsClient {
  const credential = new Credential();
  return new Dypnsapi20170525(new $OpenApi.Config({
    credential,
    endpoint: config.endpoint,
    connectTimeout: config.connectTimeout,
    readTimeout: config.readTimeout,
  }));
}

export class ProductionSmsProvider implements SmsProvider {
  private readonly client: AliyunSmsClient;
  private readonly config: AliyunSmsConfig;

  constructor(options?: { client?: AliyunSmsClient; config?: AliyunSmsConfig }) {
    this.config = options?.config ?? loadAliyunSmsConfig();
    this.client = options?.client ?? createAliyunSmsClient(this.config);
  }

  async sendCode(phone: string, code: string, purpose: string): Promise<boolean> {
    const templateCode = this.config.templateCodes[purpose];
    if (!templateCode) {
      console.error("Aliyun SMS purpose is not configured", { purpose });
      return false;
    }

    const request = new $Dypnsapi20170525.SendSmsVerifyCodeRequest({
      phoneNumber: phone,
      countryCode: "86",
      signName: this.config.signName,
      templateCode,
      templateParam: JSON.stringify({ code, min: "5" }),
      codeLength: 6,
      validTime: 300,
      duplicatePolicy: 1,
      interval: 60,
      returnVerifyCode: false,
      autoRetry: 0,
    });
    const runtime = new $Util.RuntimeOptions({
      autoretry: false,
      maxAttempts: 1,
      connectTimeout: this.config.connectTimeout,
      readTimeout: this.config.readTimeout,
    });

    try {
      const response = await this.client.sendSmsVerifyCodeWithOptions(request, runtime);
      if (response.body?.code === "OK" && response.body.success === true) return true;
      console.error("Aliyun SMS authentication rejected request", {
        code: response.body?.code ?? "UNKNOWN",
        message: response.body?.message ?? "Unknown error",
        requestId: response.body?.requestId ?? null,
      });
      return false;
    } catch (error) {
      const details = error as { code?: unknown; message?: unknown; requestId?: unknown };
      console.error("Aliyun SMS authentication request failed", {
        code: typeof details.code === "string" ? details.code : "REQUEST_FAILED",
        message: typeof details.message === "string" ? details.message : "Unknown error",
        requestId: typeof details.requestId === "string" ? details.requestId : null,
      });
      return false;
    }
  }
}
