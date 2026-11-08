"use client";

import { useActionState, useState } from "react";
import { brandTierOptions } from "@/lib/brand-tier-options";

type Brand = {
  id: string;
  name: string;
  tier: string;
  score_bonus: number;
};

type SortKey = "name" | "tier" | "score_bonus";

type UpdateBrandTier = (state: string, formData: FormData) => Promise<string>;

function TierEditor({ brand, updateBrandTier }: { brand: Brand; updateBrandTier: UpdateBrandTier }) {
  const [tier, setTier] = useState(brand.tier);
  const [error, saveTier, pending] = useActionState(updateBrandTier, "");

  return (
    <form action={saveTier}>
      <input type="hidden" name="id" value={brand.id} />
      <div className="flex flex-wrap items-center gap-2">
        <select
          aria-label={`Tier for ${brand.name}`}
          name="tier"
          value={tier}
          onChange={(event) => setTier(event.target.value)}
          disabled={pending}
          className="rounded-lg border border-zinc-700 bg-zinc-950 px-2 py-1.5 text-white"
        >
          {!brandTierOptions.some((option) => option.value === brand.tier) && (
            <option value={brand.tier} disabled>{brand.tier}</option>
          )}
          {brandTierOptions.map(({ value, label }) => (
            <option key={value} value={value}>{label}</option>
          ))}
        </select>
        <button
          type="submit"
          disabled={pending || tier === brand.tier}
          className="rounded-lg bg-amber-400 px-2 py-1.5 font-bold text-zinc-950 disabled:opacity-50"
        >
          {pending ? "Saving…" : "Save"}
        </button>
      </div>
      {error && <p role="alert" className="mt-1 text-xs text-red-300">{error}</p>}
    </form>
  );
}

export function BrandTable({ brands, updateBrandTier }: {
  brands: Brand[];
  updateBrandTier: UpdateBrandTier;
}) {
  const [search, setSearch] = useState("");
  const [sortKey, setSortKey] = useState<SortKey>("name");
  const [sortDirection, setSortDirection] = useState<"asc" | "desc">("asc");

  function handleSort(nextSortKey: SortKey) {
    if (sortKey === nextSortKey) {
      setSortDirection(sortDirection === "asc" ? "desc" : "asc");
      return;
    }

    setSortKey(nextSortKey);
    setSortDirection("asc");
  }

  const filteredBrands = brands
    .filter((brand) =>
      `${brand.name} ${brand.tier} ${brand.score_bonus}`
        .toLowerCase()
        .includes(search.toLowerCase()),
    )
    .sort((a, b) => {
      const aValue = a[sortKey];
      const bValue = b[sortKey];

      if (typeof aValue === "number" && typeof bValue === "number") {
        return sortDirection === "asc" ? aValue - bValue : bValue - aValue;
      }

      return sortDirection === "asc"
        ? String(aValue).localeCompare(String(bValue))
        : String(bValue).localeCompare(String(aValue));
    });

  return (
    <div>
      <input
        value={search}
        onChange={(event) => setSearch(event.target.value)}
        placeholder="Search brands..."
        className="mb-4 w-full rounded-xl border border-zinc-700 bg-zinc-950 px-4 py-3 text-sm text-white outline-none placeholder:text-zinc-500"
      />

      <div className="overflow-hidden rounded-xl border border-zinc-800">
        <table className="w-full text-left text-sm">
          <thead className="bg-zinc-950 text-xs uppercase tracking-wider text-zinc-500">
            <tr>
              <th className="px-4 py-3">
                <button
                  type="button"
                  onClick={() => handleSort("name")}
                  className="font-semibold text-zinc-400 hover:text-amber-300"
                >
                  Brand{" "}
                  {sortKey === "name"
                    ? sortDirection === "asc"
                      ? "↑"
                      : "↓"
                    : ""}
                </button>
              </th>

              <th className="px-4 py-3">
                <button
                  type="button"
                  onClick={() => handleSort("tier")}
                  className="font-semibold text-zinc-400 hover:text-amber-300"
                >
                  Tier{" "}
                  {sortKey === "tier"
                    ? sortDirection === "asc"
                      ? "↑"
                      : "↓"
                    : ""}
                </button>
              </th>

              <th className="px-4 py-3">
                <button
                  type="button"
                  onClick={() => handleSort("score_bonus")}
                  className="font-semibold text-zinc-400 hover:text-amber-300"
                >
                  Bonus{" "}
                  {sortKey === "score_bonus"
                    ? sortDirection === "asc"
                      ? "↑"
                      : "↓"
                    : ""}
                </button>
              </th>
            </tr>
          </thead>

          <tbody>
            {filteredBrands.map((brand) => (
              <tr key={brand.id} className="border-t border-zinc-800">
                <td className="px-4 py-3 font-medium text-zinc-100">
                  {brand.name}
                </td>
                <td className="px-4 py-3 text-zinc-300">
                  <TierEditor key={brand.tier} brand={brand} updateBrandTier={updateBrandTier} />
                </td>
                <td className="px-4 py-3 text-zinc-300">
                  +{brand.score_bonus}
                </td>
              </tr>
            ))}

            {filteredBrands.length === 0 && (
              <tr>
                <td className="px-4 py-6 text-center text-zinc-500" colSpan={3}>
                  No matching brands.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
