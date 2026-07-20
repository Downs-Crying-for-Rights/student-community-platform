import { NextResponse } from "next/server";

import prisma from "@/lib/prisma";
import { withAuth, type AuthenticatedRequest } from "@/lib/rbac";
import { AuditAction, AuditTargetType, logAudit } from "@/lib/audit";
import { getPrivateOSSObject } from "@/lib/oss";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export const GET = withAuth(async (req: AuthenticatedRequest, context: { params: Record<string, string> }) => {
  const application = await prisma.identityVerificationApplication.findUnique({
    where: { id: context.params.id },
    select: { id: true, evidenceKey: true, evidenceMime: true },
  });
  if (!application?.evidenceKey || !application.evidenceKey.startsWith(`identity-verification/${application.id}/`)) {
    return NextResponse.json({ error: "认证材料不存在" }, { status: 404 });
  }
  const object = await getPrivateOSSObject(application.evidenceKey);
  if (!object.Body) return NextResponse.json({ error: "认证材料不存在" }, { status: 404 });
  const bytes = await object.Body.transformToByteArray();
  await logAudit(req.user.id, AuditAction.IDENTITY_EVIDENCE_VIEW, AuditTargetType.IDENTITY_APPLICATION, application.id);
  const body = bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength) as ArrayBuffer;
  return new NextResponse(body, {
    headers: {
      "Content-Type": application.evidenceMime || "image/webp",
      "Content-Length": String(bytes.byteLength),
      "Content-Disposition": `inline; filename="identity-verification-${application.id}.webp"`,
      "Cache-Control": "private, no-store",
      Pragma: "no-cache",
      "X-Content-Type-Options": "nosniff",
    },
  });
}, "ADMIN", { captureAllTelemetry: true });
