import prisma from "@/lib/prisma";

export interface ServerTelemetryInput {
  type: "request" | "error" | "event";
  name: string;
  route: string;
  duration?: number;
  value?: number;
  status?: number;
  userId?: string;
  metadata?: Record<string, string | number | boolean | null>;
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
  metadata?: Record<string, string | number | boolean | null>,
): Record<string, string | number | boolean | null> | undefined {
  if (!metadata) return undefined;
  return Object.fromEntries(Object.entries(metadata).slice(0, 20).map(([key, value]) => [
    key.slice(0, 60),
    typeof value === "string" ? sanitizeTelemetryDetail(value) : value,
  ]));
}

export function normalizeTelemetryRoute(value: string): string {
  const route = value.split("?")[0].slice(0, 300);
  return route.startsWith("/") ? route : "/unknown";
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
