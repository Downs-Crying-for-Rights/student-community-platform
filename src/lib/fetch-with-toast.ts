/**
 * Network-aware fetch wrapper that provides error info for toast display.
 *
 * Returns a result object with either data or error info (message + retry fn).
 * Components can use the error info to show toast notifications.
 *
 * Validates: Requirements 38.5
 */

export interface FetchResult<T> {
  data: T | null;
  error: { message: string; retry: () => Promise<FetchResult<T>> } | null;
}

export async function fetchWithToast<T>(
  input: RequestInfo | URL,
  init?: RequestInit
): Promise<FetchResult<T>> {
  const doFetch = async (): Promise<FetchResult<T>> => {
    try {
      const res = await fetch(input, init);
      if (!res.ok) {
        const message =
          res.status >= 500
            ? "服务器错误，请稍后重试"
            : res.status === 403
              ? "无权限访问"
              : res.status === 404
                ? "请求的资源不存在"
                : `请求失败 (${res.status})`;
        return { data: null, error: { message, retry: doFetch } };
      }
      const data = (await res.json()) as T;
      return { data, error: null };
    } catch {
      return {
        data: null,
        error: { message: "网络连接失败，请检查网络后重试", retry: doFetch },
      };
    }
  };

  return doFetch();
}
