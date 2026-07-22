ALTER TABLE "Post" ADD COLUMN "reportAutoHidden" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "Comment" ADD COLUMN "reportAutoHidden" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "Report" ADD COLUMN "targetKey" TEXT;

UPDATE "Report"
SET "targetKey" = CASE
  WHEN "targetUserId" IS NOT NULL THEN 'user:' || "targetUserId"
  WHEN "targetPostId" IS NOT NULL THEN 'post:' || "targetPostId"
  WHEN "targetCommentId" IS NOT NULL THEN 'comment:' || "targetCommentId"
  WHEN "targetTaskId" IS NOT NULL THEN 'task:' || "targetTaskId"
  WHEN "targetCaseMessageId" IS NOT NULL THEN 'case-message:' || "targetCaseMessageId"
  WHEN "targetHelpMessageId" IS NOT NULL THEN 'help-message:' || "targetHelpMessageId"
  WHEN "targetDmMessageId" IS NOT NULL THEN 'dm-message:' || "targetDmMessageId"
  WHEN "targetChatMessageId" IS NOT NULL THEN 'chat-message:' || "targetChatMessageId"
  WHEN "targetChatRoomId" IS NOT NULL THEN 'chat-room:' || "targetChatRoomId"
  ELSE 'legacy:' || "id"
END;

DELETE FROM "Report" duplicate
USING "Report" retained
WHERE duplicate."reporterId" = retained."reporterId"
  AND duplicate."targetKey" = retained."targetKey"
  AND (duplicate."createdAt", duplicate."id") > (retained."createdAt", retained."id");

ALTER TABLE "Report" ALTER COLUMN "targetKey" SET NOT NULL;
ALTER TABLE "Report" ADD CONSTRAINT "Report_exactly_one_target_check" CHECK (
  num_nonnulls(
    "targetUserId", "targetPostId", "targetCommentId", "targetTaskId",
    "targetCaseMessageId", "targetHelpMessageId", "targetDmMessageId",
    "targetChatMessageId", "targetChatRoomId"
  ) = 1
);
ALTER TABLE "Report" ADD CONSTRAINT "Report_target_key_matches_target_check" CHECK (
  "targetKey" = CASE
    WHEN "targetUserId" IS NOT NULL THEN 'user:' || "targetUserId"
    WHEN "targetPostId" IS NOT NULL THEN 'post:' || "targetPostId"
    WHEN "targetCommentId" IS NOT NULL THEN 'comment:' || "targetCommentId"
    WHEN "targetTaskId" IS NOT NULL THEN 'task:' || "targetTaskId"
    WHEN "targetCaseMessageId" IS NOT NULL THEN 'case-message:' || "targetCaseMessageId"
    WHEN "targetHelpMessageId" IS NOT NULL THEN 'help-message:' || "targetHelpMessageId"
    WHEN "targetDmMessageId" IS NOT NULL THEN 'dm-message:' || "targetDmMessageId"
    WHEN "targetChatMessageId" IS NOT NULL THEN 'chat-message:' || "targetChatMessageId"
    WHEN "targetChatRoomId" IS NOT NULL THEN 'chat-room:' || "targetChatRoomId"
  END
);
CREATE UNIQUE INDEX "Report_reporterId_targetKey_key" ON "Report"("reporterId", "targetKey");
