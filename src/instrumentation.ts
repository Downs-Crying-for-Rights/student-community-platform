import type { Instrumentation } from "next";

export async function register() {}

export const onRequestError: Instrumentation.onRequestError = async (error, request, context) => {
  if (process.env.NEXT_RUNTIME !== "nodejs") return;
  const { sanitizeTelemetryDetail, trackServerTelemetryLater } = await import("@/lib/telemetry");
  const normalizedError = error instanceof Error ? error : new Error(String(error));
  const digest = typeof error === "object" && error !== null && "digest" in error
    ? String(error.digest)
    : null;
  trackServerTelemetryLater({
    type: "error",
    name: normalizedError.name || "unhandled_server_error",
    route: request.path,
    status: 500,
    metadata: {
      method: request.method,
      errorMessage: sanitizeTelemetryDetail(normalizedError.message, 2_000),
      stack: sanitizeTelemetryDetail(normalizedError.stack, 8_000),
      routeType: context.routeType,
      routePath: context.routePath,
      renderSource: context.renderSource || null,
      digest,
    },
  });
};
