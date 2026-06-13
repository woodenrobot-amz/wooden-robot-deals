import { getAmazonItems } from "@/lib/amazon-creators";

export type PaapiProduct = {
  asin: string;
  title?: string | null;
  imageUrl?: string | null;
  currentPrice?: number | null;
  detailPageUrl?: string | null;
};

export async function getPaapiProductByAsin(
  asin: string,
): Promise<PaapiProduct | null> {
  const normalizedAsin = asin.trim().toUpperCase();

  if (!normalizedAsin) {
    return null;
  }

  const items = await getAmazonItems([normalizedAsin]);
  const item = items.find(
    (amazonItem) => amazonItem.asin?.toUpperCase() === normalizedAsin,
  );

  if (!item) {
    return null;
  }

  return {
    asin: item.asin || normalizedAsin,
    title: item.title,
    imageUrl: item.imageUrl,
    currentPrice: item.currentPrice,
    detailPageUrl: item.affiliateUrl,
  };
}
