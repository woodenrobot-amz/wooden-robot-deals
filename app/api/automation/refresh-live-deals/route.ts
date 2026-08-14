import { timingSafeEqual } from "node:crypto";
import { NextResponse } from "next/server";
import { refreshLiveDeals } from "@/lib/pipeline/refreshLiveDeals";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

function isAuthorized(request: Request) {
  const expectedSecret = process.env.AUTOMATION_SECRET;
  const authorization = request.headers.get("authorization");
  if (!expectedSecret || !authorization?.startsWith("Bearer ")) return false;
  const expected = Buffer.from(expectedSecret);
  const provided = Buffer.from(authorization.slice("Bearer ".length));
  return expected.length === provided.length && timingSafeEqual(expected, provided);
}

export async function POST(request: Request) {
  if (!isAuthorized(request)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const result = await refreshLiveDeals();
    return NextResponse.json({ ok: true, ranAt: new Date().toISOString(), ...result });
  } catch (error) {
    console.error("automated live deal refresh failed:", error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Unknown error" },
      { status: 500 },
    );
  }
}
