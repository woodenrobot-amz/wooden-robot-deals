import { brandTierOptions } from "@/lib/brand-tier-options";
import { createAdminClient } from "@/lib/supabase/admin";
import { rescoreDeals } from "@/lib/pipeline/rescoreDeals";
import { RescoreButton } from "./rescore-button";
import { BrandTable } from "./brand-table";
import Link from "next/link";
import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";

async function addBrandTier(formData: FormData) {
  "use server";

  const supabase = await createClient();

  const name = String(formData.get("name") || "").trim();
  const tier = brandTierOptions.find((option) => option.value === formData.get("tier"));

  if (!name || !tier) return;

  const { error } = await supabase.from("brand_tiers").insert({
    name,
    tier: tier.value,
    score_bonus: tier.bonus,
  });

  if (error) {
    console.error("Failed to add brand tier:", error);
    return;
  }

  revalidatePath("/admin/brand-tiers");
}

async function updateBrandTiers(formData: FormData) {
  "use server";

  const ids = [...new Set(formData.getAll("id").filter((id): id is string => typeof id === "string" && id.length > 0))];
  const tier = brandTierOptions.find((option) => option.value === formData.get("tier"));
  if (!ids.length || !tier) return "Select at least one brand and choose a tier.";

  // The existing admin-only SELECT policy authorizes access to each selected brand.
  const supabase = await createClient();
  const { data: brands, error: readError } = await supabase
    .from("brand_tiers").select("id").in("id", ids);
  if (readError || brands?.length !== ids.length) return "One or more selected brands are unavailable to edit.";

  const { data: updated, error } = await createAdminClient()
    .from("brand_tiers")
    .update({ tier: tier.value, score_bonus: tier.bonus })
    .in("id", brands.map((brand) => brand.id))
    .select("id");
  if (error || updated?.length !== ids.length) {
    console.error("Failed to update brand tier:", error);
    return "Could not save the tier. Try again.";
  }

  revalidatePath("/admin/brand-tiers");
  revalidatePath("/admin/candidate-review");
  return "";
}

async function rescoreBrandDeals() {
  "use server";

  const supabase = await createClient();
  // Only the admin can see brand rows through this client.
  const { data, error } = await supabase.from("brand_tiers").select("id").limit(1);
  if (error || !data?.length) return "Rescore is only available to the admin.";

  try {
    const { queue, live, skipped, incomplete } = await rescoreDeals();
    revalidatePath("/admin/candidate-review");
    revalidatePath("/admin/manage-deals");
    const summary = `Updated ${queue} in Candidate Review and ${live} live.`;
    if (incomplete || skipped) return `${summary} Some rows could not be updated. Run Rescore again.`;
    return summary;
  } catch (error) {
    console.error("Could not start rescore:", error);
    return "Could not rescore deals. Try again.";
  }
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
            Add brands and change their scoring tiers.
          </p>

          <RescoreButton rescore={rescoreBrandDeals} />

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
              {brandTierOptions.map(({ value, label }) => (
                <option key={value} value={value}>{label}</option>
              ))}
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
            <BrandTable brands={brands || []} updateBrandTiers={updateBrandTiers} />
          </div>
        </div>
      </div>
    </main>
  );
}
