import { NextResponse } from "next/server";
import { z } from "zod";

import {
  authorizeQQInternalRequest,
  claimQQOutboxMessages,
} from "@/lib/qq-outbox";
import { recordQQBotHeartbeat } from "@/lib/qq-bot-monitor";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const claimSchema = z
  .object({
    selfId: z.string().regex(/^[1-9]\d{4,11}$/),
    limit: z.number().int().min(1).max(10),
    oneBotConnected: z.boolean(),
    accountOnline: z.boolean(),
    checkedAt: z.string().datetime({ offset: true }),
  })
  .strict();

export async function POST(request: Request) {
  const authorization = authorizeQQInternalRequest(request);
  if (!authorization.ok) {
    return NextResponse.json(
      { error: authorization.status === 401 ? "Unauthorized" : "Unavailable" },
      { status: authorization.status },
    );
  }

  let input: z.infer<typeof claimSchema>;
  try {
    input = claimSchema.parse(await request.json());
  } catch {
    return NextResponse.json({ error: "Invalid request" }, { status: 400 });
  }
  if (input.selfId !== process.env.QQ_BOT_EXPECTED_SELF_ID) {
    return NextResponse.json({ error: "Unexpected bot identity" }, { status: 403 });
  }

  try {
    const now = new Date();
    const messages = input.oneBotConnected && input.accountOnline
      ? await claimQQOutboxMessages(undefined, now, input.limit)
      : [];
    await recordQQBotHeartbeat(input.selfId, {
      oneBotConnected: input.oneBotConnected,
      accountOnline: input.accountOnline,
      checkedAt: input.checkedAt,
    }, now);
    return NextResponse.json(messages);
  } catch {
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
