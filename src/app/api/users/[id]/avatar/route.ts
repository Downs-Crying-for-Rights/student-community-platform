import { NextResponse } from "next/server";

import prisma from "@/lib/prisma";
import { getPrivateOSSObject, getStoredMediaKey } from "@/lib/oss";
import { withTelemetry } from "@/lib/telemetry";

export const runtime = "nodejs";

async function getAvatar(_request: Request, context: { params: Record<string, string> }) {
  const user = await prisma.user.findUnique({
    where: { id: context.params.id },
    select: { avatar: true },
  });
  if (!user?.avatar) return new NextResponse(null, { status: 404 });

  const key = getStoredMediaKey(user.avatar);
  if (!key) {
    try {
      const external = new URL(user.avatar);
      if (external.protocol !== "https:") throw new Error("invalid avatar protocol");
      return NextResponse.redirect(external);
    } catch {
      return new NextResponse(null, { status: 404 });
    }
  }

  try {
    const object = await getPrivateOSSObject(key);
    if (!object.Body) return new NextResponse(null, { status: 404 });
    const bytes = await object.Body.transformToByteArray();
    const body = bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength) as ArrayBuffer;
    return new NextResponse(body, {
      headers: {
        "Content-Type": object.ContentType || "image/webp",
        "Content-Length": String(bytes.byteLength),
        "Cache-Control": "public, max-age=300, s-maxage=3600",
        "X-Content-Type-Options": "nosniff",
      },
    });
  } catch (error) {
    console.error("GET /api/users/[id]/avatar failed", { userId: context.params.id, error });
    return new NextResponse(null, { status: 502 });
  }
}

export const GET = withTelemetry(getAvatar, { route: "/api/users/[id]/avatar" });
