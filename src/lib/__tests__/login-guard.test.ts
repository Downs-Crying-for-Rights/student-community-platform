import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("@/lib/redis", () => {
  return {
    default: {
      zremrangebyscore: vi.fn().mockResolvedValue(0),
      zadd: vi.fn().mockResolvedValue(1),
      expire: vi.fn().mockResolvedValue(1),
      zcard: vi.fn().mockResolvedValue(1),
      set: vi.fn().mockResolvedValue("OK"),
      get: vi.fn().mockResolvedValue(null),
    },
  };
});

vi.mock("@/lib/notification", () => ({
  createNotification: vi.fn().mockResolvedValue({ id: "notif-1" }),
}));

import redis from "@/lib/redis";
import { createNotification } from "@/lib/notification";
import { recordLoginAttempt, isAccountLocked } from "../login-guard";

const mockRedis = redis as unknown as {
  zremrangebyscore: ReturnType<typeof vi.fn>;
  zadd: ReturnType<typeof vi.fn>;
  expire: ReturnType<typeof vi.fn>;
  zcard: ReturnType<typeof vi.fn>;
  set: ReturnType<typeof vi.fn>;
  get: ReturnType<typeof vi.fn>;
};

const mockCreateNotification = createNotification as ReturnType<typeof vi.fn>;

describe("Login Guard", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe("recordLoginAttempt", () => {
    it("单个 IP 登录不应锁定账户", async () => {
      mockRedis.zcard.mockResolvedValue(1);

      const result = await recordLoginAttempt("user-1", "hash-ip-1");

      expect(result.locked).toBe(false);
      expect(mockRedis.zremrangebyscore).toHaveBeenCalledWith(
        "login:ips:user-1",
        "-inf",
        expect.any(Number),
      );
      expect(mockRedis.zadd).toHaveBeenCalledWith(
        "login:ips:user-1",
        expect.any(Number),
        "hash-ip-1",
      );
      expect(mockRedis.expire).toHaveBeenCalledWith("login:ips:user-1", 300);
      expect(mockRedis.set).not.toHaveBeenCalled();
    });

    it("2 个不同 IP 登录不应锁定账户", async () => {
      mockRedis.zcard.mockResolvedValue(2);

      const result = await recordLoginAttempt("user-1", "hash-ip-2");

      expect(result.locked).toBe(false);
      expect(mockRedis.set).not.toHaveBeenCalled();
    });

    it("3 个不同 IP 登录应锁定账户并通知", async () => {
      mockRedis.zcard.mockResolvedValue(3);

      const result = await recordLoginAttempt("user-1", "hash-ip-3");

      expect(result.locked).toBe(true);
      expect(mockRedis.set).toHaveBeenCalledWith(
        "login:locked:user-1",
        "1",
        "EX",
        1800,
      );
      expect(mockCreateNotification).toHaveBeenCalledWith(
        "user-1",
        "SYSTEM",
        "账户异常登录检测",
        expect.stringContaining("3"),
      );
    });

    it("超过 3 个不同 IP 也应锁定账户", async () => {
      mockRedis.zcard.mockResolvedValue(5);

      const result = await recordLoginAttempt("user-1", "hash-ip-5");

      expect(result.locked).toBe(true);
      expect(mockCreateNotification).toHaveBeenCalledWith(
        "user-1",
        "SYSTEM",
        "账户异常登录检测",
        expect.stringContaining("5"),
      );
    });

    it("通知失败不应阻止锁定", async () => {
      mockRedis.zcard.mockResolvedValue(3);
      mockCreateNotification.mockRejectedValueOnce(new Error("DB error"));

      const result = await recordLoginAttempt("user-1", "hash-ip-3");

      expect(result.locked).toBe(true);
      expect(mockRedis.set).toHaveBeenCalledWith(
        "login:locked:user-1",
        "1",
        "EX",
        1800,
      );
    });
  });

  describe("isAccountLocked", () => {
    it("未锁定的账户应返回 false", async () => {
      mockRedis.get.mockResolvedValue(null);

      const locked = await isAccountLocked("user-1");

      expect(locked).toBe(false);
      expect(mockRedis.get).toHaveBeenCalledWith("login:locked:user-1");
    });

    it("已锁定的账户应返回 true", async () => {
      mockRedis.get.mockResolvedValue("1");

      const locked = await isAccountLocked("user-1");

      expect(locked).toBe(true);
    });
  });
});
