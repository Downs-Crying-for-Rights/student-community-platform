import { NextResponse } from "next/server";
import { DEFAULT_HOME_HERO, getHomeHeroConfig } from "@/lib/home-content";
import { withTelemetry } from "@/lib/telemetry";

export const dynamic = "force-dynamic";

const get = async () => {
  try {
    return NextResponse.json(
      { hero: await getHomeHeroConfig() },
      { headers: { "Cache-Control": "no-store" } },
    );
  } catch (error) {
    console.error("GET /api/home-content error:", error);
    return NextResponse.json(
      { hero: DEFAULT_HOME_HERO },
      { headers: { "Cache-Control": "no-store" } },
    );
  }
};

export const GET = withTelemetry(get, { route: "/api/home-content" });
