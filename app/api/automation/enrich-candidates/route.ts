import { timingSafeEqual } from "node:crypto";
import { NextResponse } from "next/server";
import { getBigRunPreset } from "@/lib/discovery/bigRun";
import { enrichCandidateQueue } from "@/lib/pipeline/enrichCandidates";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

function isAuthorized(request: Request) {
  const expectedSecret = process.env.AUTOMATION_SECRET;
  const authorization = request.headers.get("authorization");

  if (!expectedSecret || !authorization?.startsWith("Bearer ")) {
    return false;
  }

  const providedSecret = authorization.slice("Bearer ".length);
  const expected = Buffer.from(expectedSecret);
  const provided = Buffer.from(providedSecret);

  return (
    expected.length === provided.length && timingSafeEqual(expected, provided)
  );
}

export async function POST(request: Request) {
  if (!isAuthorized(request)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const body = await request.json().catch(() => ({}));
    const limit = body.limit == null ? undefined : Number(body.limit);
    const preset = getBigRunPreset(String(body.bigRunPreset ?? ""));
    if (body.bigRunPreset != null && !preset) {
      return NextResponse.json({ error: "Unknown Big Run preset" }, { status: 400 });
    }
    const result = await enrichCandidateQueue(limit, preset?.streamId);

    return NextResponse.json({
      ok: true,
      ranAt: new Date().toISOString(),
      ...result,
    });
  } catch (error) {
    console.error("automated candidate enrichment failed:", error);

    return NextResponse.json(
      {
        error: error instanceof Error ? error.message : "Unknown error",
      },
      { status: 500 },
    );
  }
}
