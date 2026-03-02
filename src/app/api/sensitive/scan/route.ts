import { NextResponse } from "next/server";
import { withAuth, type AuthenticatedRequest } from "@/lib/rbac";
import { scanContent } from "@/lib/sensitive-engine";
import { z } from "zod";

const scanSchema = z.object({
  text: z.string().min(1, "文本不能为空").max(10000, "文本不能超过 10000 个字符"),
});

/**
 * POST /api/sensitive/scan
 * Scan text for sensitive content (used by DCR wizard privacy check step).
 * - Requires auth
 * - Accepts { text: string }
 * - Returns { matches: SensitiveMatch[] }
 *
 * Validates: Requirements 10.3, 10.4, 15.5
 */
export const POST = withAuth(async (req: AuthenticatedRequest) => {
  try {
    const body = await req.json();
    const parsed = scanSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json(
        { error: "参数校验失败", details: parsed.error.flatten().fieldErrors },
        { status: 400 },
      );
    }

    const matches = await scanContent(parsed.data.text);

    return NextResponse.json({ matches });
  } catch (error) {
    console.error("POST /api/sensitive/scan error:", error);
    return NextResponse.json({ error: "服务器内部错误" }, { status: 500 });
  }
});
