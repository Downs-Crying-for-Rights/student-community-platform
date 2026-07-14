import { NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import { withAuth, type AuthenticatedRequest } from "@/lib/rbac";

export const GET = withAuth(async (req: AuthenticatedRequest) => {
  // Get all active questions, shuffle and pick 5
  const all = await prisma.dcrQuizQuestion.findMany({
    where: { active: true },
    select: { id: true, text: true, options: true, type: true, score: true },
  });
  // Fisher-Yates shuffle
  for (let i = all.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [all[i], all[j]] = [all[j], all[i]];
  }
  const questions = all.slice(0, 5).map((q) => ({
    id: q.id,
    text: q.text,
    options: q.options,
    type: q.type,
    score: q.score,
  }));
  return NextResponse.json({ questions });
});
