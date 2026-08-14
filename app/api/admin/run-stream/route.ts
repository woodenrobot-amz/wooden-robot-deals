import { NextResponse } from "next/server";
import { runStream } from "@/lib/discovery/runStream";
import { createClient } from "@/lib/supabase/server";

export async function POST(request: Request) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const body = await request.json();
    const streamName = String(body.streamName || "").trim();

    if (!streamName) {
      return NextResponse.json(
        { error: "streamName is required" },
        { status: 400 },
      );
    }

    const results = await runStream(streamName);

    return NextResponse.json(results);
  } catch (error) {
    console.error("run-stream failed:", error);

    return NextResponse.json(
      {
        error: error instanceof Error ? error.message : "Unknown error",
      },
      { status: 500 },
    );
  }
}
