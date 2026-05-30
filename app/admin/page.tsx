import Link from "next/link";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";

const adminLinks = [
  {
    href: "/admin/add-deal",
    title: "Add Deal",
    description: "Fetch an ASIN, preview scoring, and save a deal.",
  },
  {
    href: "/admin/manage-deals",
    title: "Manage Deals",
    description: "Review active deals, scoring, and kill bad deals.",
  },
  {
    href: "/admin/ignored-asins",
    title: "Ignored ASINs",
    description: "Manage ASINs that should never be enriched.",
  },
  {
    href: "/admin/brand-tiers",
    title: "Brand Tiers",
    description: "Review and eventually manage brand scoring tiers.",
  },
];

export default async function AdminPage() {
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
        <div className="rounded-2xl border border-zinc-800 bg-zinc-900 p-6">
          <p className="text-sm uppercase tracking-widest text-amber-400">
            Admin
          </p>

          <h1 className="mt-2 text-3xl font-bold">Wooden Robot Admin</h1>

          <p className="mt-4 text-zinc-400">Logged in as:</p>
          <p className="mt-1 font-semibold">{user.email}</p>
        </div>

        <div className="mt-6 grid gap-4 sm:grid-cols-2">
          {adminLinks.map((link) => (
            <Link
              key={link.href}
              href={link.href}
              className="rounded-2xl border border-zinc-800 bg-zinc-900 p-5 transition hover:border-amber-400/60 hover:bg-zinc-800"
            >
              <h2 className="text-xl font-bold">{link.title}</h2>
              <p className="mt-2 text-sm text-zinc-400">{link.description}</p>
            </Link>
          ))}
        </div>
      </div>
    </main>
  );
}
