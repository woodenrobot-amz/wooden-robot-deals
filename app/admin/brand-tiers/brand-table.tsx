"use client";

import { useState } from "react";

type Brand = {
  id: string;
  name: string;
  tier: string;
  score_bonus: number;
};

type SortKey = "name" | "tier" | "score_bonus";

export function BrandTable({ brands }: { brands: Brand[] }) {
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
                <td className="px-4 py-3 text-zinc-300">{brand.tier}</td>
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
