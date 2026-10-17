import { NextResponse } from "next/server";
import { z } from "zod";
import { dbError, handle, parseBody, requireUser } from "@/lib/api";
import { categorySchema } from "@/lib/classification";
import { isValidUsername } from "@/lib/instagram/username";

const username = z.string().refine(isValidUsername, "Invalid username");

const tagSchema = z.object({
  usernames: z.array(username).min(1).max(2000),
  kind: z.enum(["favorite", "friend", "protected"]),
  enabled: z.boolean(),
});

/** Add or remove protection tags (favorite / friend / protected) for many accounts at once. */
export const POST = handle(async (req) => {
  const { supabase, user } = await requireUser();
  const body = await parseBody(req, tagSchema);
  const unique = [...new Set(body.usernames)];

  if (body.enabled) {
    const { error } = await supabase
      .from("protected_accounts")
      .upsert(unique.map((u) => ({ user_id: user.id, username: u, kind: body.kind })), {
        onConflict: "user_id,username,kind",
      });
    dbError(error);
  } else {
    const { error } = await supabase
      .from("protected_accounts")
      .delete()
      .eq("kind", body.kind)
      .in("username", unique);
    dbError(error);
  }
  return NextResponse.json({ ok: true, count: unique.length });
});

const classifySchema = z.object({
  usernames: z.array(username).min(1).max(2000),
  /** null removes the manual override. */
  category: categorySchema.nullable(),
});

/** Manual classification override — always wins over AI results. */
export const PUT = handle(async (req) => {
  const { supabase, user } = await requireUser();
  const body = await parseBody(req, classifySchema);
  const unique = [...new Set(body.usernames)];

  if (body.category === null) {
    const { error } = await supabase
      .from("account_classifications")
      .delete()
      .eq("source", "manual")
      .in("username", unique);
    dbError(error);
  } else {
    const { error } = await supabase.from("account_classifications").upsert(
      unique.map((u) => ({
        user_id: user.id,
        username: u,
        category: body.category,
        confidence: null,
        source: "manual",
        reason: "Set manually",
        updated_at: new Date().toISOString(),
      })),
      { onConflict: "user_id,username" },
    );
    dbError(error);
  }
  return NextResponse.json({ ok: true, count: unique.length });
});
