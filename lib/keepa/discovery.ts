function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

export async function runKeepaDiscovery(config: Record<string, unknown>) {
  const keepaKey = process.env.KEEPA_API_KEY;

  if (!keepaKey) {
    throw new Error("Missing KEEPA_API_KEY");
  }

  const nestedSelection = config.selection;
  const selection =
    isRecord(nestedSelection) && Object.keys(nestedSelection).length > 0
      ? nestedSelection
      : config;

  if (Object.keys(selection).length === 0) {
    throw new Error("Keepa discovery selection is empty.");
  }

  const url = new URL("https://api.keepa.com/query");
  url.searchParams.set("key", keepaKey);
  url.searchParams.set("domain", "1");
  url.searchParams.set("selection", JSON.stringify(selection));

  const response = await fetch(url.toString(), {
    method: "GET",
    headers: {
      Accept: "application/json",
      "Accept-Encoding": "gzip",
    },
    cache: "no-store",
  });

  const data = await response.json().catch(() => null);

  if (!response.ok) {
    console.error("Keepa discovery error:", data);
    throw new Error(
      `Keepa discovery failed: ${response.status} ${JSON.stringify(data)}`,
    );
  }

  return {
    asinList: data?.asinList || [],
    totalResults: data?.totalResults || 0,
    tokensLeft: data?.tokensLeft ?? null,
    tokensConsumed: data?.tokensConsumed ?? null,
    refillIn: data?.refillIn ?? null,
  };
}
