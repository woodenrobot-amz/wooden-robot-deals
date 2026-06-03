type ScoreInput = {
  brand: string;
  currentPrice: number | null;
  avg90Price: number | null;
  rating?: number | null;
  reviewCount?: number | null;
  salesRank?: number | null;
  hasImage?: boolean;
  hasTitle?: boolean;
  brandTier?: string;
  brandBonus?: number;
};

function clampScore(score: number) {
  return Math.max(0, Math.min(100, Math.round(score)));
}

export function scoreDeal(input: ScoreInput) {
  const brandBonus = input.brandBonus || 0;
  const brandTier = input.brandTier || "unrated";

  const {
    currentPrice,
    avg90Price,
    rating,
    reviewCount,
    salesRank,
    hasImage,
    hasTitle,
  } = input;

  let discountScore = 0;
  let discountPercent = 0;

  if (currentPrice && avg90Price && currentPrice < avg90Price) {
    discountPercent = ((avg90Price - currentPrice) / avg90Price) * 100;

    if (discountPercent >= 40) discountScore = 35;
    else if (discountPercent >= 30) discountScore = 30;
    else if (discountPercent >= 20) discountScore = 24;
    else if (discountPercent >= 15) discountScore = 18;
    else if (discountPercent >= 10) discountScore = 12;
    else if (discountPercent >= 5) discountScore = 6;
  }

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

  const rawScore = discountScore + demandScore + confidenceScore + brandBonus;

  const totalScore = clampScore(rawScore);

  const badges: string[] = [];

  if (currentPrice && avg90Price && currentPrice < avg90Price) {
    discountPercent = ((avg90Price - currentPrice) / avg90Price) * 100;
  }

  if (brandTier === "elite" || brandTier === "strong") {
    badges.push("Top Brand");
  }

  if (discountPercent >= 20) {
    badges.push("Huge Discount");
  }

  if (discountPercent >= 35) {
    badges.push("All Time Low");
  }

  return {
    totalScore,
    badges,
    brandTier,
    components: {
      discountPercent: Math.round(discountPercent * 10) / 10,
      discountScore,
      brandScore: brandBonus,
      demandScore,
      confidenceScore,
    },
  };
}
