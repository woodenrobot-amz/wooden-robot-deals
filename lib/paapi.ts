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
  // TODO: wire PA-API request here
  // For now return null so Keepa remains fallback.
  return null;
}
