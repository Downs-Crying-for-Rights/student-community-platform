import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  createNotification: vi.fn(),
  userFindMany: vi.fn(),
}));

vi.mock("@/lib/notification", () => ({ createNotification: mocks.createNotification }));
vi.mock("@/lib/prisma", () => ({
  default: { user: { findMany: mocks.userFindMany } },
}));

import {
  notifyMutualAidAdminsBestEffort,
  notifyMutualAidUsersBestEffort,
} from "../mutual-aid-notifications";

const notification = {
  title: "互助通知",
  content: "状态已更新",
  link: "/dcr/tasks/task-1",
};

describe("mutual-aid notifications", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.createNotification.mockResolvedValue({});
  });

  it("deduplicates recipients and does not reject when delivery fails", async () => {
    const consoleError = vi.spyOn(console, "error").mockImplementation(() => undefined);
    mocks.createNotification.mockRejectedValueOnce(new Error("notification unavailable"));

    await expect(notifyMutualAidUsersBestEffort(["user-1", "user-1", "user-2"], notification))
      .resolves.toBeUndefined();

    expect(mocks.createNotification).toHaveBeenCalledTimes(2);
    expect(mocks.createNotification).toHaveBeenCalledWith(
      "user-1",
      "SYSTEM",
      notification.title,
      notification.content,
      notification.link,
    );
    expect(consoleError).toHaveBeenCalled();
  });

  it("notifies moderators and both administrator roles", async () => {
    mocks.userFindMany.mockResolvedValue([{ id: "mod" }, { id: "admin" }, { id: "super" }]);

    await notifyMutualAidAdminsBestEffort(notification);

    expect(mocks.userFindMany).toHaveBeenCalledWith({
      where: { role: { in: ["MODERATOR", "ADMIN", "SUPER_ADMIN"] } },
      select: { id: true },
    });
    expect(mocks.createNotification).toHaveBeenCalledTimes(3);
  });
});
