function formatResponseDetail(value: unknown): string | null {
  if (typeof value === "string") return value.trim().slice(0, 1_000) || null;
  if (value == null) return null;
  try {
    return JSON.stringify(value).slice(0, 1_000);
  } catch {
    return null;
  }
}

export async function readApiErrorMessage(
  response: Response,
  fallback = "请求失败",
): Promise<string> {
  try {
    const body = await response.json() as Record<string, unknown>;
    const message = formatResponseDetail(body?.error ?? body?.message);
    const details = formatResponseDetail(body?.details ?? body?.issues);
    if (message && details) return `${message}：${details}`;
    if (message) return message;
  } catch {
    // Non-JSON error responses fall back to the HTTP status below.
  }
  return `${fallback}（HTTP ${response.status}）`;
}
