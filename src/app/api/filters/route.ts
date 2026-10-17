import { NextResponse } from "next/server";
import { z } from "zod";
import { HttpError, dbError, handle, parseBody, requireUser } from "@/lib/api";
import { filtersSchema } from "@/lib/filters";

export const GET = handle(async () => {
  const { supabase } = await requireUser();
  const { data, error } = await supabase
    .from("saved_filters")
    .select("id,name,filters")
    .order("created_at", { ascending: false });
  dbError(error);
  // Re-validate stored JSON so old/edited rows can never inject unknown flags.
  const presets = (data ?? []).flatMap((r) => {
    const p = filtersSchema.safeParse(r.filters);
    return p.success ? [{ id: r.id as string, name: r.name as string, filters: p.data }] : [];
  });
  return NextResponse.json({ presets });
});

export const POST = handle(async (req) => {
  const { supabase, user } = await requireUser();
  const body = await parseBody(req, z.object({ name: z.string().trim().min(1).max(80), filters: filtersSchema }));
  const { data, error } = await supabase
    .from("saved_filters")
    .insert({ user_id: user.id, name: body.name, filters: body.filters })
    .select("id")
    .single();
  dbError(error);
  return NextResponse.json({ id: data!.id }, { status: 201 });
});

export const DELETE = handle(async (req) => {
  const { supabase } = await requireUser();
  const id = z.string().uuid().safeParse(new URL(req.url).searchParams.get("id"));
  if (!id.success) throw new HttpError(400, "Invalid id.");
  const { error } = await supabase.from("saved_filters").delete().eq("id", id.data);
  dbError(error);
  return NextResponse.json({ ok: true });
});
