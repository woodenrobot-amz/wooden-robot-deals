type ScoreInput = {
  brand: string;
  currentPrice: number | null;
  avg90Price: number | null;
  rating?: number | null;
  reviewCount?: number | null;
  salesRank?: number | null;
  hasImage?: boolean;
  hasTitle?: boolean;
};

const tier1Brands = [
  "dewalt",
  "milwaukee",
  "makita",
  "bosch",
  "festool",
  "sawstop",
  "woodpeckers",
  "wera",
  "wiha",
  "knipex",
  "leatherman",
  "yeti",
  "noctua",
  "bambu lab",
];

const tier2Brands = [
  "ryobi",
  "ridgid",
  "kreg",
  "diablo",
  "freud",
  "anker",
  "blackstone",
  "traeger",
  "elegoo",
  "anycubic",
  "klein",
  "stanley",
  "weber",
  "workpro",
];

function getBrandTier(brand: string) {
  const normalized = brand.toLowerCase();

  if (tier1Brands.some((topBrand) => normalized.includes(topBrand))) {
    return 1;
  }

  if (tier2Brands.some((midBrand) => normalized.includes(midBrand))) {
    return 2;
  }

  return 3;
}

function clampScore(score: number) {
  return Math.max(0, Math.min(100, Math.round(score)));
}

export function scoreDeal(input: ScoreInput) {
  const {
    brand,
    currentPrice,
    avg90Price,
    rating,
    reviewCount,
    salesRank,
    hasImage,
    hasTitle,
  } = input;

  let discountScore = 0;

  if (currentPrice && avg90Price && currentPrice < avg90Price) {
    const discountPercent = ((avg90Price - currentPrice) / avg90Price) * 100;

    if (discountPercent >= 40) discountScore = 35;
    else if (discountPercent >= 30) discountScore = 30;
    else if (discountPercent >= 20) discountScore = 24;
    else if (discountPercent >= 15) discountScore = 18;
    else if (discountPercent >= 10) discountScore = 12;
    else if (discountPercent >= 5) discountScore = 6;
  }

  const brandTier = getBrandTier(brand);
  const brandScore = brandTier === 1 ? 20 : brandTier === 2 ? 10 : 0;

  let demandScore = 0;

  if (rating && rating >= 4.5) demandScore += 5;
  else if (rating && rating >= 4.2) demandScore += 3;

  if (reviewCount && reviewCount >= 1000) demandScore += 5;
  else if (reviewCount && reviewCount >= 250) demandScore += 3;
  else if (reviewCount && reviewCount >= 50) demandScore += 1;

  if (salesRank && salesRank > 0 && salesRank <= 10000) demandScore += 5;
  else if (salesRank && salesRank <= 50000) demandScore += 3;
  else if (salesRank && salesRank <= 150000) demandScore += 1;

  let confidenceScore = 0;

  if (hasTitle) confidenceScore += 3;
  if (hasImage) confidenceScore += 3;
  if (currentPrice) confidenceScore += 2;
  if (avg90Price) confidenceScore += 2;

  const rawScore =
    discountScore + brandScore + demandScore + confidenceScore + 25;

  const totalScore = clampScore(rawScore);

  const badges: string[] = [];

  let discountPercent = 0;

  if (currentPrice && avg90Price && currentPrice < avg90Price) {
    discountPercent = ((avg90Price - currentPrice) / avg90Price) * 100;
  }

  // Top Brand
  if (brandTier === 1) {
    badges.push("Top Brand");
  }

  // Huge Discount
  if (discountPercent >= 20) {
    badges.push("Huge Discount");
  }

  // All Time Low placeholder
  // Later we’ll use Keepa lowest-ever pricing data
  if (discountPercent >= 35) {
    badges.push("All Time Low");
  }

  return {
    totalScore,
    badges,
    brandTier,
    components: {
      discountScore,
      brandScore,
      demandScore,
      confidenceScore,
      baseScore: 25,
    },
  };
}
