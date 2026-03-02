import { describe, it, expect, vi, beforeEach } from "vitest";
import { fetchWithToast } from "../fetch-with-toast";

/**
 * fetchWithToast utility tests
 *
 * Validates: Requirements 38.5
 */

describe("fetchWithToast", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it("成功请求返回 data 且 error 为 null", async () => {
    const mockData = { id: 1, name: "test" };
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
        ok: true,
        json: () => Promise.resolve(mockData),
      })
    );

    const result = await fetchWithToast("/api/test");
    expect(result.data).toEqual(mockData);
    expect(result.error).toBeNull();
  });

  it("500 错误返回服务器错误消息", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
        ok: false,
        status: 500,
      })
    );

    const result = await fetchWithToast("/api/test");
    expect(result.data).toBeNull();
    expect(result.error).not.toBeNull();
    expect(result.error!.message).toBe("服务器错误，请稍后重试");
  });

  it("403 错误返回无权限消息", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
        ok: false,
        status: 403,
      })
    );

    const result = await fetchWithToast("/api/test");
    expect(result.error!.message).toBe("无权限访问");
  });

  it("404 错误返回资源不存在消息", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
        ok: false,
        status: 404,
      })
    );

    const result = await fetchWithToast("/api/test");
    expect(result.error!.message).toBe("请求的资源不存在");
  });

  it("其他 HTTP 错误返回通用错误消息", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
        ok: false,
        status: 422,
      })
    );

    const result = await fetchWithToast("/api/test");
    expect(result.error!.message).toBe("请求失败 (422)");
  });

  it("网络错误返回网络连接失败消息", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockRejectedValue(new TypeError("Failed to fetch"))
    );

    const result = await fetchWithToast("/api/test");
    expect(result.data).toBeNull();
    expect(result.error!.message).toBe("网络连接失败，请检查网络后重试");
  });

  it("error.retry 可以重新发起请求", async () => {
    const fetchMock = vi
      .fn()
      .mockRejectedValueOnce(new TypeError("Failed to fetch"))
      .mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve({ success: true }),
      });
    vi.stubGlobal("fetch", fetchMock);

    const result = await fetchWithToast("/api/test");
    expect(result.error).not.toBeNull();

    // Retry should succeed
    const retryResult = await result.error!.retry();
    expect(retryResult.data).toEqual({ success: true });
    expect(retryResult.error).toBeNull();
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });
});
