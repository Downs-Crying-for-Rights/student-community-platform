import NextAuth from "next-auth";
import { getAuthOptionsWithQQ } from "@/lib/auth";

export const dynamic = "force-dynamic";

export async function GET(req: Request, ctx: any) {
  const opts = await getAuthOptionsWithQQ();
  // @ts-expect-error NextAuth internal signatures
  return NextAuth(opts)(req, ctx);
}

export async function POST(req: Request, ctx: any) {
  const opts = await getAuthOptionsWithQQ();
  // @ts-expect-error NextAuth internal signatures
  return NextAuth(opts)(req, ctx);
}
