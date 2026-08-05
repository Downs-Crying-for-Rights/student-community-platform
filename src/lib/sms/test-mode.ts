export function isSmsTestMode(): boolean {
  return process.env.NODE_ENV !== "production" && process.env.SMS_TEST_MODE === "true";
}
