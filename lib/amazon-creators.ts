type CachedAmazonToken = {
  accessToken: string;
  expiresAt: number;
};

let cachedToken: CachedAmazonToken | null = null;

const AMAZON_MAX_ATTEMPTS = 4;
const AMAZON_RETRY_BASE_MS = 1_000;

function wait(milliseconds: number) {
  return new Promise((resolve) => setTimeout(resolve, milliseconds));
}

function getRetryDelay(response: Response, attempt: number) {
  const retryAfter = response.headers.get("retry-after");
  const retryAfterSeconds = retryAfter ? Number(retryAfter) : Number.NaN;

  if (Number.isFinite(retryAfterSeconds) && retryAfterSeconds >= 0) {
    return Math.max(AMAZON_RETRY_BASE_MS, retryAfterSeconds * 1_000);
  }

  return AMAZON_RETRY_BASE_MS * 2 ** attempt;
}

function requireEnv(name: string): string {
  const value = process.env[name];

  if (!value) {
    throw new Error(`Missing required env var: ${name}`);
  }

  return value;
}

async function getAmazonAccessToken(): Promise<string> {
  if (cachedToken && Date.now() < cachedToken.expiresAt) {
    return cachedToken.accessToken;
  }

  const res = await fetch("https://api.amazon.com/auth/o2/token", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      grant_type: "client_credentials",
      client_id: requireEnv("AMAZON_CREDENTIAL_ID"),
      client_secret: requireEnv("AMAZON_SECRET"),
      scope: "creatorsapi::default",
    }),
  });

  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Amazon token failed: ${res.status} ${text}`);
  }

  const data = await res.json();

  cachedToken = {
    accessToken: data.access_token,
    expiresAt: Date.now() + (data.expires_in - 60) * 1000,
  };

  return cachedToken.accessToken;
}

type AmazonApiItem = {
  asin?: string;
  ASIN?: string;
  parentASIN?: string;
  detailPageURL?: string;
  itemInfo?: {
    title?: { displayValue?: string };
    byLineInfo?: { brand?: { displayValue?: string } };
  };
  images?: { primary?: { medium?: { url?: string } } };
  offersV2?: {
    listings?: Array<{
      price?: { money?: { amount?: number; displayAmount?: string } };
      availability?: { message?: string; displayValue?: string };
    }>;
  };
};

export type AmazonPublicItem = {
  asin: string;
  parentAsin: string | null;
  title: string | null;
  brand: string | null;
  imageUrl: string | null;
  currentPrice: number | null;
  displayPrice: string | null;
  availability: string | null;
  affiliateUrl: string;
};

export async function getAmazonItems(
  asins: string[],
): Promise<AmazonPublicItem[]> {
  const cleanAsins = [
    ...new Set(asins.map((a) => a.trim().toUpperCase()).filter(Boolean)),
  ];

  if (cleanAsins.length === 0) {
    return [];
  }

  const accessToken = await getAmazonAccessToken();
  const partnerTag = requireEnv("AMAZON_PARTNER_TAG");

  const requestBody = JSON.stringify({
    itemIds: cleanAsins,
    itemIdType: "ASIN",
    marketplace: "www.amazon.com",
    partnerTag,
    resources: [
      "images.primary.medium",
      "itemInfo.title",
      "itemInfo.byLineInfo",
      "offersV2.listings.price",
      "offersV2.listings.availability",
      "parentASIN",
    ],
  });

  let res: Response | null = null;

  for (let attempt = 0; attempt < AMAZON_MAX_ATTEMPTS; attempt += 1) {
    res = await fetch("https://creatorsapi.amazon/catalog/v1/getItems", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${accessToken}`,
        "Content-Type": "application/json",
        "x-marketplace": "www.amazon.com",
      },
      body: requestBody,
    });

    if (res.ok || res.status !== 429 || attempt === AMAZON_MAX_ATTEMPTS - 1) {
      break;
    }

    await wait(getRetryDelay(res, attempt));
  }

  if (!res?.ok) {
    const text = res ? await res.text() : "No response";
    throw new Error(`Amazon getItems failed: ${res?.status ?? "unknown"} ${text}`);
  }

  const data = await res.json();

  const items = data?.itemsResult?.items ?? data?.items ?? data?.Items ?? [];

  return (items as AmazonApiItem[]).map((item): AmazonPublicItem => {
    const asin = item?.asin ?? item?.ASIN ?? "";
    const priceMoney = item?.offersV2?.listings?.[0]?.price?.money;

    return {
      asin,
      parentAsin: item?.parentASIN ?? null,
      title: item?.itemInfo?.title?.displayValue ?? null,
      brand: item?.itemInfo?.byLineInfo?.brand?.displayValue ?? null,
      imageUrl: item?.images?.primary?.medium?.url ?? null,
      currentPrice:
        typeof priceMoney?.amount === "number" ? priceMoney.amount : null,
      displayPrice: priceMoney?.displayAmount ?? null,
      availability:
        item?.offersV2?.listings?.[0]?.availability?.message ??
        item?.offersV2?.listings?.[0]?.availability?.displayValue ??
        null,
      affiliateUrl:
        item?.detailPageURL ??
        `https://www.amazon.com/dp/${asin}?tag=${partnerTag}`,
    };
  });
}
