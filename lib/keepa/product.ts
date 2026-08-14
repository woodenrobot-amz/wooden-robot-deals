const KEEPA_DOMAIN_US = 1;
const KEEPA_PRODUCT_BATCH_LIMIT = 100;

export function keepaCentsToDollars(value: unknown) {
  const cents = Number(value);

  if (!Number.isFinite(cents) || cents <= 0) return null;

  return Math.round((cents / 100) * 100) / 100;
}

export function getKeepaImageUrl(product: any) {
  if (product.imagesCSV) {
    return `https://images-na.ssl-images-amazon.com/images/I/${
      String(product.imagesCSV).split(",")[0]
    }`;
  }

  if (Array.isArray(product.images) && product.images.length) {
    const first = product.images[0];

    if (first.l) {
      return `https://images-na.ssl-images-amazon.com/images/I/${first.l}`;
    }

    if (first.m) {
      return `https://images-na.ssl-images-amazon.com/images/I/${first.m}`;
    }
  }

  return "";
}

export function getKeepaBestPrice(product: any) {
  const current = product?.stats?.current || [];
  const avg90 = product?.stats?.avg90 || [];

  const currentCandidates = [current[18], current[1], current[0]];
  const avg90Candidates = [avg90[18], avg90[1], avg90[0]];

  const currentPrice =
    currentCandidates.map(keepaCentsToDollars).find(Boolean) || null;

  const avg90Price =
    avg90Candidates.map(keepaCentsToDollars).find(Boolean) || null;

  return { currentPrice, avg90Price };
}

export async function getKeepaProductsByAsins(asins: string[]) {
  const keepaKey = process.env.KEEPA_API_KEY;

  if (!keepaKey) {
    throw new Error("Missing KEEPA_API_KEY environment variable.");
  }

  const cleanAsins = [
    ...new Set(
      asins
        .map((asin) => asin.trim().toUpperCase())
        .filter(Boolean),
    ),
  ];

  if (cleanAsins.length === 0) {
    return {
      products: [],
      tokensLeft: null,
      tokensConsumed: 0,
    };
  }

  if (cleanAsins.length > KEEPA_PRODUCT_BATCH_LIMIT) {
    throw new Error(
      `Keepa product batches cannot exceed ${KEEPA_PRODUCT_BATCH_LIMIT} ASINs.`,
    );
  }

  const keepaUrl = new URL("https://api.keepa.com/product");
  keepaUrl.searchParams.set("key", keepaKey);
  keepaUrl.searchParams.set("domain", String(KEEPA_DOMAIN_US));
  keepaUrl.searchParams.set("asin", cleanAsins.join(","));
  keepaUrl.searchParams.set("stats", "90");

  const response = await fetch(keepaUrl.toString(), {
    headers: {
      Accept: "application/json",
      "Accept-Encoding": "gzip",
    },
    cache: "no-store",
  });

  const data = await response.json().catch(() => null);

  if (!response.ok) {
    throw new Error(
      `Keepa request failed: ${response.status} ${JSON.stringify(data)}`,
    );
  }

  return {
    products: data?.products || [],
    tokensLeft: data?.tokensLeft ?? null,
    tokensConsumed: data?.tokensConsumed ?? null,
  };
}

export async function getKeepaProductByAsin(asin: string) {
  const result = await getKeepaProductsByAsins([asin]);
  const product = result.products[0];

  if (!product) {
    throw new Error("No Keepa product found for that ASIN.");
  }

  return product;
}
