import Link from "next/link";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { AsinQuickImport } from "../asin-quick-import";
import { ManualDealForm } from "../manual-deal-form";

export default async function AddDealPage() {
  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect("/login");
  }

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
          <h1 className="mt-2 text-3xl font-bold">Add Deal</h1>
          <p className="mt-3 text-sm text-zinc-400">
            Fetch an ASIN, preview scoring, or manually create a deal.
          </p>
        </div>

        <AsinQuickImport />
        <ManualDealForm />
      </div>
    </main>
  );
}
