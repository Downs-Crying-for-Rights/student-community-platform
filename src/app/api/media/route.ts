import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth/next";
import prisma from "@/lib/prisma";
import { authOptions } from "@/lib/auth";
import { getMediaKey, getPrivateOSSObject, verifyMediaSignature, verifyProtectedMediaSignature, type ProtectedMediaScope } from "@/lib/oss";
import { withTelemetry } from "@/lib/telemetry";

export const runtime = "nodejs";

const ALLOWED_KEY = /^uploads\/\d{4}\/\d{2}\/[a-f0-9]{32}\.(webp|gif|jpg|png|webm|ogg|mp3|m4a|wav|pdf|txt|doc|docx|xls|xlsx|zip)$/;

/**
 * GET /api/media?key=uploads/...&sig=...
 *
 * Reads a private OSS object with server-side credentials. The signed URL is
 * safe to hand to Next Image while the bucket itself remains private.
 */
async function getMedia(request: NextRequest) {
  const key = request.nextUrl.searchParams.get("key") || "";
  const signature = request.nextUrl.searchParams.get("sig") || "";
  const scope = request.nextUrl.searchParams.get("scope") as ProtectedMediaScope | null;
  const resourceId = request.nextUrl.searchParams.get("resourceId") || "";
  const exp = Number(request.nextUrl.searchParams.get("exp"));

  const protectedRequest = scope === "CASE" || scope === "EVIDENCE" || scope === "DCR_CHAT";
  const signatureValid = protectedRequest
    ? verifyProtectedMediaSignature(key, scope, resourceId, exp, signature)
    : verifyMediaSignature(key, signature);
  if (!ALLOWED_KEY.test(key) || !signatureValid) {
    return NextResponse.json({ error: "not_found" }, { status: 404 });
  }

  if (!protectedRequest) {
    const [caseMessage, evidenceItem, chatMessage] = await Promise.all([
      prisma.message.findFirst({ where: { mediaUrl: { not: null } }, select: { mediaUrl: true } }),
      prisma.evidenceItem.findFirst({ where: { fileUrl: { not: null } }, select: { fileUrl: true } }),
      prisma.helpChatMessage.findFirst({ where: { fileUrl: { not: null } }, select: { fileUrl: true } }),
    ]);
    if ([caseMessage?.mediaUrl, evidenceItem?.fileUrl, chatMessage?.fileUrl].some((value) => getMediaKey(value || "") === key)) {
      return NextResponse.json({ error: "not_found" }, { status: 404, headers: { "Cache-Control": "private, no-store" } });
    }
  }

  if (protectedRequest) {
    const session = await getServerSession(authOptions);
    if (!session?.user?.id) return NextResponse.json({ error: "未登录" }, { status: 401 });
    const privileged = ["MODERATOR", "ADMIN", "SUPER_ADMIN"].includes(session.user.role);
    let allowed = privileged;
    if (!allowed && scope === "CASE") {
      const message = await prisma.message.findFirst({
        where: { id: resourceId, case_: { OR: [{ submitterId: session.user.id }, { handlerId: session.user.id }, { handlers: { some: { userId: session.user.id } } }] } },
        select: { mediaUrl: true },
      });
      allowed = getMediaKey(message?.mediaUrl || "") === key;
    }
    if (!allowed && scope === "EVIDENCE") {
      const item = await prisma.evidenceItem.findFirst({
        where: { id: resourceId, room: { session: { OR: [{ requesterId: session.user.id }, { helperId: session.user.id }] } } },
        select: { fileUrl: true },
      });
      allowed = getMediaKey(item?.fileUrl || "") === key;
    }
    if (!allowed && scope === "DCR_CHAT") {
      const message = await prisma.helpChatMessage.findFirst({
        where: { id: resourceId, chat: { session: { OR: [{ requesterId: session.user.id }, { helperId: session.user.id }] } } },
        select: { fileUrl: true },
      });
      allowed = getMediaKey(message?.fileUrl || "") === key;
    }
    if (privileged && scope === "CASE") {
      const message = await prisma.message.findUnique({
        where: { id: resourceId },
        select: { mediaUrl: true },
      });
      allowed = getMediaKey(message?.mediaUrl || "") === key;
    }
    if (privileged && scope === "EVIDENCE") {
      const item = await prisma.evidenceItem.findUnique({
        where: { id: resourceId },
        select: { fileUrl: true },
      });
      allowed = getMediaKey(item?.fileUrl || "") === key;
    }
    if (privileged && scope === "DCR_CHAT") {
      const message = await prisma.helpChatMessage.findUnique({
        where: { id: resourceId },
        select: { fileUrl: true },
      });
      allowed = getMediaKey(message?.fileUrl || "") === key;
    }
    if (!allowed) return NextResponse.json({ error: "无权访问该文件" }, { status: 403 });
  }

  try {
    const object = await getPrivateOSSObject(key);
    if (!object.Body) {
      return NextResponse.json({ error: "not_found" }, { status: 404 });
    }

    const bytes = await object.Body.transformToByteArray();
    const body = bytes.buffer.slice(
      bytes.byteOffset,
      bytes.byteOffset + bytes.byteLength,
    ) as ArrayBuffer;

    return new NextResponse(body, {
      status: 200,
      headers: {
        "Content-Type": object.ContentType || "application/octet-stream",
        "Content-Length": String(bytes.byteLength),
        "Cache-Control": protectedRequest ? "private, no-store" : "public, max-age=86400, s-maxage=31536000, immutable",
        "X-Content-Type-Options": "nosniff",
      },
    });
  } catch (error) {
    const name = error instanceof Error ? error.name : "UnknownError";
    if (name === "NoSuchKey" || name === "NotFound") {
      return NextResponse.json({ error: "not_found" }, { status: 404 });
    }
    console.error("GET /api/media failed", { key, error });
    return NextResponse.json({ error: "media_unavailable" }, { status: 502 });
  }
}

export const GET = withTelemetry(getMedia, { route: "/api/media" });
