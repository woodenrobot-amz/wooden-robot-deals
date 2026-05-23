import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";

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

          <h1 className="mt-2 text-3xl font-bold">
            Wooden Robot Admin
          </h1>

          <p className="mt-4 text-zinc-400">
            Logged in as:
          </p>

          <p className="mt-1 font-semibold">
            {user.email}
          </p>
        </div>
      </div>
    </main>
  );
}