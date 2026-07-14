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
  if (!shouldSample(input.status)) return;
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
      metadata: input.metadata,
    },
  });
}

export function trackServerTelemetryLater(input: ServerTelemetryInput): void {
  void trackServerTelemetry(input).catch((error) => {
    console.error("telemetry.server.write_failed", error);
  });
}
