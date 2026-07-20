import prisma from "@/lib/prisma";

type DirectRouteHandler<TRequest extends Request, TContext, TResponse extends Response> = (
  request: TRequest,
  context: TContext,
) => TResponse | Promise<TResponse>;

export interface RouteTelemetryOptions {
  route?: string;
  params?: Record<string, string | string[]>;
  persist?: boolean;
}

type TelemetryMetadata = Record<string, string | number | boolean | null>;

export interface ServerTelemetryInput {
  type: "request" | "error" | "event";
  name: string;
  route: string;
  duration?: number;
  value?: number;
  status?: number;
  userId?: string;
  metadata?: TelemetryMetadata;
  /** Persist this event even when normal successful-request sampling is enabled. */
  force?: boolean;
}

export function sanitizeTelemetryDetail(value: unknown, maxLength = 8_000): string {
  let result = value instanceof Error
    ? `${value.name}: ${value.message}\n${value.stack || ""}`
    : String(value ?? "");
  result = result
    .replace(/(authorization\s*[:=]\s*(?:bearer\s+)?)[^\s,;"']+/gi, "$1[REDACTED]")
    .replace(/((?:password|passwd|secret|token|api[_-]?key|cookie|set-cookie)\s*[:=]\s*)[^\s,;"']+/gi, "$1[REDACTED]")
    .replace(/\bsk-[A-Za-z0-9_-]{12,}\b/g, "sk-[REDACTED]")
    .replace(/\bLTAI[A-Za-z0-9]{12,}\b/g, "LTAI[REDACTED]");
  return result.replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/g, "").slice(0, maxLength);
}

export function sanitizeTelemetryMetadata(
  metadata?: TelemetryMetadata,
): TelemetryMetadata | undefined {
  if (!metadata) return undefined;
  return Object.fromEntries(Object.entries(metadata).slice(0, 20).map(([key, value]) => [
    key.slice(0, 60),
    typeof value === "string" ? sanitizeTelemetryDetail(value) : value,
  ]));
}

const SENSITIVE_DETAIL_KEY = /(?:authorization|cookie|password|passwd|secret|token|api[_-]?key|credential)/i;

function serializeDiagnosticValue(value: unknown): string | undefined {
  if (value == null) return undefined;
  if (typeof value === "string") return sanitizeTelemetryDetail(value, 4_000);
  try {
    const seen = new WeakSet<object>();
    const serialized = JSON.stringify(value, (key, item) => {
      if (SENSITIVE_DETAIL_KEY.test(key)) return "[REDACTED]";
      if (typeof item === "object" && item !== null) {
        if (seen.has(item)) return "[Circular]";
        seen.add(item);
      }
      return item;
    });
    return sanitizeTelemetryDetail(serialized, 4_000);
  } catch {
    return sanitizeTelemetryDetail(String(value), 4_000);
  }
}

async function responseErrorMetadata(response?: Response): Promise<TelemetryMetadata> {
  if (!response || response.status < 400 || !response.headers.get("content-type")?.includes("application/json")) return {};
  try {
    const body: unknown = await response.clone().json();
    if (!body || typeof body !== "object" || Array.isArray(body)) return {};
    const record = body as Record<string, unknown>;
    const detail = serializeDiagnosticValue(record.error ?? record.message);
    const validation = serializeDiagnosticValue(record.details ?? record.issues);
    const code = serializeDiagnosticValue(record.code);
    return {
      ...(detail ? { errorDetail: detail } : {}),
      ...(validation ? { errorValidation: validation } : {}),
      ...(code ? { errorCode: code } : {}),
    };
  } catch {
    return {};
  }
}

export function normalizeTelemetryRoute(
  value: string,
  params?: Record<string, string | string[]>,
): string {
  const pathname = value.split("?")[0];
  if (!pathname.startsWith("/")) return "/unknown";
  const parameterSegments = new Map<string, string>();
  for (const [key, rawValue] of Object.entries(params ?? {})) {
    for (const segment of Array.isArray(rawValue) ? rawValue : [rawValue]) {
      parameterSegments.set(segment, `[${key}]`);
      try {
        parameterSegments.set(encodeURIComponent(segment), `[${key}]`);
      } catch {}
    }
  }
  const route = pathname
    .split("/")
    .map((segment) => {
      if (!segment || /^\[.+\]$/.test(segment)) return segment;
      if (parameterSegments.has(segment)) return parameterSegments.get(segment)!;
      if (/^\d+$/.test(segment)) return "[id]";
      if (/^[0-9a-f]{8}-[0-9a-f-]{27,}$/i.test(segment)) return "[id]";
      if (/^(?:c[a-z0-9]{20,}|[0-9a-f]{16,})$/i.test(segment)) return "[id]";
      return segment;
    })
    .join("/");
  return route.slice(0, 300);
}

export function sanitizeTelemetryName(value: string): string {
  return value.replace(/[\r\n\t]/g, " ").slice(0, 120) || "unknown";
}

function shouldSample(status?: number): boolean {
  if (status && status >= 400) return true;
  const configured = Number(process.env.TELEMETRY_SERVER_SAMPLE_RATE ?? "0.2");
  const rate = Number.isFinite(configured) ? Math.min(Math.max(configured, 0), 1) : 0.2;
  return Math.random() < rate;
}

export async function trackServerTelemetry(input: ServerTelemetryInput): Promise<void> {
  if (!input.force && !shouldSample(input.status)) return;
  await prisma.telemetryEvent.create({
    data: {
      scope: "SERVER",
      type: input.type,
      name: sanitizeTelemetryName(input.name),
      route: normalizeTelemetryRoute(input.route),
      duration: input.duration,
      value: input.value,
      status: input.status,
      userId: input.userId,
      release: process.env.APP_RELEASE?.slice(0, 64),
      metadata: sanitizeTelemetryMetadata(input.metadata),
    },
  });
}

export function trackServerTelemetryLater(input: ServerTelemetryInput): void {
  void trackServerTelemetry(input).catch((error) => {
    process.stderr.write(`telemetry.server.write_failed ${sanitizeTelemetryDetail(error, 500)}\n`);
  });
}

function requestIdFor(request: Request): string {
  const supplied = request.headers.get("x-request-id");
  return supplied && /^[A-Za-z0-9._:-]{1,128}$/.test(supplied) ? supplied : crypto.randomUUID();
}

export function recordCompletedRequest(
  request: Request,
  response: Response | undefined,
  startedAt: number,
  options: RouteTelemetryOptions & { requestId: string; userId?: string; thrown?: boolean; error?: unknown },
): void {
  if (options.persist === false) return;
  const route = normalizeTelemetryRoute(options.route ?? new URL(request.url).pathname, options.params);
  const duration = Math.max(0, performance.now() - startedAt);
  void responseErrorMetadata(response).then((responseMetadata) => {
    const thrownDetail = options.error instanceof Error
      ? sanitizeTelemetryDetail(options.error, 8_000)
      : serializeDiagnosticValue(options.error);
    return trackServerTelemetry({
      type: "request",
      name: `${request.method} ${route}`,
      route,
      duration,
      status: response?.status ?? 500,
      userId: options.userId,
      force: true,
      metadata: {
        requestId: options.requestId,
        method: request.method.slice(0, 16),
        outcome: options.thrown ? "thrown" : "returned",
        ...responseMetadata,
        ...(thrownDetail ? { errorDetail: thrownDetail } : {}),
      },
    });
  }).catch((error) => {
    process.stderr.write(`telemetry.server.write_failed ${sanitizeTelemetryDetail(error, 500)}\n`);
  });
}

/** Adds request correlation and completion telemetry without inspecting request or response content. */
export function withTelemetry<TRequest extends Request, TContext = unknown, TResponse extends Response = Response>(
  handler: DirectRouteHandler<TRequest, TContext, TResponse>,
  options: RouteTelemetryOptions = {},
): (request?: TRequest, context?: TContext) => Promise<TResponse> {
  return async (request, context) => {
    if (!request) throw new TypeError("Route request is required");
    const startedAt = performance.now();
    const requestId = requestIdFor(request);
    try {
      const response = await handler(request, context as TContext);
      response.headers.set("X-Request-Id", requestId);
      if (options.persist === false) {
        response.headers.set("X-Telemetry-Ingestion", response.status < 400 ? "accepted" : response.status < 500 ? "rejected" : "unhealthy");
      }
      recordCompletedRequest(request, response, startedAt, { ...options, requestId });
      return response;
    } catch (error) {
      recordCompletedRequest(request, undefined, startedAt, { ...options, requestId, thrown: true, error });
      throw error;
    }
  };
}
