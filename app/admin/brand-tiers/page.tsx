import { BrandTable } from "./brand-table";
import Link from "next/link";
import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";

async function addBrandTier(formData: FormData) {
  "use server";

  const supabase = await createClient();

  const name = String(formData.get("name") || "").trim();
  const tier = String(formData.get("tier") || "standard");
  const scoreBonusByTier: Record<string, number> = {
    elite: 15,
    strong: 10,
    standard: 5,
    unrated: 0,
  };

  const scoreBonus = scoreBonusByTier[tier] ?? 0;

  if (!name) return;

  const { error } = await supabase.from("brand_tiers").insert({
    name,
    tier,
    score_bonus: scoreBonus,
  });

  if (error) {
    console.error("Failed to add brand tier:", error);
    return;
  }

  revalidatePath("/admin/brands");
}

export default async function BrandTiersPage() {
  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect("/login");
  }

  const { data: brands, error } = await supabase
    .from("brand_tiers")
    .select("id, name, tier, score_bonus")
    .order("name", { ascending: true });

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

          <h1 className="mt-2 text-3xl font-bold">Brand Tiers</h1>

          <p className="mt-3 text-sm text-zinc-400">
            Add brands and assign scoring tiers.
          </p>

          <form
            action={addBrandTier}
            className="mt-6 grid gap-3 md:grid-cols-3"
          >
            <input
              name="name"
              placeholder="Brand name"
              required
              className="rounded-xl border border-zinc-700 bg-zinc-950 px-4 py-3 text-sm text-white outline-none"
            />

            <select
              name="tier"
              defaultValue="standard"
              className="rounded-xl border border-zinc-700 bg-zinc-950 px-4 py-3 text-sm text-white outline-none"
            >
              <option value="elite">Elite</option>
              <option value="strong">Strong</option>
              <option value="standard">Standard</option>
              <option value="unrated">Unrated</option>
            </select>

            <button
              type="submit"
              className="rounded-xl bg-amber-400 px-4 py-3 text-sm font-bold text-zinc-950"
            >
              Add Brand
            </button>
          </form>

          {error && (
            <div className="mt-4 rounded-xl border border-red-800 bg-red-950/40 p-3 text-sm text-red-300">
              Error loading brands: {error.message}
            </div>
          )}

          <div className="mt-6">
            <BrandTable brands={brands || []} />
          </div>
        </div>
      </div>
    </main>
  );
}
