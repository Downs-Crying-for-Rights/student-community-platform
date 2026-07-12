import { NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import redis from "@/lib/redis";
import { withAuth, withOptionalAuth, type AuthenticatedRequest, type OptionalAuthRequest } from "@/lib/rbac";
import { canAccessZone, type ABACUserAttributes } from "@/lib/abac";
import { createBoardSchema } from "@/lib/validators";
import type { BoardZone } from "@prisma/client";

const BOARDS_CACHE_TTL = 300; // 5 minutes

/**
 * GET /api/boards
 * Returns active boards filtered by the user's zone access. Public endpoint (no login required).
 * Unauthenticated users see only PUBLIC zone boards.
 * With ?hot=true: returns boards ordered by PUBLISHED post count descending, with _count included.
 * PUBLIC boards are always visible; PSYCHOLOGY and DCR boards require access.
 */
export const GET = withOptionalAuth(async (req: OptionalAuthRequest) => {
  try {
    // Determine accessible zones
    let accessibleZones: BoardZone[] = ["PUBLIC"];
    let isAdmin = false;

    if (req.user) {
      const user = await prisma.user.findUnique({
        where: { id: req.user.id },
        select: {
          createdAt: true,
          violationCount: true,
          onboardingDone: true,
          quizPassed: true,
          psychAccess: true,
          dcrAccess: true,
          dcrPledgeSigned: true,
          reputationScore: true,
          role: true,
        },
      });

      if (!user) {
        return NextResponse.json({ error: "用户不存在" }, { status: 404 });
      }

      const userAttrs: ABACUserAttributes = user;

      if (canAccessZone(userAttrs, "PSYCHOLOGY").allowed) {
        accessibleZones.push("PSYCHOLOGY");
      }
      if (canAccessZone(userAttrs, "DCR").allowed) {
        accessibleZones.push("DCR");
      }

      isAdmin = user.role === "ADMIN" || user.role === "SUPER_ADMIN";
    }

    const { searchParams } = new URL(req.url);
    const hot = searchParams.get("hot");
    const admin = searchParams.get("admin");

    // Admin mode: return all boards (including inactive) with post counts
    if (admin === "true" && isAdmin) {
      const boards = await prisma.board.findMany({
        include: {
          _count: {
            select: {
              posts: {
                where: { status: "PUBLISHED" },
              },
            },
          },
        },
        orderBy: { sortWeight: "asc" },
      });
      return NextResponse.json({ boards });
    }

    // Build cache key from accessible zones + mode
    const zoneKey = accessibleZones.sort().join(",");
    const cacheKey = hot === "true"
      ? `boards:hot:${zoneKey}`
      : `boards:default:${zoneKey}`;

    // Try Redis cache first
    try {
      const cached = await redis.get(cacheKey);
      if (cached) {
        return NextResponse.json({ boards: JSON.parse(cached) });
      }
    } catch {
      // Redis unavailable — fall through to DB
    }

    if (hot === "true") {
      const boards = await prisma.board.findMany({
        where: {
          isActive: true,
          zone: { in: accessibleZones },
        },
        include: {
          _count: {
            select: {
              posts: {
                where: { status: "PUBLISHED" },
              },
            },
          },
        },
        orderBy: {
          posts: { _count: "desc" },
        },
      });

      // Cache to Redis
      try {
        await redis.set(cacheKey, JSON.stringify(boards), "EX", BOARDS_CACHE_TTL);
      } catch {
        // Redis unavailable — continue without caching
      }

      return NextResponse.json({ boards });
    }

    const boards = await prisma.board.findMany({
      where: {
        isActive: true,
        zone: { in: accessibleZones },
      },
      orderBy: { sortWeight: "asc" },
    });

    // Cache to Redis
    try {
      await redis.set(cacheKey, JSON.stringify(boards), "EX", BOARDS_CACHE_TTL);
    } catch {
      // Redis unavailable — continue without caching
    }

    return NextResponse.json({ boards });
  } catch (error) {
    console.error("GET /api/boards error:", error);
    return NextResponse.json(
      { error: "服务器内部错误" },
      { status: 500 },
    );
  }
});

/**
 * POST /api/boards
 * Admin-only: create a new board.
 */
export const POST = withAuth(async (req: AuthenticatedRequest) => {
  try {
    const body = await req.json();
    const parsed = createBoardSchema.safeParse(body);

    if (!parsed.success) {
      return NextResponse.json(
        { error: "参数校验失败", details: parsed.error.flatten().fieldErrors },
        { status: 400 },
      );
    }

    const { name, description, zone, sortWeight } = parsed.data;

    const board = await prisma.board.create({
      data: { name, description, zone, sortWeight },
    });

    return NextResponse.json({ board }, { status: 201 });
  } catch (error) {
    console.error("POST /api/boards error:", error);
    return NextResponse.json(
      { error: "服务器内部错误" },
      { status: 500 },
    );
  }
}, "ADMIN");
