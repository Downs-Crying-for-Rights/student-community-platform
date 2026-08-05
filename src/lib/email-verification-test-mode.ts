export function isEmailVerificationTestMode(): boolean {
  return process.env.NODE_ENV !== "production"
    && process.env.EMAIL_VERIFICATION_TEST_MODE === "true";
}
