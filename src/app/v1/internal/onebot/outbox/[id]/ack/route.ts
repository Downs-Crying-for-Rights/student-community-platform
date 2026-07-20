import { QQOutboxStatus } from "@prisma/client";
import { NextResponse } from "next/server";
import { z } from "zod";

import {
  authorizeQQInternalRequest,
  getQQOutboxFailureDisposition,
} from "@/lib/qq-outbox";
import prisma from "@/lib/prisma";
import { withTelemetry } from "@/lib/telemetry";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const ackSchema = z.discriminatedUnion("success", [
  z
    .object({
      success: z.literal(true),
      providerMessageId: z.string().trim().min(1).max(256).regex(/^[\w.:-]+$/).optional(),
    })
    .strict(),
  z
    .object({
      success: z.literal(false),
      errorCode: z.enum([
        "ONEBOT_REJECTED",
        "ONEBOT_TIMEOUT",
        "CONNECTION_LOST",
        "ACTION_TOO_LARGE",
      ]),
    })
    .strict(),
]);

const post = async (
  request: Request,
  context: { params: Promise<{ id: string }> },
) => {
  const authorization = authorizeQQInternalRequest(request);
  if (!authorization.ok) {
    return NextResponse.json(
      { error: authorization.status === 401 ? "Unauthorized" : "Unavailable" },
      { status: authorization.status },
    );
  }

  const { id } = await context.params;
  if (!id || id.length > 128) {
    return NextResponse.json({ error: "Invalid request" }, { status: 400 });
  }

  let input: z.infer<typeof ackSchema>;
  try {
    input = ackSchema.parse(await request.json());
  } catch {
    return NextResponse.json({ error: "Invalid request" }, { status: 400 });
  }

  try {
    const acknowledged = await prisma.$transaction(async (tx) => {
      const message = await tx.qQMessageOutbox.findFirst({
        where: { id, status: QQOutboxStatus.PROCESSING },
        select: { attemptCount: true },
      });
      if (!message) return false;

      const now = new Date();
      const data = input.success
        ? {
            status: QQOutboxStatus.DELIVERED,
            providerMessageId: input.providerMessageId,
            lastError: null,
            deliveredAt: now,
          }
        : {
            ...getQQOutboxFailureDisposition(message.attemptCount, now),
            providerMessageId: null,
            lastError: input.errorCode,
          };
      const result = await tx.qQMessageOutbox.updateMany({
        where: { id, status: QQOutboxStatus.PROCESSING },
        data,
      });
      return result.count === 1;
    });

    if (!acknowledged) {
      return NextResponse.json({ error: "Message not claimable" }, { status: 409 });
    }
    return new NextResponse(null, { status: 204 });
  } catch {
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
};

export const POST = withTelemetry(post, { route: "/v1/internal/onebot/outbox/[id]/ack" });
