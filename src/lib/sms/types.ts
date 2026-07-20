export interface SmsProvider {
  sendCode(phone: string, code: string, purpose: string): Promise<boolean>;
}
