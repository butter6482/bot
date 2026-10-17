import { NextResponse } from "next/server";
import { z } from "zod";
import { HttpError, handle, parseBody, requireUser } from "@/lib/api";
import { createAdminClient } from "@/lib/supabase/admin";

/** Permanently deletes the signed-in user. All user data cascades via foreign keys. */
export const DELETE = handle(async (req) => {
  const { supabase, user } = await requireUser();
  await parseBody(req, z.object({ confirm: z.literal("DELETE") }));

  const admin = createAdminClient();
  const { error } = await admin.auth.admin.deleteUser(user.id);
  if (error) {
    console.error("[account] delete failed", error.message);
    throw new HttpError(500, "Could not delete the account.");
  }
  await supabase.auth.signOut();
  return NextResponse.json({ ok: true });
});
