import { NextResponse } from "next/server";
import { getServerSession } from "next-auth/next";
import { authOptions } from "@/lib/auth";
import prisma from "@/lib/prisma";
import { withTelemetry } from "@/lib/telemetry";

const post = async () => {
  try {
    const session = await getServerSession(authOptions);

    if (!session?.user?.id) {
      return NextResponse.json({ error: "未登录" }, { status: 401 });
    }

    const userId = session.user.id;

    const updatedUser = await prisma.user.update({
      where: { id: userId },
      data: {
        onboardingDone: true,
      },
      select: {
        id: true,
        quizPassed: true,
        onboardingDone: true,
      },
    });

    return NextResponse.json({
      success: true,
      user: updatedUser,
    });
  } catch (error) {
    console.error("Onboarding complete error:", error);
    return NextResponse.json(
      { error: "服务器内部错误，请稍后重试" },
      { status: 500 },
    );
  }
};

export const POST = withTelemetry(post, { route: "/api/onboarding/complete" });
