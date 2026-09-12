import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

const ALLOWED_HOSTS = new Set([
  "amzlink.to",
  "www.amzlink.to",
  "a.co",
  "www.amazon.com",
  "amazon.com",
  "amzn.to",
  "www.amzn.to",
]);

function decodeHtml(value: string) {
  return value
    .replace(/&amp;/g, "&")
    .replace(/&quot;/g, '"')
    .replace(/&#39;|&#x27;/g, "'")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">");
}

function meta(html: string, key: string) {
  const escaped = key.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const patterns = [
    new RegExp(`<meta[^>]+(?:property|name)=["']${escaped}["'][^>]+content=["']([^"']+)["'][^>]*>`, "i"),
    new RegExp(`<meta[^>]+content=["']([^"']+)["'][^>]+(?:property|name)=["']${escaped}["'][^>]*>`, "i"),
  ];
  for (const pattern of patterns) {
    const match = html.match(pattern);
    if (match?.[1]) return decodeHtml(match[1]);
  }
  return "";
}

function asinFrom(value: string) {
  return value.match(/\/(?:dp|gp\/product)\/([A-Z0-9]{10})(?:[/?]|$)/i)?.[1]?.toUpperCase() || "";
}

function safeHttpUrl(value: string) {
  try {
    const url = new URL(value);
    return (url.protocol === "https:" || url.protocol === "http:") ? url.toString() : "";
  } catch {
    return "";
  }
}

export async function GET(request: NextRequest) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const rawUrl = request.nextUrl.searchParams.get("url") || "";
  let source: URL;
  try {
    source = new URL(rawUrl);
  } catch {
    return NextResponse.json({ error: "Invalid URL" }, { status: 400 });
  }
  if (source.protocol !== "https:" || !ALLOWED_HOSTS.has(source.hostname.toLowerCase())) {
    return NextResponse.json({ error: "Unsupported preview host" }, { status: 400 });
  }

  try {
    const response = await fetch(source, {
      redirect: "follow",
      cache: "no-store",
      headers: {
        "User-Agent": "Mozilla/5.0 (compatible; PostingDeskLinkCheck/1.0)",
        Accept: "text/html,application/xhtml+xml",
      },
      signal: AbortSignal.timeout(7000),
    });

    const destinationUrl = response.url || source.toString();
    const destination = new URL(destinationUrl);
    if (!ALLOWED_HOSTS.has(destination.hostname.toLowerCase())) {
      return NextResponse.json({ url: source.toString(), error: "Unexpected redirect" });
    }

    const html = (await response.text()).slice(0, 750_000);
    const asin = asinFrom(destinationUrl) || asinFrom(html);
    const title = meta(html, "og:title") || meta(html, "twitter:title") ||
      decodeHtml(html.match(/<title[^>]*>([^<]+)<\/title>/i)?.[1] || "").replace(/\s*:\s*Amazon\.com.*$/i, "").trim();
    const image = safeHttpUrl(meta(html, "og:image") || meta(html, "twitter:image")) ||
      (asin ? `https://images.amazon.com/images/P/${asin}.01.LZZZZZZZ.jpg` : "");

    return NextResponse.json({
      url: source.toString(),
      destinationUrl,
      title: title || (asin ? `Amazon product ${asin}` : "Amazon link"),
      image,
    });
  } catch {
    return NextResponse.json({ url: source.toString(), error: "Preview unavailable" });
  }
}
