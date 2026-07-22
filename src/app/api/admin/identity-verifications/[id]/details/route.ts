import { NextResponse } from "next/server";

import prisma from "@/lib/prisma";
import { withAuth, type AuthenticatedRequest } from "@/lib/rbac";
import { AuditAction, AuditTargetType, logAudit } from "@/lib/audit";
import { decryptIdentityDetails, decryptSchoolDetails, maskChineseId } from "@/lib/identity-verification";

export const dynamic = "force-dynamic";

export const GET = withAuth(async (req: AuthenticatedRequest, context: { params: Record<string, string> }) => {
  const application = await prisma.identityVerificationApplication.findUnique({
    where: { id: context.params.id },
    select: {
      id: true, method: true, status: true, identityCiphertext: true, identityIv: true, identityAuthTag: true, identityKeyVersion: true,
    },
  });
  if (!application || application.status === "CANCELLED" || !["REAL_NAME_ID", "ID_HOLDING_PHOTO", "SCHOOL_UNIFORM"].includes(application.method) || !application.identityCiphertext || !application.identityIv || !application.identityAuthTag || !application.identityKeyVersion) {
    return NextResponse.json({ error: "实名信息不存在" }, { status: 404 });
  }
  const envelope = {
    ciphertext: application.identityCiphertext,
    iv: application.identityIv,
    authTag: application.identityAuthTag,
    keyVersion: application.identityKeyVersion,
  };
  await logAudit(req.user.id, AuditAction.IDENTITY_DETAILS_VIEW, AuditTargetType.IDENTITY_APPLICATION, application.id);
  const details = application.method === "SCHOOL_UNIFORM"
    ? { method: application.method, ...decryptSchoolDetails(application.id, envelope) }
    : (() => {
        const identity = decryptIdentityDetails(application.id, envelope);
        return { method: application.method, realName: identity.realName, idNumber: identity.idNumber, maskedIdNumber: maskChineseId(identity.idNumber) };
      })();
  return NextResponse.json(details, {
    headers: { "Cache-Control": "private, no-store", Pragma: "no-cache" },
  });
}, "ADMIN", { captureAllTelemetry: true });
