import { NextResponse } from "next/server";
import { z } from "zod";
import { analyze } from "@/lib/analysis";
import { dbError, handle, parseBody, requireUser } from "@/lib/api";
import { normalizeMany } from "@/lib/instagram/username";

const MAX_USERNAMES = 100_000;

const bodySchema = z.object({
  label: z.string().trim().max(80).optional(),
  sourceFiles: z.array(z.string().max(200)).max(50).default([]),
  followers: z.array(z.string().max(200)).max(MAX_USERNAMES),
  following: z.array(z.string().max(200)).max(MAX_USERNAMES),
});

export const GET = handle(async () => {
  const { supabase } = await requireUser();
  const { data, error } = await supabase
    .from("instagram_imports")
    .select("id,label,followers_count,following_count,created_at,source_files")
    .order("created_at", { ascending: false });
  dbError(error);
  return NextResponse.json({ imports: data });
});

export const POST = handle(async (req) => {
  const { supabase, user } = await requireUser();
  const body = await parseBody(req, bodySchema);

  // Never trust the client: normalize and de-duplicate again on the server.
  const followers = normalizeMany(body.followers).usernames;
  const following = normalizeMany(body.following).usernames;
  if (followers.length === 0 && following.length === 0) {
    return NextResponse.json({ error: "No valid usernames found." }, { status: 400 });
  }
  const analysis = analyze(followers, following);

  const { data: imp, error } = await supabase
    .from("instagram_imports")
    .insert({
      user_id: user.id,
      label: body.label || null,
      source_files: body.sourceFiles,
      followers_count: analysis.totalFollowers,
      following_count: analysis.totalFollowing,
    })
    .select("id")
    .single();
  dbError(error);

  const followerSet = new Set(followers);
  const followingSet = new Set(following);
  const all = [...new Set([...followers, ...following])];
  const rows = all.map((username) => ({
    user_id: user.id,
    import_id: imp!.id,
    username,
    is_follower: followerSet.has(username),
    is_following: followingSet.has(username),
  }));

  for (let i = 0; i < rows.length; i += 1000) {
    const { error: insErr } = await supabase.from("instagram_accounts").insert(rows.slice(i, i + 1000));
    if (insErr) {
      // Roll back the partial import (accounts cascade).
      await supabase.from("instagram_imports").delete().eq("id", imp!.id);
      dbError(insErr);
    }
  }

  return NextResponse.json(
    {
      id: imp!.id,
      totals: {
        followers: analysis.totalFollowers,
        following: analysis.totalFollowing,
        mutual: analysis.mutual.length,
        notFollowingBack: analysis.notFollowingBack.length,
        followersNotFollowedBack: analysis.followersNotFollowedBack.length,
      },
    },
    { status: 201 },
  );
});

export const DELETE = handle(async (req) => {
  const { supabase } = await requireUser();
  const id = new URL(req.url).searchParams.get("id");
  const parsed = z.string().uuid().safeParse(id);
  if (!parsed.success) return NextResponse.json({ error: "Invalid id." }, { status: 400 });
  const { error } = await supabase.from("instagram_imports").delete().eq("id", parsed.data);
  dbError(error);
  return NextResponse.json({ ok: true });
});
