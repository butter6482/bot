import { NextResponse } from "next/server";
import { z } from "zod";
import { HttpError, dbError, handle, parseBody, requireUser } from "@/lib/api";
import { loadAccounts } from "@/lib/data";
import { filtersSchema } from "@/lib/filters";
import { isValidUsername } from "@/lib/instagram/username";
import { computeSelection, validateSelection } from "@/lib/selection";

const createSchema = z.object({
  name: z.string().trim().min(1).max(80),
  command: z.string().max(500).optional(),
  filters: filtersSchema,
  usernames: z.array(z.string().refine(isValidUsername)).min(1).max(10_000),
  /** Uncertain accounts the user explicitly reviewed and chose to include. */
  includeUncertain: z.array(z.string().refine(isValidUsername)).max(10_000).default([]),
});

export const GET = handle(async () => {
  const { supabase } = await requireUser();
  const { data: batches, error } = await supabase
    .from("review_batches")
    .select("id,name,command,total,created_at")
    .order("created_at", { ascending: false });
  dbError(error);

  const withProgress = await Promise.all(
    (batches ?? []).map(async (b) => {
      const { count } = await supabase
        .from("review_items")
        .select("id", { count: "exact", head: true })
        .eq("batch_id", b.id)
        .neq("status", "pending");
      return { ...b, done: count ?? 0 };
    }),
  );
  return NextResponse.json({ batches: withProgress });
});

/** Approves a selection: the server recomputes eligibility and keeps only valid usernames. */
export const POST = handle(async (req) => {
  const { supabase, user } = await requireUser();
  const body = await parseBody(req, createSchema);

  const data = await loadAccounts(supabase);
  if (!data.importId) throw new HttpError(400, "Import your Instagram data first.");

  const result = computeSelection(data.accounts, body.filters);
  const { accepted, rejected } = validateSelection(
    body.usernames,
    result,
    new Set(body.includeUncertain),
  );
  if (accepted.length === 0) throw new HttpError(400, "None of the selected accounts are eligible.");

  const byName = new Map(result.decisions.map((d) => [d.username, d]));

  const { data: batch, error } = await supabase
    .from("review_batches")
    .insert({
      user_id: user.id,
      import_id: data.importId,
      name: body.name,
      command: body.command ?? null,
      filters: body.filters,
      total: accepted.length,
    })
    .select("id")
    .single();
  dbError(error);

  const items = accepted.map((username, i) => ({
    batch_id: batch!.id,
    user_id: user.id,
    username,
    category: byName.get(username)?.category ?? "unknown",
    reason: byName.get(username)?.reasons.join("; ") ?? null,
    position: i,
  }));
  for (let i = 0; i < items.length; i += 1000) {
    const { error: itemErr } = await supabase.from("review_items").insert(items.slice(i, i + 1000));
    if (itemErr) {
      await supabase.from("review_batches").delete().eq("id", batch!.id);
      dbError(itemErr);
    }
  }
  return NextResponse.json({ id: batch!.id, total: accepted.length, rejected: rejected.length }, { status: 201 });
});

export const DELETE = handle(async (req) => {
  const { supabase } = await requireUser();
  const id = z.string().uuid().safeParse(new URL(req.url).searchParams.get("id"));
  if (!id.success) throw new HttpError(400, "Invalid id.");
  const { error } = await supabase.from("review_batches").delete().eq("id", id.data);
  dbError(error);
  return NextResponse.json({ ok: true });
});
