"use client";

import { useState } from "react";
import { createClient } from "@/lib/supabase/client";

const categories = [
  { id: "woodworking", name: "Woodworking" },
  { id: "auto", name: "Auto" },
  { id: "garage", name: "Garage" },
  { id: "edc", name: "EDC" },
  { id: "tech", name: "Tech" },
  { id: "three_d_printing", name: "3D Printing" },
];

export function ManualDealForm() {
  const supabase = createClient();

  const [message, setMessage] = useState("");
  const [loading, setLoading] = useState(false);

async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
  event.preventDefault();

  const form = event.currentTarget;
  const formData = new FormData(form);

  setLoading(true);
  setMessage("");

  const asin = String(formData.get("asin") || "").trim();
  const title = String(formData.get("title") || "").trim();
  const brand = String(formData.get("brand") || "").trim();
  const category_id = String(formData.get("category_id") || "woodworking");
  const image_url = String(formData.get("image_url") || "").trim();
  const amazon_url =
    String(formData.get("amazon_url") || "").trim() ||
    `https://amazon.com/dp/${asin}`;

  const current_price = Number(formData.get("current_price") || 0);
  const avg_90_price = Number(formData.get("avg_90_price") || 0);
  const deal_score = Number(formData.get("deal_score") || 50);

  const badgesRaw = String(formData.get("badges") || "").trim();
  const badges = badgesRaw
    ? badgesRaw.split(",").map((badge) => badge.trim()).filter(Boolean)
    : [];

  const { error } = await supabase.from("deals").insert({
    asin,
    title,
    brand,
    category_id,
    image_url,
    amazon_url,
    current_price,
    avg_90_price,
    deal_score,
    badges,
    status: "active",
    source: "manual",
    expires_at: new Date(Date.now() + 48 * 60 * 60 * 1000).toISOString(),
  });

  if (error) {
    setMessage(error.message);
    setLoading(false);
    return;
  }

  form.reset();
  setMessage("Deal added.");
  setLoading(false);
}

  return (
    <form
      onSubmit={handleSubmit}
      className="mt-6 rounded-2xl border border-zinc-800 bg-zinc-900 p-5"
    >
      <h2 className="text-xl font-bold">Add Manual Deal</h2>

      <div className="mt-4 grid gap-4">
        <input name="asin" required placeholder="ASIN" className="rounded-xl border border-zinc-700 bg-zinc-950 px-4 py-3 text-sm outline-none" />
        <input name="title" required placeholder="Title" className="rounded-xl border border-zinc-700 bg-zinc-950 px-4 py-3 text-sm outline-none" />
        <input name="brand" placeholder="Brand" className="rounded-xl border border-zinc-700 bg-zinc-950 px-4 py-3 text-sm outline-none" />

        <select name="category_id" className="rounded-xl border border-zinc-700 bg-zinc-950 px-4 py-3 text-sm outline-none">
          {categories.map((category) => (
            <option key={category.id} value={category.id}>
              {category.name}
            </option>
          ))}
        </select>

        <input name="current_price" required type="number" step="0.01" placeholder="Current Price" className="rounded-xl border border-zinc-700 bg-zinc-950 px-4 py-3 text-sm outline-none" />
        <input name="avg_90_price" type="number" step="0.01" placeholder="90 Day Average Price" className="rounded-xl border border-zinc-700 bg-zinc-950 px-4 py-3 text-sm outline-none" />
        <input name="deal_score" type="number" placeholder="Deal Score" defaultValue="50" className="rounded-xl border border-zinc-700 bg-zinc-950 px-4 py-3 text-sm outline-none" />
        <input name="badges" placeholder="Badges, comma separated" className="rounded-xl border border-zinc-700 bg-zinc-950 px-4 py-3 text-sm outline-none" />
        <input name="image_url" placeholder="Image URL" className="rounded-xl border border-zinc-700 bg-zinc-950 px-4 py-3 text-sm outline-none" />
        <input name="amazon_url" placeholder="Amazon URL optional" className="rounded-xl border border-zinc-700 bg-zinc-950 px-4 py-3 text-sm outline-none" />

        <button
          type="submit"
          disabled={loading}
          className="rounded-xl bg-amber-400 px-4 py-3 font-bold text-zinc-950 disabled:opacity-50"
        >
          {loading ? "Adding..." : "Add Deal"}
        </button>

        {message && (
          <p className="text-sm text-zinc-300">
            {message}
          </p>
        )}
      </div>
    </form>
  );
}