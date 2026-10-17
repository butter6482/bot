import { NextResponse } from "next/server";
import { z } from "zod";
import { HttpError, dbError, handle, parseBody, requireUser } from "@/lib/api";
import { fetchAll } from "@/lib/data";

export const GET = handle(async (req) => {
  const { supabase } = await requireUser();
  const batchId = z.string().uuid().safeParse(new URL(req.url).searchParams.get("batch"));
  if (!batchId.success) throw new HttpError(400, "Invalid batch id.");

  const { data: batch, error } = await supabase
    .from("review_batches")
    .select("id,name,command,filters,total,created_at")
    .eq("id", batchId.data)
    .maybeSingle();
  dbError(error);
  if (!batch) throw new HttpError(404, "Batch not found.");

  const items = await fetchAll<{
    id: string;
    username: string;
    category: string;
    reason: string | null;
    status: string;
    position: number;
  }>((from, to) =>
    supabase
      .from("review_items")
      .select("id,username,category,reason,status,position")
      .eq("batch_id", batchId.data)
      .order("position")
      .range(from, to),
  );
  return NextResponse.json({ batch, items });
});

const patchSchema = z.object({
  ids: z.array(z.string().uuid()).min(1).max(1000),
  status: z.enum(["pending", "reviewed", "keep", "skipped"]),
});

/**
 * Records the user's own review progress. "reviewed" means the user says they handled the
 * account on Instagram — the app cannot and does not verify or perform the unfollow itself.
 */
export const PATCH = handle(async (req) => {
  const { supabase } = await requireUser();
  const body = await parseBody(req, patchSchema);
  const { error } = await supabase
    .from("review_items")
    .update({ status: body.status, updated_at: new Date().toISOString() })
    .in("id", body.ids);
  dbError(error);
  return NextResponse.json({ ok: true });
});
