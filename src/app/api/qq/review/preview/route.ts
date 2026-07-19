import { z } from "zod";

import { previewQQCaseReview, qqNoStoreJson, qqRouteError } from "@/lib/qq-h5";
import { withAuth, type AuthenticatedRequest } from "@/lib/rbac";

export const dynamic = "force-dynamic";

const requestSchema = z.object({ token: z.string().min(1).max(100), consume: z.boolean().optional() }).strict();

export const POST = withAuth(async (request: AuthenticatedRequest) => {
  try {
    const parsed = requestSchema.safeParse(await request.json());
    if (!parsed.success) return qqNoStoreJson({ error: "审核链接参数无效" }, { status: 400 });
    return qqNoStoreJson(await previewQQCaseReview(request.user.id, parsed.data.token, parsed.data.consume));
  } catch (error) {
    return qqRouteError(error);
  }
});
