import { NextResponse } from "next/server";
import { runStream } from "@/lib/discovery/runStream";

export async function POST(request: Request) {
  try {
    const body = await request.json();

    const streamName = body.streamName;

    if (!streamName) {
      return NextResponse.json(
        {
          error: "streamName is required",
        },
        { status: 400 },
      );
    }

    const results = await runStream(streamName);

    return NextResponse.json(results);
  } catch (error) {
    console.error(error);

    return NextResponse.json(
      {
        error: error instanceof Error ? error.message : "Unknown error",
      },
      { status: 500 },
    );
  }
}
