UPDATE "User" AS u
SET "violationCount" = GREATEST(u."violationCount", punishment_counts.count)
FROM (
  SELECT "userId", COUNT(*)::integer AS count
  FROM "UserPunishment"
  WHERE "action" = 'APPLIED' AND "revokedAt" IS NULL
  GROUP BY "userId"
) AS punishment_counts
WHERE u.id = punishment_counts."userId"
  AND u."violationCount" < punishment_counts.count;
