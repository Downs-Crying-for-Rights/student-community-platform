import type { SmsProvider } from "./types";
import { TestSmsProvider } from "./test-provider";
import { ProductionSmsProvider } from "./production-provider";
import { isSmsTestMode } from "./test-mode";

export type { SmsProvider };
export { isSmsTestMode } from "./test-mode";

export function getSmsProvider(): SmsProvider {
  if (isSmsTestMode()) {
    return new TestSmsProvider();
  }
  return new ProductionSmsProvider();
}
