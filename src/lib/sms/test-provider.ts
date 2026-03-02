import type { SmsProvider } from "./types";

export class TestSmsProvider implements SmsProvider {
  async sendCode(phone: string, code: string): Promise<boolean> {
    console.log(`[TEST SMS] ${phone}: ${code}`);
    return true;
  }
}
