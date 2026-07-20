import { NextResponse } from "next/server";
import { z } from "zod";
import prisma from "@/lib/prisma";
import { logAudit, AuditAction, AuditTargetType } from "@/lib/audit";
import { getHomeHeroConfig } from "@/lib/home-content";
import { withAuth, type AuthenticatedRequest } from "@/lib/rbac";

const internalHrefSchema = z.string().min(1).max(300).refine(
  (value) => value.startsWith("/") && !value.startsWith("//"),
  "跳转路径必须是以 / 开头的站内路径",
);

const updateSchema = z.object({
  title: z.string().trim().min(1).max(100),
  description: z.string().trim().min(1).max(500),
  links: z.tuple([
    z.object({ label: z.string().trim().min(1).max(30), href: internalHrefSchema }).strict(),
    z.object({ label: z.string().trim().min(1).max(30), href: internalHrefSchema }).strict(),
    z.object({ label: z.string().trim().min(1).max(30), href: internalHrefSchema }).strict(),
  ]),
}).strict();

export const dynamic = "force-dynamic";

export const GET = withAuth(async () => NextResponse.json(
  { hero: await getHomeHeroConfig() },
  { headers: { "Cache-Control": "private, no-store" } },
), "SUPER_ADMIN");

export const PATCH = withAuth(async (req: AuthenticatedRequest) => {
  const parsed = updateSchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json(
      { error: "参数校验失败", details: parsed.error.flatten().fieldErrors },
      { status: 400 },
    );
  }

  const config = await prisma.systemConfig.upsert({
    where: { id: "default" },
    create: {
      id: "default",
      homeHeroTitle: parsed.data.title,
      homeHeroDescription: parsed.data.description,
      homeHeroLinks: parsed.data.links,
      updatedById: req.user.id,
    },
    update: {
      homeHeroTitle: parsed.data.title,
      homeHeroDescription: parsed.data.description,
      homeHeroLinks: parsed.data.links,
      updatedById: req.user.id,
      revision: { increment: 1 },
    },
  });
  await logAudit(req.user.id, AuditAction.SITE_CONTENT_UPDATE, AuditTargetType.SYSTEM, "home-hero", {
    title: parsed.data.title,
    links: parsed.data.links,
    revision: config.revision,
  });

  return NextResponse.json({ hero: parsed.data }, { headers: { "Cache-Control": "private, no-store" } });
}, "SUPER_ADMIN");
