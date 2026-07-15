import { NextRequest, NextResponse } from "next/server";
import { getPrivateOSSObject, verifyMediaSignature } from "@/lib/oss";
import { sanitizeTelemetryDetail, trackServerTelemetryLater } from "@/lib/telemetry";

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

  if (!ALLOWED_KEY.test(key) || !verifyMediaSignature(key, signature)) {
    return NextResponse.json({ error: "not_found" }, { status: 404 });
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
        "Cache-Control": "public, max-age=86400, s-maxage=31536000, immutable",
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

export async function GET(request: NextRequest) {
  const startedAt = performance.now();
  const requestId = request.headers.get("x-request-id") || crypto.randomUUID();
  const response = await getMedia(request);
  let errorMessage: string | undefined;
  if (response.status >= 400) {
    const body = await response.clone().json().catch(() => null) as { error?: unknown } | null;
    errorMessage = sanitizeTelemetryDetail(body?.error ?? response.statusText, 2_000);
  }
  trackServerTelemetryLater({
    type: response.status >= 400 ? "error" : "request",
    name: "GET /api/media",
    route: "/api/media",
    duration: performance.now() - startedAt,
    status: response.status,
    force: true,
    metadata: {
      requestId,
      method: "GET",
      ...(errorMessage ? { errorMessage } : {}),
    },
  });
  response.headers.set("X-Request-Id", requestId);
  return response;
}
