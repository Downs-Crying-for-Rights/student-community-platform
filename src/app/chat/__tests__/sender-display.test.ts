import { describe, expect, it } from "vitest";
import fs from "node:fs";
import path from "node:path";

const SRC = path.resolve(__dirname, "../../..");

describe("群聊发件人显示", () => {
  it("消息接口返回发件人资料，页面显示昵称并可进入主页", () => {
    const route = fs.readFileSync(path.join(SRC, "app/api/chat/rooms/[roomId]/messages/route.ts"), "utf8");
    const page = fs.readFileSync(path.join(SRC, "app/chat/[id]/page.tsx"), "utf8");
    expect(route).toContain("senderById");
    expect(route).toContain("nickname: true, avatar: true");
    expect(page).toContain("msg.sender.nickname");
    expect(page).toContain("`/u/${msg.sender.id}`");
    expect(page).toContain("[...current, data.message]");
  });
});
