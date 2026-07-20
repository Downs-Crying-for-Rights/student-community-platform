import { NextResponse } from "next/server";

import prisma from "@/lib/prisma";
import { withAuth, type AuthenticatedRequest } from "@/lib/rbac";
import { AuditAction, AuditTargetType, logAudit } from "@/lib/audit";
import { decryptIdentityDetails, maskChineseId } from "@/lib/identity-verification";

export const dynamic = "force-dynamic";

export const GET = withAuth(async (req: AuthenticatedRequest, context: { params: Record<string, string> }) => {
  const application = await prisma.identityVerificationApplication.findUnique({
    where: { id: context.params.id },
    select: {
      id: true, method: true, identityCiphertext: true, identityIv: true, identityAuthTag: true, identityKeyVersion: true,
    },
  });
  if (!application || application.method !== "REAL_NAME_ID" || !application.identityCiphertext || !application.identityIv || !application.identityAuthTag || !application.identityKeyVersion) {
    return NextResponse.json({ error: "实名信息不存在" }, { status: 404 });
  }
  const details = decryptIdentityDetails(application.id, {
    ciphertext: application.identityCiphertext,
    iv: application.identityIv,
    authTag: application.identityAuthTag,
    keyVersion: application.identityKeyVersion,
  });
  await logAudit(req.user.id, AuditAction.IDENTITY_DETAILS_VIEW, AuditTargetType.IDENTITY_APPLICATION, application.id);
  return NextResponse.json({ realName: details.realName, idNumber: details.idNumber, maskedIdNumber: maskChineseId(details.idNumber) }, {
    headers: { "Cache-Control": "private, no-store", Pragma: "no-cache" },
  });
}, "ADMIN", { captureAllTelemetry: true });
