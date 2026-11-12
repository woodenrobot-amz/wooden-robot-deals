import { timingSafeEqual } from "node:crypto";
import { NextRequest, NextResponse } from "next/server";
import { getAmazonItems } from "@/lib/amazon-creators";

export const runtime = "nodejs";

// Same timing-safe Bearer secret pattern as the automation routes
// (app/api/automation/*): AUTOMATION_SECRET, compared with timingSafeEqual.
// The admin deployment sends this secret when it proxies Amazon lookups here.
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

export async function POST(req: NextRequest) {
  if (!isAuthorized(req)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const body = await req.json();
    const asins = body?.asins;

    if (!Array.isArray(asins)) {
      return NextResponse.json(
        { error: "Request body must include asins: string[]" },
        { status: 400 },
      );
    }

    const items = await getAmazonItems(asins);

    const requestedAsins = asins
      .map((a: string) => a.trim().toUpperCase())
      .filter(Boolean);

    const foundAsins = new Set(items.map((item) => item.asin));

    const missingAsins = requestedAsins.filter((asin) => !foundAsins.has(asin));

    return NextResponse.json({
      items,
      missingAsins,
    });
  } catch (error) {
    console.error("Amazon get-items route failed:", error);

    return NextResponse.json(
      {
        error: "Amazon getItems failed",
        detail: error instanceof Error ? error.message : "Unknown error",
      },
      { status: 500 },
    );
  }
}
