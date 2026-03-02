import { NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import { withAuth, type AuthenticatedRequest } from "@/lib/rbac";
import { logAudit, AuditAction, AuditTargetType } from "@/lib/audit";
import { scanContent } from "@/lib/sensitive-engine";
import { hashIP } from "@/lib/utils";
import {
  sanitizeFormData,
  buildCsvRow,
  CSV_HEADERS,
  type CaseExportData,
} from "@/lib/csv-helpers";

/**
 * GET /api/cases/[id]/export
 * Export case data as CSV with secondary desensitization.
 * - Admin only (enforced by withAuth "ADMIN")
 * - Parses formData JSON, concatenates values, calls scanContent for sensitive matches
 * - Calls sanitizeFormData to replace sensitive words with [已脱敏]
 * - Hashes submitterId with hashIP
 * - Uses buildCsvRow + CSV_HEADERS to generate RFC 4180 compliant CSV
 * - Logs audit for export
 *
 * Validates: Requirements 5.1, 5.2, 5.3, 5.4, 5.5, 5.6, 5.7, 5.8, 5.9
 */
export const GET = withAuth(async (req: AuthenticatedRequest, context) => {
  try {
    const userId = req.user.id;
    const { id } = await context.params;

    const caseRecord = await prisma.case.findUnique({
      where: { id },
    });

    if (!caseRecord) {
      return NextResponse.json({ error: "委托不存在" }, { status: 404 });
    }

    // Parse formData from JSON
    const rawFormData = (caseRecord.formData ?? {}) as Record<string, string>;

    // Concatenate all form values and scan for sensitive content
    const allValues = Object.values(rawFormData).join(" ");
    const matches = await scanContent(allValues);

    // Sanitize formData using shared helper
    const sanitized = sanitizeFormData(rawFormData, matches);

    // Hash submitterId
    const hashedSubmitterId = hashIP(caseRecord.submitterId);

    // Build CSV export data
    const exportData: CaseExportData = {
      id: caseRecord.id,
      category: caseRecord.category,
      status: caseRecord.status,
      formData: JSON.stringify(sanitized),
      pledgeText: caseRecord.pledgeText,
      createdAt: caseRecord.createdAt.toISOString(),
      submitterId: hashedSubmitterId,
    };

    // Generate CSV content
    const csv = [CSV_HEADERS, buildCsvRow(exportData)].join("\n");

    // Log audit for export
    await logAudit(
      userId,
      AuditAction.CASE_EXPORT,
      AuditTargetType.CASE,
      id,
      { action: "EXPORT_CSV" },
    );

    return new NextResponse(csv, {
      status: 200,
      headers: {
        "Content-Type": "text/csv; charset=utf-8",
        "Content-Disposition": `attachment; filename="case-${id}.csv"`,
      },
    });
  } catch (error) {
    console.error("GET /api/cases/[id]/export error:", error);
    return NextResponse.json({ error: "服务器内部错误" }, { status: 500 });
  }
}, "ADMIN");
