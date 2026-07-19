import { NextResponse } from "next/server";

import { getChatMonitoringConsent } from "@/lib/chat-monitoring-consent";
import { withAuth, type AuthenticatedRequest } from "@/lib/rbac";

export const GET = withAuth(async (_req: AuthenticatedRequest) => {
  const consent = await getChatMonitoringConsent();
  return NextResponse.json({
    title: consent.title,
    content: consent.content,
    version: consent.revision,
  });
});
