import { NextResponse } from "next/server";
import { getServerSession } from "next-auth/next";
import { z } from "zod";
import { authOptions } from "@/lib/auth";
import prisma from "@/lib/prisma";
import { enforceRateLimit, rateLimitKeyForIP } from "@/lib/rate-limiter";
import { normalizeTelemetryRoute, sanitizeTelemetryName } from "@/lib/telemetry";

export const dynamic = "force-dynamic";

const eventSchema = z.object({
  type: z.enum(["page_view", "web_vital", "error"]),
  name: z.string().min(1).max(120),
  route: z.string().min(1).max(300),
  duration: z.number().finite().min(0).max(3_600_000).optional(),
  value: z.number().finite().min(0).max(10_000_000).optional(),
});

const bodySchema = z.object({
  sessionId: z.string().uuid().optional(),
  events: z.array(eventSchema).min(1).max(20),
});

export async function POST(req: Request) {
  const origin = req.headers.get("origin");
  try {
    if (origin && new URL(origin).host !== new URL(req.url).host) {
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
    })),
  });

  return new NextResponse(null, { status: 204, headers: { "Cache-Control": "no-store" } });
}
