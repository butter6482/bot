import { NextResponse } from "next/server";
import { analyze } from "@/lib/analysis";
import { handle, requireUser } from "@/lib/api";
import { loadAccounts } from "@/lib/data";

export const GET = handle(async () => {
  const { supabase } = await requireUser();
  const data = await loadAccounts(supabase);
  const followers = data.accounts.filter((a) => a.followsMe).map((a) => a.username);
  const following = data.accounts.filter((a) => a.iFollow).map((a) => a.username);
  const stats = analyze(followers, following);
  return NextResponse.json({
    importId: data.importId,
    importedAt: data.importedAt,
    accounts: data.accounts,
    stats: {
      followers: stats.totalFollowers,
      following: stats.totalFollowing,
      mutual: stats.mutual.length,
      notFollowingBack: stats.notFollowingBack.length,
      followersNotFollowedBack: stats.followersNotFollowedBack.length,
    },
  });
});
