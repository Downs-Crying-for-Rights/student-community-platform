export interface SmsProvider {
  sendCode(phone: string, code: string): Promise<boolean>;
}
