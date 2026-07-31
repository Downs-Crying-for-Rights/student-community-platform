import { describe, expect, it } from "vitest";
import {
  parsePhoneRequiredAreas,
  phoneGateAreaForApi,
  phoneGateAreaForPage,
} from "@/lib/phone-policy-shared";

describe("phone access policy routing", () => {
  it("uses secure typed defaults for malformed JSON", () => {
    expect(parsePhoneRequiredAreas({ messages: true, unknown: true })).toMatchObject({
      messages: true,
      groupChat: false,
      profile: false,
    });
    expect(parsePhoneRequiredAreas([]).messages).toBe(false);
  });

  it("maps member pages to independently configurable areas", () => {
    expect(phoneGateAreaForPage("/discover")).toBe("communityBrowse");
    expect(phoneGateAreaForPage("/create")).toBe("contentCreate");
    expect(phoneGateAreaForPage("/messages/dm/1")).toBe("messages");
    expect(phoneGateAreaForPage("/chat/1")).toBe("groupChat");
    expect(phoneGateAreaForPage("/dcr")).toBeNull();
    expect(phoneGateAreaForPage("/admin/system")).toBeNull();
  });

  it("separates reading, publishing and interaction APIs", () => {
    expect(phoneGateAreaForApi("/api/posts", "GET")).toBe("communityBrowse");
    expect(phoneGateAreaForApi("/api/posts", "POST")).toBe("contentCreate");
    expect(phoneGateAreaForApi("/api/posts/abc/comments", "POST")).toBe("communityInteract");
    expect(phoneGateAreaForApi("/api/chat/rooms", "GET")).toBe("groupChat");
    expect(phoneGateAreaForApi("/api/admin/system/config", "PATCH")).toBeNull();
    expect(phoneGateAreaForApi("/api/dcr/progress", "GET")).toBeNull();
  });
});
