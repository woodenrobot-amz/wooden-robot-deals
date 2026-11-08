export const PUBLIC_DEAL_LIMIT = 200;
export const FEED_DEAL_LIFETIME_MS = 48 * 60 * 60 * 1000;
export const FEED_HUB_SOURCE = "feed_hub";

export const publicDealCategories = [
  { id: "woodworking", name: "Woodworking" },
  { id: "dad_deals", name: "Dad Deals" },
  { id: "maker_space", name: "Maker Space" },
  { id: "shop_savers", name: "Shop Savers" },
  { id: "top_deals", name: "Top Deals" },
] as const;

const legacyCategories: Record<string, string> = {
  auto: "dad_deals",
  garage: "dad_deals",
  edc: "dad_deals",
  tech: "dad_deals",
  three_d_printing: "maker_space",
};

export function publicDealCategory(categoryId: string | null) {
  return categoryId ? legacyCategories[categoryId] ?? categoryId : null;
}
