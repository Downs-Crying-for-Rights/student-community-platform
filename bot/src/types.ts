export const COMMANDS = ["帮助", "绑定", "注册", "状态", "新建委托", "取消", "草稿"] as const;

export type Command = (typeof COMMANDS)[number];

export type RoutedInput =
  | { type: "command"; command: Command; argument?: string }
  | { type: "text"; text: string };

export interface InternalMessageRequest {
  version: 1;
  eventId: string;
  platform: "onebot11";
  selfId: string;
  userId: string;
  occurredAt: string;
  input: RoutedInput;
}

export interface InternalMessageResponse {
  duplicate: boolean;
  replies: string[];
  conversation: {
    state: "idle" | "binding" | "delegation_form" | "draft";
    revision: string;
    prompt: string | null;
  };
}

export interface MessageApi {
  processMessage(request: InternalMessageRequest): Promise<InternalMessageResponse>;
}

export interface OutboxItem {
  id: string;
  userId: string;
  content: string;
}

export type OutboxErrorCode = "ONEBOT_REJECTED" | "ONEBOT_TIMEOUT" | "CONNECTION_LOST" | "ACTION_TOO_LARGE";

export type OutboxAck =
  | { success: true; providerMessageId?: string }
  | { success: false; errorCode: OutboxErrorCode };

export interface AppApi extends MessageApi {
  claimOutbox(selfId: string, status: QQBotRuntimeStatus): Promise<OutboxItem[]>;
  ackOutbox(id: string, ack: OutboxAck): Promise<void>;
}

export type QQBotOperationAction = "RESTART_WORKER" | "RESTART_NAPCAT" | "REFRESH_LOGIN";

export interface QQBotOperationCommand {
  id: string;
  leaseToken: string;
  action: QQBotOperationAction;
  requestedAt: string;
}

export interface QQBotLoginState {
  isLogin: boolean;
  isOffline: boolean;
  qrcode: string | null;
  captchaUrl: string | null;
  deviceVerificationUrl: string | null;
  loginError: string | null;
  smsSupported: false;
}

export interface QQBotOperationResult {
  commandId: string;
  leaseToken: string;
  action: QQBotOperationAction;
  status: "SUCCEEDED" | "FAILED";
  updatedAt: string;
  message: string;
  login?: QQBotLoginState;
}

export interface QQBotRuntimeStatus {
  oneBotConnected: boolean;
  accountOnline: boolean;
  checkedAt: string;
  reconnectAttemptedAt?: string;
  reconnectFailed?: boolean;
}

export interface OneBotPrivateMessageEvent {
  time: number;
  self_id: number | string;
  post_type: "message";
  message_type: "private";
  sub_type?: string;
  message_id: number | string;
  user_id: number | string;
  message: unknown;
  raw_message?: string;
}

export interface OneBotAction {
  action: string;
  params: Record<string, unknown>;
  echo?: string;
}

export interface OneBotActionResponse {
  status: "ok" | "failed";
  retcode: number;
  data?: Record<string, unknown> | null;
  echo: string;
}
