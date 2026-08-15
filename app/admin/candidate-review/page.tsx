import Link from "next/link";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import {
  CandidateReviewList,
  type Candidate,
} from "./candidate-review-list";

const DATABASE_PAGE_SIZE = 1000;

type CandidateRow = Omit<Candidate, "is_live">;

function chunk<T>(items: T[], size: number) {
  const chunks: T[][] = [];
  for (let index = 0; index < items.length; index += size) {
    chunks.push(items.slice(index, index + size));
  }
  return chunks;
}

export default async function CandidateReviewPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) redirect("/login");

  const admin = createAdminClient();
  const candidates: CandidateRow[] = [];
  for (let offset = 0; ; offset += DATABASE_PAGE_SIZE) {
    const { data, error } = await admin
      .from("deal_candidates")
      .select("asin, stream_id, category_id, status, raw_data")
      .in("status", ["enriched", "published"])
      .order("created_at", { ascending: true })
      .range(offset, offset + DATABASE_PAGE_SIZE - 1);

    if (error) {
      throw new Error(`Failed to load review candidates: ${error.message}`);
    }

    candidates.push(...((data || []) as CandidateRow[]));
    if ((data || []).length < DATABASE_PAGE_SIZE) break;
  }

  const candidateAsins = [...new Set(candidates.map((candidate) => candidate.asin))];
  const liveDeals: { asin: string }[] = [];
  for (const asinBatch of chunk(candidateAsins, 200)) {
    const { data, error } = await admin
      .from("deals")
      .select("asin")
      .in("asin", asinBatch)
      .eq("status", "active")
      .gt("expires_at", new Date().toISOString());

    if (error) {
      throw new Error(`Failed to verify published deals: ${error.message}`);
    }
    liveDeals.push(...(data || []));
  }

  const liveAsins = new Set(
    liveDeals.map((deal) => deal.asin),
  );
  const reviewCandidates = candidates.map((candidate) => ({
    ...candidate,
    status: liveAsins.has(candidate.asin) ? ("published" as const) : candidate.status,
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
