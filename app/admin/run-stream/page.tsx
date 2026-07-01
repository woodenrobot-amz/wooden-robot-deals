import Link from "next/link";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { RunStreamsClient } from "./run-streams-client";

export default async function RunStreamsPage() {
  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect("/login");
  }

  const { data: streams } = await supabase
    .from("discovery_streams")
    .select("id, name, category_id")
    .eq("is_active", true)
    .order("sort_order", { ascending: true });

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
          <h1 className="mt-2 text-3xl font-bold">Run Streams</h1>
          <p className="mt-3 text-sm text-zinc-400">
            Run production discovery streams and feed deal candidates into the
            app.
          </p>
        </div>

        <RunStreamsClient streams={streams || []} />
      </div>
    </main>
  );
}
