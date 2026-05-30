import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { ManualDealForm } from "./manual-deal-form";
import { AsinQuickImport } from "./asin-quick-import";
import { AdminDealList } from "./admin-deal-list";

export default async function AdminPage() {
  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();

  const { data: deals } = await supabase
    .from("deals")
    .select(
      `
    id,
    asin,
    title,
    brand,
    deal_score,
    current_price,
    avg_90_price,
    image_url,
    status,
    scoring_components
  `,
    )
    .eq("status", "active")
    .order("created_at", { ascending: false })
    .limit(50);

  if (!user) {
    redirect("/login");
  }

  return (
    <main className="min-h-screen bg-zinc-950 px-4 py-10 text-white">
      <div className="mx-auto max-w-4xl">
        <div className="rounded-2xl border border-zinc-800 bg-zinc-900 p-6">
          <p className="text-sm uppercase tracking-widest text-amber-400">
            Admin
          </p>

          <h1 className="mt-2 text-3xl font-bold">Wooden Robot Admin</h1>

          <p className="mt-4 text-zinc-400">Logged in as:</p>

          <p className="mt-1 font-semibold">{user.email}</p>
        </div>
        <AsinQuickImport />
        <ManualDealForm />
        <AdminDealList initialDeals={deals || []} />
      </div>
    </main>
  );
}
