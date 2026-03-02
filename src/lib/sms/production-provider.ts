import type { SmsProvider } from "./types";

export class ProductionSmsProvider implements SmsProvider {
  async sendCode(phone: string, code: string): Promise<boolean> {
    // TODO: 调用外部短信 API (placeholder)
    throw new Error("Production SMS provider not configured");
  }
}
