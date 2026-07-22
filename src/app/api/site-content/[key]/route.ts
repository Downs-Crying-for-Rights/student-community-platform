import { NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import { COMMUNITY_GUIDELINES_KEY, getCommunityGuidelines } from "@/lib/community-guidelines";
import { withTelemetry } from "@/lib/telemetry";
import { ACCOUNT_DELETION_NOTICE_KEY, getAccountDeletionNotice } from "@/lib/account-deletion-notice";

const get = async (
  _req: Request,
  context: { params: Record<string, string> }
) => {
  const { key } = context.params;
  if (key === COMMUNITY_GUIDELINES_KEY) {
    return NextResponse.json(await getCommunityGuidelines());
  }
  if (key === ACCOUNT_DELETION_NOTICE_KEY) {
    return NextResponse.json(await getAccountDeletionNotice());
  }
  const item = await prisma.siteContent.findUnique({
    where: { key },
    select: { title: true, content: true, revision: true, updatedAt: true },
  });
  if (!item) {
    return NextResponse.json({ title: "用户协议", content: "", updatedAt: null });
  }
  return NextResponse.json(item);
};

export const GET = withTelemetry(get, { route: "/api/site-content/[key]" });
