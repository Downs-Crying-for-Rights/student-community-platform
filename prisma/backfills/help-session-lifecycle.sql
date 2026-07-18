CREATE TABLE IF NOT EXISTS "_ApplicationBackfill" (
  "name" TEXT PRIMARY KEY,
  "appliedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM "_ApplicationBackfill"
    WHERE "name" = '20260718210000_add_help_session_lifecycle'
  ) THEN
    UPDATE "HelpSession" AS session
    SET
      "status" = CASE task."status"::text
        WHEN 'IN_PROGRESS' THEN 'IN_PROGRESS'::"HelpSessionStatus"
        WHEN 'EVIDENCE_PENDING' THEN 'EVIDENCE_PENDING'::"HelpSessionStatus"
        WHEN 'COMPLETED' THEN 'COMPLETED'::"HelpSessionStatus"
        WHEN 'CLOSED' THEN 'CLOSED'::"HelpSessionStatus"
        WHEN 'DISPUTED' THEN 'DISPUTED'::"HelpSessionStatus"
        ELSE 'CLAIMED'::"HelpSessionStatus"
      END,
      "requesterConfirmed" = task."requesterConfirmed",
      "helperConfirmed" = task."helperConfirmed",
      "closedAt" = CASE
        WHEN task."status"::text IN ('COMPLETED', 'CLOSED') THEN COALESCE(session."closedAt", task."updatedAt")
        ELSE session."closedAt"
      END
    FROM "MutualAidTask" AS task
    WHERE session."taskId" = task."id";

    INSERT INTO "_ApplicationBackfill" ("name")
    VALUES ('20260718210000_add_help_session_lifecycle');
  END IF;
END $$;
