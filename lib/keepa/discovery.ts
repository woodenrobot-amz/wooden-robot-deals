export async function runKeepaDiscovery(selection: Record<string, unknown>) {
  const keepaKey = process.env.KEEPA_API_KEY;

  if (!keepaKey) {
    throw new Error("Missing KEEPA_API_KEY");
  }

  const url = new URL("https://api.keepa.com/query");
  url.searchParams.set("key", keepaKey);
  url.searchParams.set("domain", "1");

  const response = await fetch(url.toString(), {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ selection }),
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
    tokensLeft: data?.tokensLeft || null,
    refillIn: data?.refillIn || null,
  };
}
