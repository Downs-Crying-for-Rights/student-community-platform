export const CAPTCHA_PURPOSES = [
  "login-email",
  "login-password",
  "register",
  "bindphone",
  "password-reset",
] as const;

export type CaptchaPurpose = (typeof CAPTCHA_PURPOSES)[number];

export const CAPTCHA_CODE_LENGTH = 5;
export const CAPTCHA_PROOF_PATTERN = /^[A-Za-z0-9_-]{32}$/;
