-- Preserve the newest pending application and close older duplicates before
-- enforcing the invariant at the database boundary.
WITH ranked AS (
  SELECT "id",
         row_number() OVER (
           PARTITION BY "applicantId", "type"
           ORDER BY "createdAt" DESC, "id" DESC
         ) AS rn
  FROM "AccessApplication"
  WHERE "status" = 'PENDING'
)
UPDATE "AccessApplication" AS application
SET "status" = 'REJECTED',
    "reviewedAt" = COALESCE(application."reviewedAt", CURRENT_TIMESTAMP),
    "reviewNote" = COALESCE(application."reviewNote", '重复待审申请已由数据库约束迁移关闭')
FROM ranked
WHERE application."id" = ranked."id"
  AND ranked.rn > 1;

CREATE UNIQUE INDEX "AccessApplication_one_pending_per_applicant_type"
ON "AccessApplication" ("applicantId", "type")
WHERE "status" = 'PENDING';
