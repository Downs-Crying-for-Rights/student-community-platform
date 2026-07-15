import { NextRequest, NextResponse } from "next/server";
import { getPrivateOSSObject, verifyMediaSignature } from "@/lib/oss";

export const runtime = "nodejs";

const ALLOWED_KEY = /^uploads\/\d{4}\/\d{2}\/[a-f0-9]{32}\.(webp|gif|jpg|png|webm|ogg|mp3|m4a|wav|pdf|txt|doc|docx|xls|xlsx|zip)$/;

/**
 * GET /api/media?key=uploads/...&sig=...
 *
 * Reads a private OSS object with server-side credentials. The signed URL is
 * safe to hand to Next Image while the bucket itself remains private.
 */
export async function GET(request: NextRequest) {
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
