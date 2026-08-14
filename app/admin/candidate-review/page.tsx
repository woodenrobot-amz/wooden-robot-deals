import Link from "next/link";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { CandidateReviewList } from "./candidate-review-list";

export default async function CandidateReviewPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) redirect("/login");

  const admin = createAdminClient();
  const { data, error } = await admin
    .from("deal_candidates")
    .select("asin, stream_id, category_id, status, raw_data")
    .in("status", ["enriched", "published"])
    .limit(200);

  if (error) throw new Error(`Failed to load review candidates: ${error.message}`);

  const candidates = data || [];
  const publishedAsins = [
    ...new Set(
      candidates
        .filter((candidate) => candidate.status === "published")
        .map((candidate) => candidate.asin),
    ),
  ];
  const { data: liveDeals, error: liveError } =
    publishedAsins.length > 0
      ? await admin
          .from("deals")
          .select("asin, status, expires_at")
          .in("asin", publishedAsins)
      : { data: [], error: null };

  if (liveError) {
    throw new Error(`Failed to verify published deals: ${liveError.message}`);
  }

  const now = Date.now();
  const liveAsins = new Set(
    (liveDeals || [])
      .filter(
        (deal) =>
          deal.status === "active" &&
          new Date(deal.expires_at).getTime() > now,
      )
      .map((deal) => deal.asin),
  );
  const reviewCandidates = candidates.map((candidate) => ({
    ...candidate,
    is_live: liveAsins.has(candidate.asin),
  }));

  return (
    <main className="min-h-screen bg-zinc-950 px-4 py-8 text-white">
      <div className="mx-auto max-w-6xl">
        <Link href="/admin" className="text-sm text-amber-400">
          ← Back to Admin
        </Link>
        <div className="mt-4 rounded-2xl border border-zinc-800 bg-zinc-900 p-6">
          <p className="text-sm uppercase tracking-widest text-amber-400">Admin</p>
          <h1 className="mt-2 text-3xl font-bold">Candidate Review</h1>
          <p className="mt-3 text-sm text-zinc-400">
            Review enriched finds visually before they reach the live deals feed.
          </p>
        </div>
        <CandidateReviewList initialCandidates={reviewCandidates} />
      </div>
    </main>
  );
}
