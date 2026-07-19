import { z } from "zod";

import { confirmQQTaskPublish, qqNoStoreJson, qqRouteError } from "@/lib/qq-h5";
import { withAuth, type AuthenticatedRequest } from "@/lib/rbac";

export const dynamic = "force-dynamic";

const requestSchema = z.object({ token: z.string().min(1).max(100), confirmed: z.literal(true) }).strict();

export const POST = withAuth(async (request: AuthenticatedRequest) => {
  try {
    const parsed = requestSchema.safeParse(await request.json());
    if (!parsed.success) return qqNoStoreJson({ error: "请明确确认发布" }, { status: 400 });
    const result = await confirmQQTaskPublish(request.user.id, parsed.data.token);
    return qqNoStoreJson({ ...result, taskUrl: `/dcr/tasks/${result.task.id}` }, { status: result.existing ? 200 : 201 });
  } catch (error) {
    return qqRouteError(error);
  }
});
