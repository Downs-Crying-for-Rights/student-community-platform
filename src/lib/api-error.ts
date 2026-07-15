export function formatApiError(payload: unknown, fallback: string): string {
  if (!payload || typeof payload !== "object") return fallback;
  const body = payload as { error?: unknown; message?: unknown; details?: unknown };
  const headline = typeof body.error === "string"
    ? body.error
    : typeof body.message === "string" ? body.message : fallback;
  if (!body.details || typeof body.details !== "object") return headline;

  const detailLines = Object.entries(body.details as Record<string, unknown>).flatMap(([field, value]) => {
    const messages = Array.isArray(value) ? value : value == null ? [] : [value];
    return messages.filter((item): item is string => typeof item === "string" && item.trim().length > 0)
      .map((message) => `${field}: ${message}`);
  });
  return detailLines.length ? `${headline}（${detailLines.join("；")}）` : headline;
}
