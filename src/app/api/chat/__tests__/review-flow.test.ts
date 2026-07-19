import { describe, expect, it } from "vitest";
import * as fs from "node:fs";
import * as path from "node:path";

const SRC = path.resolve(__dirname, "../../../..");

function read(relativePath: string) {
  return fs.readFileSync(path.join(SRC, relativePath), "utf8");
}

describe("群聊审核闭环", () => {
  it("公开群创建为待审核，私密群直接可用", () => {
    const source = read("app/api/chat/rooms/route.ts");
    expect(source).toContain('status: type === "PUBLIC" ? "PENDING" : "APPROVED"');
    expect(source).toContain("公开群聊已提交审核");
  });

  it("普通列表只公开审核通过的群聊", () => {
    const source = read("app/api/chat/rooms/route.ts");
    expect(source.match(/type: "PUBLIC", status: "APPROVED"/g)).toHaveLength(2);
    expect(source).toContain("status: r.status");
  });

  it("待审核群不能被加入或发送消息", () => {
    const roomSource = read("app/api/chat/rooms/[roomId]/route.ts");
    const requestSource = read("app/api/chat/rooms/[roomId]/join-requests/route.ts");
    const messagesSource = read("app/api/chat/rooms/[roomId]/messages/route.ts");
    expect(roomSource).toContain('room.status !== "APPROVED"');
    expect(requestSource).toContain('room.status !== "APPROVED"');
    expect(messagesSource.match(/room.status !== "APPROVED"/g)).toHaveLength(2);
  });

  it("版主审核接口支持通过和拒绝并通知创建者", () => {
    const source = read("app/api/admin/chat-rooms/[id]/route.ts");
    expect(source).toContain('z.enum(["APPROVE", "REJECT"])');
    expect(source).toContain('}, "MODERATOR")');
    expect(source).toContain("prisma.notification.create");
    expect(source).toContain("CHAT_ROOM_APPROVE");
    expect(source).toContain("CHAT_ROOM_REJECT");
  });

  it("管理员巡查列表和消息覆盖私密群聊并记录审计", () => {
    const listSource = read("app/api/admin/chat-rooms/route.ts");
    const detailSource = read("app/api/admin/chat-rooms/[id]/route.ts");
    expect(listSource).toContain('z.enum(["ALL", "PUBLIC", "PRIVATE"])');
    expect(listSource).not.toContain('where: { type: "PUBLIC"');
    expect(listSource).toContain('}, "ADMIN")');
    expect(detailSource).toContain("prisma.chatMessage.findMany");
    expect(detailSource).toContain('"REVIEW_CHAT_ROOM"');
    expect(detailSource).toContain('}, "ADMIN", { captureAllTelemetry: true })');
  });

  it("创建群聊必须确认后台可配置的最新巡查须知", () => {
    const routeSource = read("app/api/chat/rooms/route.ts");
    const pageSource = read("app/messages/page.tsx");
    expect(routeSource).toContain("monitoringConsentAccepted: z.literal(true)");
    expect(routeSource).toContain("monitoringConsentVersion");
    expect(routeSource).toContain("CHAT_MONITORING_CONSENT_STALE");
    expect(routeSource).toContain("CHAT_MONITORING_CONSENT_ACCEPT");
    expect(pageSource).toContain('fetch("/api/chat/consent"');
    expect(pageSource).toContain('type="checkbox"');
    expect(pageSource).toContain("monitoringAccepted");
  });

  it("群主处理加入申请使用 API 接受的动作值", () => {
    const source = read("app/chat/[id]/page.tsx");
    expect(source).toContain('action: "APPROVE"');
    expect(source).toContain('action: "REJECT"');
    expect(source).not.toContain('action: "APPROVED"');
    expect(source).not.toContain('action: "REJECTED"');
  });
});
