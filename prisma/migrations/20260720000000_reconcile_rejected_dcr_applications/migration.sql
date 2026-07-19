UPDATE "AccessApplication" AS application
SET
  "status" = 'REJECTED'::"ApplicationStatus",
  "reviewNote" = COALESCE(
    application."reviewNote",
    rejected_case."reviewNote",
    '关联委托审核未通过，可重新提交委托'
  ),
  "reviewedAt" = COALESCE(application."reviewedAt", CURRENT_TIMESTAMP)
FROM "Case" AS rejected_case
WHERE application."type" = 'DCR'::"ApplicationType"
  AND application."status" = 'PENDING'::"ApplicationStatus"
  AND application."caseId" = rejected_case."id"
  AND rejected_case."requestStatus" = 'REJECTED'::"RequestStatus";
