"use client";

import { useActionState, useRef, useState } from "react";
import { brandTierOptions } from "@/lib/brand-tier-options";

type Brand = {
  id: string;
  name: string;
  tier: string;
  score_bonus: number;
};

type SortKey = "name" | "tier" | "score_bonus";

export function BrandTable({ brands, updateBrandTiers }: {
  brands: Brand[];
  updateBrandTiers: (formData: FormData) => Promise<string>;
}) {
  const dialog = useRef<HTMLDialogElement>(null);
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [tier, setTier] = useState("");
  const [message, setMessage] = useState("");
  const [error, saveTiers, pending] = useActionState(async (_previous: string, formData: FormData) => {
    const result = await updateBrandTiers(formData);
    if (result) return result;
    setMessage(`Updated ${selectedIds.length} ${selectedIds.length === 1 ? "brand" : "brands"}.`);
    setSelectedIds([]);
    dialog.current?.close();
    return "";
  }, "");

  const selectedBrands = brands.filter((brand) => selectedIds.includes(brand.id));

  function toggleBrand(id: string) {
    setMessage("");
    setSelectedIds((current) => current.includes(id)
      ? current.filter((selected) => selected !== id)
      : [...current, id]);
  }

  function openEditor() {
    setTier("");
    dialog.current?.showModal();
  }

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

      <div className="sticky top-0 z-10 mb-3 flex items-center justify-between gap-2 bg-zinc-900 py-2">
        <span className="text-sm text-zinc-400" role="status">
          {message || `${selectedBrands.length} selected`}
        </span>
        <button
          type="button"
          onClick={openEditor}
          disabled={!selectedBrands.length || pending}
          className="rounded-lg bg-amber-400 px-4 py-2 text-sm font-bold text-zinc-950 disabled:opacity-50"
        >
          Modify
        </button>
      </div>

      <dialog
        ref={dialog}
        aria-labelledby="modify-tiers-heading"
        onCancel={(event) => { if (pending) event.preventDefault(); }}
        className="m-auto w-11/12 max-w-sm rounded-2xl border border-zinc-700 bg-zinc-900 p-5 text-white backdrop:bg-black/70"
      >
        <form action={saveTiers} className="space-y-4">
          <h2 id="modify-tiers-heading" className="text-lg font-bold">Modify brand tiers</h2>
          <p className="max-h-28 overflow-y-auto text-sm text-zinc-400">
            {selectedBrands.map((brand) => brand.name).join(", ")}
          </p>
          {selectedBrands.map((brand) => <input key={brand.id} type="hidden" name="id" value={brand.id} />)}
          <label className="block text-sm font-medium">
            New tier
            <select
              name="tier"
              value={tier}
              onChange={(event) => setTier(event.target.value)}
              required
              disabled={pending}
              className="mt-1 block w-full rounded-lg border border-zinc-700 bg-zinc-950 p-2 text-white"
            >
              <option value="" disabled>Choose a tier</option>
              {brandTierOptions.map(({ value, label, bonus }) => (
                <option key={value} value={value}>{label} (+{bonus})</option>
              ))}
            </select>
          </label>
          {error && <p role="alert" className="text-sm text-red-300">{error}</p>}
          <div className="flex justify-end gap-2">
            <button type="button" onClick={() => dialog.current?.close()} disabled={pending}
              className="rounded-lg border border-zinc-700 px-4 py-2 text-sm">Cancel</button>
            <button type="submit" disabled={!tier || pending}
              className="rounded-lg bg-amber-400 px-4 py-2 text-sm font-bold text-zinc-950 disabled:opacity-50">
              {pending ? "Saving…" : "Save"}
            </button>
          </div>
        </form>
      </dialog>

      <div className="overflow-hidden rounded-xl border border-zinc-800">
        <table className="w-full text-left text-sm">
          <thead className="bg-zinc-950 text-xs uppercase tracking-wider text-zinc-500">
            <tr>
              <th scope="col" className="w-10"><span className="sr-only">Select</span></th>
              <th className="px-2 py-3 sm:px-4">
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

              <th className="px-2 py-3 sm:px-4">
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

              <th className="px-2 py-3 sm:px-4">
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
                <td className="p-0">
                  <label className="flex min-h-11 w-10 cursor-pointer items-center justify-center">
                    <input type="checkbox" aria-label={`Select ${brand.name}`}
                      checked={selectedIds.includes(brand.id)} onChange={() => toggleBrand(brand.id)}
                      className="size-4 accent-amber-400" />
                  </label>
                </td>
                <td className="px-2 py-2 font-medium text-zinc-100 sm:px-4">
                  {brand.name}
                </td>
                <td className="px-2 py-2 capitalize text-zinc-300 sm:px-4">{brand.tier}</td>
                <td className="px-2 py-2 text-zinc-300 sm:px-4">
                  +{brand.score_bonus}
                </td>
              </tr>
            ))}

            {filteredBrands.length === 0 && (
              <tr>
                <td className="px-4 py-6 text-center text-zinc-500" colSpan={4}>
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
