import { NextResponse } from "next/server";

export const SUPPORT_STATUSES = [
  "OPEN",
  "IN_PROGRESS",
  "WAITING_FOR_USER",
  "RESOLVED",
  "CLOSED",
] as const;

export type SupportStatus = (typeof SUPPORT_STATUSES)[number];

export const SUPPORT_STATUS_LABELS: Record<SupportStatus, string> = {
  OPEN: "待处理",
  IN_PROGRESS: "处理中",
  WAITING_FOR_USER: "等待用户回复",
  RESOLVED: "已解决",
  CLOSED: "已关闭",
};

export const supportTicketSelect = {
  id: true,
  kind: true,
  subject: true,
  status: true,
  priority: true,
  createdAt: true,
  updatedAt: true,
  resolvedAt: true,
  closedAt: true,
  assignedTo: { select: { id: true, nickname: true } },
  punishment: { select: { id: true, type: true, reason: true, startsAt: true, expiresAt: true, revokedAt: true } },
} as const;

export const supportMessageSelect = {
  id: true,
  content: true,
  authorType: true,
  createdAt: true,
  author: { select: { id: true, nickname: true } },
} as const;

export function noStoreJson(body: unknown, init?: ResponseInit) {
  const response = NextResponse.json(body, init);
  response.headers.set("Cache-Control", "private, no-store, no-cache, must-revalidate");
  return response;
}

export function asNextResponse(response: Response) {
  const nextResponse = new NextResponse(response.body, {
    status: response.status,
    statusText: response.statusText,
    headers: response.headers,
  });
  nextResponse.headers.set("Cache-Control", "private, no-store, no-cache, must-revalidate");
  return nextResponse;
}

export function readRequiredText(value: unknown, maxLength: number): string | null {
  if (typeof value !== "string") return null;
  const text = value.trim();
  return text.length > 0 && text.length <= maxLength ? text : null;
}

export function isSupportStatus(value: unknown): value is SupportStatus {
  return typeof value === "string" && SUPPORT_STATUSES.includes(value as SupportStatus);
}
