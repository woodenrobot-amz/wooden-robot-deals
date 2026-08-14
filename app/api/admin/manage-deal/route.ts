import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";

type Action = "save" | "feature" | "unpublish";

function toRecord(value: unknown): Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
}

export async function POST(request: Request) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const body = (await request.json().catch(() => null)) as {
    id?: string;
    action?: Action;
    title?: string;
    categoryId?: string | null;
    expiresAt?: string;
    featured?: boolean;
  } | null;
  if (!body?.id || !body.action || !["save", "feature", "unpublish"].includes(body.action)) {
    return NextResponse.json({ error: "Invalid editorial request." }, { status: 400 });
  }

  const admin = createAdminClient();
  const { data: deal, error: readError } = await admin
    .from("deals")
    .select("id, title, category_id, expires_at, status, scoring_components")
    .eq("id", body.id)
    .maybeSingle();
  if (readError) return NextResponse.json({ error: readError.message }, { status: 500 });
  if (!deal) return NextResponse.json({ error: "Deal not found." }, { status: 404 });

  const now = new Date().toISOString();
  const scoring = toRecord(deal.scoring_components);
  const editorial = {
    ...toRecord(scoring.editorial),
    updatedAt: now,
    updatedBy: user.email || user.id,
  };
  let update: Record<string, unknown>;

  if (body.action === "save") {
    const title = body.title?.trim();
    const expiresAt = body.expiresAt ? new Date(body.expiresAt) : null;
    if (!title) return NextResponse.json({ error: "Title is required." }, { status: 400 });
    if (!expiresAt || Number.isNaN(expiresAt.getTime()) || expiresAt.getTime() <= Date.now()) {
      return NextResponse.json({ error: "Expiration must be in the future." }, { status: 400 });
    }
    update = {
      title,
      category_id: body.categoryId || null,
      expires_at: expiresAt.toISOString(),
      scoring_components: { ...scoring, editorial },
    };
  } else if (body.action === "feature") {
    update = {
      scoring_components: {
        ...scoring,
        editorial: { ...editorial, featured: body.featured === true },
      },
    };
  } else {
    update = {
      status: "killed",
      scoring_components: {
        ...scoring,
        editorial: { ...editorial, unpublishReason: "manual", unpublishedAt: now },
      },
    };
  }

  const { data: updated, error: updateError } = await admin
    .from("deals")
    .update(update)
    .eq("id", body.id)
    .select("id, title, category_id, expires_at, status, scoring_components")
    .single();
  if (updateError) return NextResponse.json({ error: updateError.message }, { status: 500 });
  return NextResponse.json({ ok: true, deal: updated });
}
