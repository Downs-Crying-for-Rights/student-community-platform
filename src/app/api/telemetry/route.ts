import { NextResponse } from "next/server";
import { getServerSession } from "next-auth/next";
import { z } from "zod";
import { authOptions } from "@/lib/auth";
import prisma from "@/lib/prisma";
import { enforceRateLimit, rateLimitKeyForIP } from "@/lib/rate-limiter";
import { normalizeTelemetryRoute, sanitizeTelemetryMetadata, sanitizeTelemetryName } from "@/lib/telemetry";

export const dynamic = "force-dynamic";

const eventSchema = z.object({
  type: z.enum(["page_view", "web_vital", "error"]),
  name: z.string().min(1).max(120),
  route: z.string().min(1).max(300),
  duration: z.number().finite().min(0).max(3_600_000).optional(),
  value: z.number().finite().min(0).max(10_000_000).optional(),
  metadata: z.object({
    message: z.string().max(2_000).optional(),
    stack: z.string().max(8_000).optional(),
    source: z.string().max(500).optional(),
    line: z.number().int().min(0).optional(),
    column: z.number().int().min(0).optional(),
  }).optional(),
});

const bodySchema = z.object({
  sessionId: z.string().uuid().optional(),
  events: z.array(eventSchema).min(1).max(20),
});

export async function POST(req: Request) {
  const origin = req.headers.get("origin");
  const expectedHost = req.headers.get("x-forwarded-host")?.split(",")[0]?.trim()
    || req.headers.get("host")
    || new URL(req.url).host;
  try {
    if (origin && new URL(origin).host !== expectedHost) {
      return NextResponse.json({ error: "来源无效" }, { status: 403 });
    }
  } catch {
    return NextResponse.json({ error: "来源无效" }, { status: 403 });
  }

  const forwarded = req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || "unknown";
  const limited = await enforceRateLimit(`telemetry:${rateLimitKeyForIP(forwarded)}`, 30, 60_000);
  if (limited) return limited.response;

  const parsed = bodySchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "遥测数据无效" }, { status: 400 });

  const session = await getServerSession(authOptions);
  const userAgent = req.headers.get("user-agent")?.slice(0, 240);
  await prisma.telemetryEvent.createMany({
    data: parsed.data.events.map((event) => ({
      scope: "CLIENT" as const,
      type: event.type,
      name: sanitizeTelemetryName(event.name),
      route: normalizeTelemetryRoute(event.route),
      duration: event.duration,
      value: event.value,
      sessionId: parsed.data.sessionId,
      userId: session?.user?.id,
      release: process.env.APP_RELEASE?.slice(0, 64),
      userAgent,
      metadata: sanitizeTelemetryMetadata(event.metadata),
    })),
  });

  return new NextResponse(null, { status: 204, headers: { "Cache-Control": "no-store" } });
}
