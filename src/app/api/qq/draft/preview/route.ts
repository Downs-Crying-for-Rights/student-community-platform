import { z } from "zod";

import { previewQQDraft, qqNoStoreJson, qqRouteError } from "@/lib/qq-h5";
import { withAuth, type AuthenticatedRequest } from "@/lib/rbac";

export const dynamic = "force-dynamic";

const requestSchema = z.object({ token: z.string().min(1).max(100) }).strict();

export const POST = withAuth(async (request: AuthenticatedRequest) => {
  try {
    const parsed = requestSchema.safeParse(await request.json());
    if (!parsed.success) return qqNoStoreJson({ error: "委托链接参数无效" }, { status: 400 });
    return qqNoStoreJson(await previewQQDraft(request.user.id, parsed.data.token));
  } catch (error) {
    return qqRouteError(error);
  }
});
