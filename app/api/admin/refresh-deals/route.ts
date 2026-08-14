import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { refreshLiveDeals } from "@/lib/pipeline/refreshLiveDeals";

export async function POST() {
  try {
    const supabase = await createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (!user) {
      return NextResponse.json({ error: "Unauthorized." }, { status: 401 });
    }

    const result = await refreshLiveDeals();

    return NextResponse.json({
      refreshed: result.refreshed,
      skipped: result.preserved,
      removed: result.removed,
      deals: result.deals,
      amazonErrors: result.amazonErrors,
    });
  } catch (error) {
    console.error("refresh-deals failed:", error);

    return NextResponse.json(
      {
        error:
          error instanceof Error
            ? error.message
            : "Unknown refresh-deals server error.",
      },
      { status: 500 },
    );
  }
}
