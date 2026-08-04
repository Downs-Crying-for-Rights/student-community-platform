import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/redis", () => ({
  default: { eval: vi.fn() },
}));

import redis from "@/lib/redis";
import {
  checkRateLimit,
  enforceRateLimit,
  rateLimitKeyForIP,
  rateLimitKeyForUser,
  requestIP,
} from "../rate-limiter";
import { hashIP } from "../utils";

const mockEval = vi.mocked(redis.eval);

describe("Rate Limiter", () => {
  beforeEach(() => vi.clearAllMocks());

  describe("checkRateLimit", () => {
    it("原子记录限制内的请求", async () => {
      mockEval.mockResolvedValue([1, 6, 0]);

      const result = await checkRateLimit("test-user", 60, 60_000);

      expect(result).toMatchObject({ allowed: true, remaining: 54, limit: 60 });
      expect(mockEval).toHaveBeenCalledOnce();
      const call = mockEval.mock.calls[0];
      expect(call[1]).toBe(1);
      expect(call[2]).toBe("ratelimit:test-user");
      expect(call[6]).toBe("60");
    });

    it("达到限制时拒绝并按最旧请求计算重置时间", async () => {
      const oldest = Date.now() - 30_000;
      mockEval.mockResolvedValue([0, 60, oldest]);

      const result = await checkRateLimit("test-user", 60, 60_000);

      expect(result.allowed).toBe(false);
      expect(result.remaining).toBe(0);
      expect(result.resetAt).toBe(oldest + 60_000);
    });

    it("使用默认限制", async () => {
      mockEval.mockResolvedValue([1, 1, 0]);
      await expect(checkRateLimit("test-user")).resolves.toMatchObject({
        allowed: true,
        remaining: 59,
        limit: 60,
      });
    });

    it("拒绝异常的 Redis 脚本结果", async () => {
      mockEval.mockResolvedValue(null);
      await expect(checkRateLimit("test-user")).rejects.toThrow("RATE_LIMIT_SCRIPT_INVALID_RESULT");
    });
  });

  describe("rate limit keys", () => {
    it("保留用户 ID 作为认证用户键", () => {
      expect(rateLimitKeyForUser("user-123")).toBe("user-123");
    });

    it("匿名 IP 仅以哈希形式进入键", () => {
      const key = rateLimitKeyForIP("192.168.1.1");
      expect(key).toBe(`ip:${hashIP("192.168.1.1")}`);
      expect(key).not.toContain("192.168.1.1");
      expect(rateLimitKeyForIP("192.168.1.1")).not.toBe(rateLimitKeyForIP("10.0.0.1"));
    });
  });

  describe("requestIP", () => {
    it("优先使用反向代理设置的真实 IP", () => {
      const request = new Request("http://localhost", {
        headers: { "x-real-ip": "203.0.113.8", "x-forwarded-for": "198.51.100.2, 10.0.0.1" },
      });
      expect(requestIP(request)).toBe("203.0.113.8");
    });

    it("回退到第一个 forwarded IP 或 unknown", () => {
      expect(requestIP(new Request("http://localhost", { headers: { "x-forwarded-for": "198.51.100.2, 10.0.0.1" } }))).toBe("198.51.100.2");
      expect(requestIP(new Request("http://localhost"))).toBe("unknown");
    });
  });

  describe("enforceRateLimit", () => {
    it("限制内返回 null", async () => {
      mockEval.mockResolvedValue([1, 1, 0]);
      await expect(enforceRateLimit("test-user")).resolves.toBeNull();
    });

    it("超限返回带标准头的 429", async () => {
      mockEval.mockResolvedValue([0, 60, Date.now() - 10_000]);

      const enforced = await enforceRateLimit("test-user");

      expect(enforced?.response.status).toBe(429);
      expect(enforced?.response.headers.get("Retry-After")).toBeTruthy();
      expect(enforced?.response.headers.get("X-RateLimit-Limit")).toBe("60");
      expect(enforced?.response.headers.get("X-RateLimit-Remaining")).toBe("0");
      await expect(enforced?.response.json()).resolves.toMatchObject({ error: "Too Many Requests" });
    });
  });
});
