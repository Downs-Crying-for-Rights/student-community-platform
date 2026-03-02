import { describe, it, expect, vi, beforeEach } from "vitest";
import { NextRequest } from "next/server";

// Mock sendVerificationCode before importing the route
const mockSendVerificationCode = vi.fn();

vi.mock("@/lib/sms/verification", () => ({
  sendVerificationCode: (...args: unknown[]) =>
    mockSendVerificationCode(...args),
}));

import { POST } from "../route";

function createRequest(body: Record<string, unknown>): NextRequest {
  return new NextRequest("http://localhost:3000/api/sms/send", {
    method: "POST",
    body: JSON.stringify(body),
    headers: { "Content-Type": "application/json" },
  });
}

describe("POST /api/sms/send", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  // ========== 成功发送 ==========

  describe("成功发送验证码", () => {
    it("应使用有效手机号和 login 目的成功发送", async () => {
      mockSendVerificationCode.mockResolvedValue({ success: true });

      const req = createRequest({ phone: "13800138000", purpose: "login" });
      const res = await POST(req);
      const data = await res.json();

      expect(res.status).toBe(200);
      expect(data).toEqual({ success: true });
      expect(mockSendVerificationCode).toHaveBeenCalledWith(
        "13800138000",
        "login"
      );
    });

    it("应使用有效手机号和 bindphone 目的成功发送", async () => {
      mockSendVerificationCode.mockResolvedValue({ success: true });

      const req = createRequest({
        phone: "15912345678",
        purpose: "bindphone",
      });
      const res = await POST(req);
      const data = await res.json();

      expect(res.status).toBe(200);
      expect(data).toEqual({ success: true });
      expect(mockSendVerificationCode).toHaveBeenCalledWith(
        "15912345678",
        "bindphone"
      );
    });
  });

  // ========== 频率限制 ==========

  describe("频率限制拒绝", () => {
    it("应在 60 秒内重复请求时返回 429", async () => {
      mockSendVerificationCode.mockResolvedValue({
        success: false,
        error: "请求过于频繁，请稍后再试",
      });

      const req = createRequest({ phone: "13800138000", purpose: "login" });
      const res = await POST(req);
      const data = await res.json();

      expect(res.status).toBe(429);
      expect(data.error).toBe("请求过于频繁，请稍后再试");
    });
  });

  // ========== 无效手机号 ==========

  describe("无效手机号拒绝", () => {
    it("应拒绝非 11 位手机号", async () => {
      const req = createRequest({ phone: "1380013", purpose: "login" });
      const res = await POST(req);
      const data = await res.json();

      expect(res.status).toBe(400);
      expect(data.error).toBe("参数校验失败");
      expect(mockSendVerificationCode).not.toHaveBeenCalled();
    });

    it("应拒绝不以 1 开头的手机号", async () => {
      const req = createRequest({ phone: "23800138000", purpose: "login" });
      const res = await POST(req);
      const data = await res.json();

      expect(res.status).toBe(400);
      expect(data.error).toBe("参数校验失败");
      expect(mockSendVerificationCode).not.toHaveBeenCalled();
    });

    it("应拒绝包含非数字字符的手机号", async () => {
      const req = createRequest({ phone: "138abcd8000", purpose: "login" });
      const res = await POST(req);
      const data = await res.json();

      expect(res.status).toBe(400);
      expect(data.error).toBe("参数校验失败");
      expect(mockSendVerificationCode).not.toHaveBeenCalled();
    });

    it("应拒绝缺少 phone 字段的请求", async () => {
      const req = createRequest({ purpose: "login" });
      const res = await POST(req);
      const data = await res.json();

      expect(res.status).toBe(400);
      expect(data.error).toBe("参数校验失败");
      expect(mockSendVerificationCode).not.toHaveBeenCalled();
    });
  });

  // ========== 无效 purpose ==========

  describe("无效 purpose 拒绝", () => {
    it("应拒绝不在枚举范围内的 purpose", async () => {
      const req = createRequest({
        phone: "13800138000",
        purpose: "register",
      });
      const res = await POST(req);
      const data = await res.json();

      expect(res.status).toBe(400);
      expect(data.error).toBe("参数校验失败");
      expect(mockSendVerificationCode).not.toHaveBeenCalled();
    });

    it("应拒绝缺少 purpose 字段的请求", async () => {
      const req = createRequest({ phone: "13800138000" });
      const res = await POST(req);
      const data = await res.json();

      expect(res.status).toBe(400);
      expect(data.error).toBe("参数校验失败");
      expect(mockSendVerificationCode).not.toHaveBeenCalled();
    });
  });

  // ========== 发送失败 ==========

  describe("发送失败", () => {
    it("应在 sendVerificationCode 返回发送失败时返回 500", async () => {
      mockSendVerificationCode.mockResolvedValue({
        success: false,
        error: "验证码发送失败，请稍后再试",
      });

      const req = createRequest({ phone: "13800138000", purpose: "login" });
      const res = await POST(req);
      const data = await res.json();

      expect(res.status).toBe(500);
      expect(data.error).toBe("验证码发送失败，请稍后再试");
    });

    it("应在 sendVerificationCode 抛出异常时返回 500", async () => {
      mockSendVerificationCode.mockRejectedValue(
        new Error("Redis connection failed")
      );

      const req = createRequest({ phone: "13800138000", purpose: "login" });
      const res = await POST(req);
      const data = await res.json();

      expect(res.status).toBe(500);
      expect(data.error).toBe("验证码发送失败，请稍后再试");
    });
  });
});
