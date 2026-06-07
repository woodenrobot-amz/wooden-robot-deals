import { NextRequest, NextResponse } from "next/server";
import { getAmazonItems } from "@/lib/amazon-creators";

export const runtime = "nodejs";

export async function POST(req: NextRequest) {
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
