import Link from "next/link";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";

type IgnoredAsin = {
  asin: string;
  title: string | null;
  brand: string | null;
  image_url: string | null;
  reason: string | null;
  created_at: string;
};

export default async function IgnoredAsinsPage() {
  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect("/login");
  }

  const { data: ignoredAsins, error } = await supabase
    .from("ignored_asins")
    .select("asin, title, brand, image_url, reason, created_at")
    .order("created_at", { ascending: false });

  const ignoredList = (ignoredAsins || []) as IgnoredAsin[];

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
            {ignoredList.length} Ignored ASIN
            {ignoredList.length === 1 ? "" : "s"}
          </p>
        </div>

        {error && (
          <div className="mt-6 rounded-xl border border-red-800 bg-red-950/40 p-4 text-sm text-red-300">
            Error loading ignored ASINs: {error.message}
          </div>
        )}

        <div className="mt-6 space-y-3">
          {ignoredList.length === 0 ? (
            <div className="rounded-2xl border border-zinc-800 bg-zinc-900 p-6">
              <p className="text-zinc-500">No ignored ASINs configured.</p>
            </div>
          ) : (
            ignoredList.map((item) => (
              <div
                key={item.asin}
                className="flex gap-3 rounded-2xl border border-zinc-800 bg-zinc-900 p-4"
              >
                {item.image_url ? (
                  <div className="h-20 w-20 shrink-0 rounded-lg bg-white p-2">
                    <img
                      src={item.image_url}
                      alt={item.title || item.asin}
                      className="h-full w-full object-contain"
                    />
                  </div>
                ) : (
                  <div className="flex h-20 w-20 shrink-0 items-center justify-center rounded-lg bg-zinc-950 text-xs text-zinc-500">
                    No image
                  </div>
                )}

                <div className="min-w-0 flex-1">
                  <div className="font-mono text-xs text-zinc-500">
                    {item.asin}
                  </div>

                  <h2 className="mt-1 line-clamp-2 font-semibold">
                    {item.title || "Unknown product"}
                  </h2>

                  <p className="mt-1 text-sm text-zinc-400">
                    {item.brand || "Unknown brand"}
                  </p>

                  {item.reason && (
                    <p className="mt-2 text-xs text-zinc-500">
                      Reason: {item.reason}
                    </p>
                  )}
                </div>
              </div>
            ))
          )}
        </div>
      </div>
    </main>
  );
}
