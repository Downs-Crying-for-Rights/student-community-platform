import { describe, it, expect, vi, beforeEach } from "vitest";

// vi.mock factories are hoisted — define mock inline
vi.mock("@/lib/redis", () => {
  const pipeline = {
    zremrangebyscore: vi.fn().mockReturnThis(),
    zcard: vi.fn().mockReturnThis(),
    zadd: vi.fn().mockReturnThis(),
    pexpire: vi.fn().mockReturnThis(),
    exec: vi.fn(),
  };
  return {
    default: {
      pipeline: vi.fn(() => ({ ...pipeline, exec: pipeline.exec })),
      zrange: vi.fn(),
      _pipeline: pipeline,
    },
  };
});

import redis from "@/lib/redis";
import {
  checkRateLimit,
  rateLimitKeyForUser,
  rateLimitKeyForIP,
  enforceRateLimit,
} from "../rate-limiter";
import { hashIP } from "../utils";

// Access the internal pipeline mock for assertions
const mockRedis = redis as unknown as {
  pipeline: ReturnType<typeof vi.fn>;
  zrange: ReturnType<typeof vi.fn>;
  _pipeline: {
    exec: ReturnType<typeof vi.fn>;
    zremrangebyscore: ReturnType<typeof vi.fn>;
    zcard: ReturnType<typeof vi.fn>;
    zadd: ReturnType<typeof vi.fn>;
    pexpire: ReturnType<typeof vi.fn>;
  };
};

describe("Rate Limiter", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    // Re-wire pipeline() to return fresh chainable object each call
    mockRedis.pipeline.mockImplementation(() => ({
      zremrangebyscore: vi.fn().mockReturnThis(),
      zcard: vi.fn().mockReturnThis(),
      zadd: vi.fn().mockReturnThis(),
      pexpire: vi.fn().mockReturnThis(),
      exec: mockRedis._pipeline.exec,
    }));
  });

  describe("checkRateLimit", () => {
    it("应允许在限制内的请求", async () => {
      mockRedis._pipeline.exec
        .mockResolvedValueOnce([
          [null, 0], // zremrangebyscore
          [null, 5], // zcard — 5 existing requests
        ])
        .mockResolvedValueOnce([
          [null, 1], // zadd
          [null, 1], // pexpire
        ]);

      const result = await checkRateLimit("test-user", 60, 60000);

      expect(result.allowed).toBe(true);
      expect(result.remaining).toBe(54); // 60 - 5 - 1
      expect(result.limit).toBe(60);
    });

    it("应拒绝超出限制的请求", async () => {
      mockRedis._pipeline.exec.mockResolvedValueOnce([
        [null, 0],
        [null, 60], // already at limit
      ]);
      mockRedis.zrange.mockResolvedValue([
        "some-member",
        String(Date.now() - 30000),
      ]);

      const result = await checkRateLimit("test-user", 60, 60000);

      expect(result.allowed).toBe(false);
      expect(result.remaining).toBe(0);
      expect(result.limit).toBe(60);
    });

    it("应使用默认限制（60 次/分钟）", async () => {
      mockRedis._pipeline.exec
        .mockResolvedValueOnce([
          [null, 0],
          [null, 0],
        ])
        .mockResolvedValueOnce([
          [null, 1],
          [null, 1],
        ]);

      const result = await checkRateLimit("test-user");

      expect(result.allowed).toBe(true);
      expect(result.remaining).toBe(59); // 60 - 0 - 1
      expect(result.limit).toBe(60);
    });

    it("应支持自定义限制和窗口", async () => {
      mockRedis._pipeline.exec
        .mockResolvedValueOnce([
          [null, 0],
          [null, 9], // 9 existing
        ])
        .mockResolvedValueOnce([
          [null, 1],
          [null, 1],
        ]);

      const result = await checkRateLimit("test-user", 10, 30000);

      expect(result.allowed).toBe(true);
      expect(result.remaining).toBe(0); // 10 - 9 - 1
      expect(result.limit).toBe(10);
    });

    it("当恰好达到限制时应拒绝请求", async () => {
      mockRedis._pipeline.exec.mockResolvedValueOnce([
        [null, 0],
        [null, 10], // exactly at limit
      ]);
      mockRedis.zrange.mockResolvedValue([
        "member",
        String(Date.now() - 5000),
      ]);

      const result = await checkRateLimit("test-user", 10, 60000);

      expect(result.allowed).toBe(false);
      expect(result.remaining).toBe(0);
    });
  });

  describe("rateLimitKeyForUser", () => {
    it("应返回用户 ID 作为键", () => {
      expect(rateLimitKeyForUser("user-123")).toBe("user-123");
    });
  });

  describe("rateLimitKeyForIP", () => {
    it("应返回 ip: 前缀加哈希后的 IP", () => {
      const key = rateLimitKeyForIP("192.168.1.1");
      const expectedHash = hashIP("192.168.1.1");
      expect(key).toBe(`ip:${expectedHash}`);
    });

    it("不同 IP 应生成不同的键", () => {
      const key1 = rateLimitKeyForIP("192.168.1.1");
      const key2 = rateLimitKeyForIP("10.0.0.1");
      expect(key1).not.toBe(key2);
    });
  });

  describe("enforceRateLimit", () => {
    it("请求在限制内时应返回 null", async () => {
      mockRedis._pipeline.exec
        .mockResolvedValueOnce([
          [null, 0],
          [null, 0],
        ])
        .mockResolvedValueOnce([
          [null, 1],
          [null, 1],
        ]);

      const result = await enforceRateLimit("test-user");

      expect(result).toBeNull();
    });

    it("超出限制时应返回 429 响应", async () => {
      mockRedis._pipeline.exec.mockResolvedValueOnce([
        [null, 0],
        [null, 60],
      ]);
      mockRedis.zrange.mockResolvedValue([
        "member",
        String(Date.now() - 10000),
      ]);

      const enforced = await enforceRateLimit("test-user");

      expect(enforced).not.toBeNull();
      expect(enforced!.response.status).toBe(429);
      expect(enforced!.result.allowed).toBe(false);

      const body = await enforced!.response.json();
      expect(body.error).toBe("Too Many Requests");
      expect(body.retryAfter).toBeGreaterThan(0);
    });

    it("429 响应应包含正确的 headers", async () => {
      mockRedis._pipeline.exec.mockResolvedValueOnce([
        [null, 0],
        [null, 60],
      ]);
      mockRedis.zrange.mockResolvedValue([
        "member",
        String(Date.now() - 10000),
      ]);

      const enforced = await enforceRateLimit("test-user");

      expect(enforced!.response.headers.get("Content-Type")).toBe(
        "application/json",
      );
      expect(enforced!.response.headers.get("Retry-After")).toBeTruthy();
      expect(enforced!.response.headers.get("X-RateLimit-Limit")).toBe("60");
      expect(enforced!.response.headers.get("X-RateLimit-Remaining")).toBe("0");
      expect(
        enforced!.response.headers.get("X-RateLimit-Reset"),
      ).toBeTruthy();
    });
  });
});
