import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

const mocks = vi.hoisted(() => ({
  linkFindFirst: vi.fn(),
  disputeLink: vi.fn(),
  sendAdminMail: vi.fn(),
  notifyAdmins: vi.fn(),
}));

vi.mock("@/lib/prisma", () => ({
  default: { mutualAidLink: { findFirst: mocks.linkFindFirst } },
}));
vi.mock("@/lib/mutual-aid-cycle", () => ({
  respondToLink: vi.fn(),
  updateLinkProgress: vi.fn(),
  disputeLink: mocks.disputeLink,
}));
vi.mock("@/lib/mail", () => ({ sendAdminActionMail: mocks.sendAdminMail }));
vi.mock("@/lib/mutual-aid-notifications", () => ({
  notifyMutualAidAdminsBestEffort: mocks.notifyAdmins,
}));
vi.mock("next-auth/next", () => ({ getServerSession: vi.fn() }));
vi.mock("@/lib/auth", () => ({ authOptions: {} }));

import { getServerSession } from "next-auth/next";
import { PATCH } from "./route";

describe("PATCH cycle link dispute", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(getServerSession).mockResolvedValue({ user: { id: "user-a", role: "USER", phone: "13800000000" } } as never);
    mocks.linkFindFirst.mockResolvedValue({ id: "link-ab" });
    mocks.disputeLink.mockResolvedValue({ cycleStatus: "BROKEN", linkStatus: "DISPUTED" });
    mocks.sendAdminMail.mockResolvedValue(undefined);
    mocks.notifyAdmins.mockResolvedValue(undefined);
  });

  it("adds an in-app admin notification linking to the primary dispute queue", async () => {
    const response = await PATCH(new NextRequest(
      "http://localhost/api/dcr/cycles/cycle-1/links/link-ab",
      {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "DISPUTED", reason: "未履行约定" }),
      },
    ), { params: { id: "cycle-1", linkId: "link-ab" } });

    expect(response.status).toBe(200);
    expect(mocks.disputeLink).toHaveBeenCalledWith("link-ab", "user-a", "未履行约定");
    expect(mocks.notifyAdmins).toHaveBeenCalledWith({
      title: "互助循环争议待处理",
      content: "互助循环 cycle-1 有参与者发起了链路争议。",
      link: "/admin/disputes",
    });
  });
});
