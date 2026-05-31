import Link from "next/link";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { getIgnoredAsins } from "@/lib/ignored-asins";

export default async function IgnoredAsinsPage() {
  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect("/login");
  }

  const ignoredAsins = Array.from(await getIgnoredAsins()).sort();

  return (
    <main className="min-h-screen bg-zinc-950 px-4 py-10 text-white">
      <div className="mx-auto max-w-4xl">
        <Link href="/admin" className="text-sm text-amber-400">
          ← Back to Admin
        </Link>

        <div className="mt-4 rounded-2xl border border-zinc-800 bg-zinc-900 p-6">
          <p className="text-sm uppercase tracking-widest text-amber-400">
            Admin
          </p>

          <h1 className="mt-2 text-3xl font-bold">Ignored ASINs</h1>

          <p className="mt-3 text-sm text-zinc-400">
            These ASINs are skipped before Keepa enrichment.
          </p>

          <p className="mt-4 font-semibold text-zinc-200">
            {ignoredAsins.length} Ignored ASIN
            {ignoredAsins.length === 1 ? "" : "s"}
          </p>
        </div>

        <div className="mt-6 rounded-2xl border border-zinc-800 bg-zinc-900 p-6">
          {ignoredAsins.length === 0 ? (
            <p className="text-zinc-500">No ignored ASINs configured.</p>
          ) : (
            <div className="space-y-2">
              {ignoredAsins.map((asin) => (
                <div
                  key={asin}
                  className="rounded-lg border border-zinc-800 bg-zinc-950 px-4 py-3 font-mono"
                >
                  {asin}
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </main>
  );
}
