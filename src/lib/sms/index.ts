import type { SmsProvider } from "./types";
import { TestSmsProvider } from "./test-provider";
import { ProductionSmsProvider } from "./production-provider";

export type { SmsProvider };

export function getSmsProvider(): SmsProvider {
  if (process.env.SMS_TEST_MODE === "true") {
    return new TestSmsProvider();
  }
  return new ProductionSmsProvider();
}
