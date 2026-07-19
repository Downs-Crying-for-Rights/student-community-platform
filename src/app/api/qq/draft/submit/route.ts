import { z } from "zod";

import { sendAdminActionMail } from "@/lib/mail";
import { qqNoStoreJson, qqRouteError, submitQQDraft } from "@/lib/qq-h5";
import { enqueueQQCaseReviewNotifications } from "@/lib/qq-notifications";
import { withAuth, type AuthenticatedRequest } from "@/lib/rbac";

export const dynamic = "force-dynamic";

const requestSchema = z.object({
  token: z.string().min(1).max(100),
  payloadHash: z.string().min(20).max(100),
  confirmations: z.tuple([z.literal(true), z.literal(true), z.literal(true)]),
}).strict();

export const POST = withAuth(async (request: AuthenticatedRequest) => {
  try {
    const parsed = requestSchema.safeParse(await request.json());
    if (!parsed.success) return qqNoStoreJson({ error: "请核对草稿并完成全部三项确认" }, { status: 400 });

    const result = await submitQQDraft(
      request.user.id,
      parsed.data.token,
      parsed.data.payloadHash,
      parsed.data.confirmations,
    );
    await Promise.allSettled([
      sendAdminActionMail({
        minimumRole: "MODERATOR",
        subject: "QQ 委托待审核",
        text: "收到一份经用户在 H5 页面最终确认的 DCR 委托。",
        actionUrl: "/admin/dcr/reviews?requestStatus=PENDING",
      }),
      enqueueQQCaseReviewNotifications(result.caseId, result.category),
    ]);
    return qqNoStoreJson(result, { status: 201 });
  } catch (error) {
    return qqRouteError(error);
  }
});
