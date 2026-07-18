ALTER TABLE "Report"
  ADD COLUMN "targetCaseMessageId" TEXT,
  ADD COLUMN "targetHelpMessageId" TEXT,
  ADD COLUMN "targetDmMessageId" TEXT,
  ADD COLUMN "targetChatMessageId" TEXT,
  ADD COLUMN "targetChatRoomId" TEXT;

CREATE INDEX "Report_targetCaseMessageId_idx" ON "Report"("targetCaseMessageId");
CREATE INDEX "Report_targetHelpMessageId_idx" ON "Report"("targetHelpMessageId");
CREATE INDEX "Report_targetDmMessageId_idx" ON "Report"("targetDmMessageId");
CREATE INDEX "Report_targetChatMessageId_idx" ON "Report"("targetChatMessageId");
CREATE INDEX "Report_targetChatRoomId_idx" ON "Report"("targetChatRoomId");

ALTER TABLE "Report" ADD CONSTRAINT "Report_targetCaseMessageId_fkey"
  FOREIGN KEY ("targetCaseMessageId") REFERENCES "Message"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "Report" ADD CONSTRAINT "Report_targetHelpMessageId_fkey"
  FOREIGN KEY ("targetHelpMessageId") REFERENCES "HelpChatMessage"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "Report" ADD CONSTRAINT "Report_targetDmMessageId_fkey"
  FOREIGN KEY ("targetDmMessageId") REFERENCES "DMMessage"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "Report" ADD CONSTRAINT "Report_targetChatMessageId_fkey"
  FOREIGN KEY ("targetChatMessageId") REFERENCES "ChatMessage"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "Report" ADD CONSTRAINT "Report_targetChatRoomId_fkey"
  FOREIGN KEY ("targetChatRoomId") REFERENCES "ChatRoom"("id") ON DELETE SET NULL ON UPDATE CASCADE;
