type ScoreInput = {
  currentPrice: number | null;
  avg90Price: number | null;
  brandTier?: string;
  brandBonus?: number;
};

export function scoreDeal({
  currentPrice,
  avg90Price,
  brandTier,
  brandBonus,
}: ScoreInput) {
  const brandScore = brandBonus === 5 || brandBonus === 10 || brandBonus === 15
    ? brandBonus
    : 0;

  const discountPercent =
    currentPrice != null && Number.isFinite(currentPrice) && currentPrice > 0 &&
    avg90Price != null && Number.isFinite(avg90Price) && avg90Price > 0
      ? Math.max(0, ((avg90Price - currentPrice) / avg90Price) * 100)
      : null;
  const discountScore = discountPercent == null
    ? null
    : Math.min(85, Math.round(discountPercent * 1.7));

  const badges: string[] = [];
  if (brandTier === "elite" || brandTier === "strong") badges.push("Top Brand");
  if (discountPercent != null && discountPercent >= 20) badges.push("Huge Discount");
  if (discountPercent != null && discountPercent >= 35) badges.push("All Time Low");

  return {
    totalScore: discountScore == null ? null : discountScore + brandScore,
    badges,
    components: {
      discountPercent: discountPercent == null ? null : Math.round(discountPercent * 10) / 10,
      discountScore,
      brandScore,
    },
  };
}
