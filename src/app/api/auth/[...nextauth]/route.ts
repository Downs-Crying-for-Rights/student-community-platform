import NextAuth from "next-auth";
import { getAuthOptionsWithQQ } from "@/lib/auth";
import { withTelemetry } from "@/lib/telemetry";

export const dynamic = "force-dynamic";

async function authHandler(req: Request, ctx: unknown) {
  const opts = await getAuthOptionsWithQQ();
  return NextAuth(opts)(req, ctx);
}

export const GET = withTelemetry(authHandler, { route: "/api/auth/[...nextauth]" });
export const POST = withTelemetry(authHandler, { route: "/api/auth/[...nextauth]" });
